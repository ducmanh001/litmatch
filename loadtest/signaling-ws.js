/**
 * Load test cho Signaling Gateway (Socket.IO, namespace `/signaling`) — Giai đoạn 6 roadmap.
 *
 * ============================================================================================
 * GIỚI HẠN QUAN TRỌNG — ĐỌC TRƯỚC KHI DÙNG KẾT QUẢ:
 * k6 (`k6/ws`, và cả `k6/experimental/websockets`) chỉ nói chuyện WebSocket RAW theo chuẩn W3C,
 * KHÔNG có client Socket.IO/Engine.IO built-in. Socket.IO không phải WebSocket thuần — nó có
 * framing riêng 2 lớp (Engine.IO transport packet + Socket.IO packet lồng bên trong), cộng thêm
 * cơ chế ping/pong do SERVER khởi xướng để giữ kết nối sống.
 *
 * Script này TỰ VIẾT TAY phần framing đó theo đặc tả công khai của Engine.IO v4 / Socket.IO v4
 * (packet type: Engine.IO 0=open,1=close,2=ping,3=pong,4=message; Socket.IO lồng trong message
 * 0=CONNECT,1=DISCONNECT,2=EVENT,4=CONNECT_ERROR) — ĐÂY LÀ BEST-EFFORT, CHƯA ĐƯỢC CHẠY THỬ THẬT
 * với 1 signaling-gateway đang sống (môi trường viết script này không có k6 binary lẫn server
 * đang chạy để verify). Trước khi tin kết quả: chạy thử với `k6 run --http-debug` hoặc bật log
 * ở signaling-gateway, xác nhận đúng chuỗi packet trao đổi (đặc biệt bước CONNECT namespace và
 * ping/pong) rồi mới dùng số liệu cho quyết định capacity thật.
 *
 * NẾU framing này sai hoặc không tương thích version Socket.IO server đang dùng: đừng cố sửa vá
 * bằng đoán mò — chuyển sang **Artillery + `artillery-engine-socketio-v3`**, có client Socket.IO
 * thật (không tự viết tay framing). Xem sketch config ở `loadtest/signaling-ws.artillery.yml` +
 * hướng dẫn trong `loadtest/README.md`.
 * ============================================================================================
 *
 * Xác nhận từ code thật (không đoán):
 * - apps/signaling-gateway/src/app/signaling.gateway.ts: `@WebSocketGateway({ namespace: '/signaling' })`,
 *   xác thực qua `client.handshake.auth.token` (JWT, cùng JWT_SECRET với core-api), payload
 *   `{ sub, isGuest }`. Không emit sự kiện chào mừng sau connect — chỉ tự join room `user:{userId}`.
 * - Socket.IO server mặc định phục vụ MỌI namespace qua CÙNG 1 đường dẫn HTTP `/socket.io/`
 *   (namespace routing nằm trong packet CONNECT của Socket.IO, không phải path HTTP) — do đó URL
 *   kết nối WebSocket là `${SIGNALING_URL}/socket.io/?EIO=4&transport=websocket`, không phải
 *   `${SIGNALING_URL}/signaling`.
 * - Access token lấy qua POST /api/v1/auth/guest ở core-api (BASE_URL_CORE) — dùng chung
 *   deviceId ngẫu nhiên như loadtest/matching-queue.js.
 *
 * Chạy: k6 run -e BASE_URL_CORE=http://localhost:3000 -e SIGNALING_URL=ws://localhost:3001 \
 *   loadtest/signaling-ws.js
 * Biến môi trường: BASE_URL_CORE, SIGNALING_URL, VUS (mặc định 50), DURATION (mặc định 2m),
 *   HOLD_SECONDS (giữ kết nối bao lâu trước khi đóng chủ động, mặc định 20 — nên < pingTimeout
 *   mặc định Engine.IO ~20s trừ khi script trả pong đúng hạn, script này CÓ trả pong).
 */
import ws from 'k6/ws';
import http from 'k6/http';
import { check } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL_CORE = __ENV.BASE_URL_CORE || 'http://localhost:3000';
const SIGNALING_URL = __ENV.SIGNALING_URL || 'ws://localhost:3001';
const HOLD_SECONDS = Number(__ENV.HOLD_SECONDS || 20);

export const options = {
  scenarios: {
    signaling_ws: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 50),
      duration: __ENV.DURATION || '2m',
    },
  },
  thresholds: {
    // Ngưỡng khởi điểm, chưa phải SLO thật — xem README.
    ws_connecting: ['p(95)<1000'],
    socketio_connect_ack_latency: ['p(95)<1500'],
    connection_drop_rate: ['rate<0.05'],
  },
};

const connectAckLatency = new Trend('socketio_connect_ack_latency', true);
const dropRate = new Rate('connection_drop_rate');
const authFailRate = new Rate('auth_fail_rate');

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function guestLogin() {
  const deviceId = `loadtest-ws-${__VU}-${uuidv4()}`;
  const res = http.post(
    `${BASE_URL_CORE}/api/v1/auth/guest`,
    JSON.stringify({ deviceId }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (res.status !== 200 && res.status !== 201) return null;
  return JSON.parse(res.body).data.accessToken;
}

export default function () {
  const token = guestLogin();
  if (!token) {
    dropRate.add(1);
    return;
  }

  const url = `${SIGNALING_URL}/socket.io/?EIO=4&transport=websocket`;
  let connectSentAt = 0;
  let gotConnectAck = false;
  let holdTimer = null;

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', function () {
      // Chờ Engine.IO gửi packet "0{...}" (open) trước — client KHÔNG chủ động nói trước ở
      // transport websocket-only handshake (khác polling handshake dùng HTTP GET trước).
    });

    socket.on('message', function (data) {
      if (typeof data !== 'string' || data.length === 0) return;
      const engineIoType = data[0];

      if (engineIoType === '0') {
        // Engine.IO OPEN — server gửi {sid, pingInterval, pingTimeout, ...}. Sau bước này gửi
        // Socket.IO CONNECT packet cho namespace /signaling kèm auth token.
        connectSentAt = Date.now();
        socket.send(`40/signaling,${JSON.stringify({ token })}`);
        return;
      }

      if (engineIoType === '2') {
        // Engine.IO PING từ server — PHẢI trả PONG ngay, không thì server đóng kết nối sau
        // pingTimeout. Đây là lý do phải tự cài ping/pong khi không dùng client Socket.IO thật.
        socket.send('3');
        return;
      }

      if (engineIoType === '4') {
        // Engine.IO MESSAGE bọc Socket.IO packet bên trong: "4" + socketio-type + [nsp,] + data
        const socketIoType = data[1];
        if (socketIoType === '0' && !gotConnectAck) {
          // "40/signaling,{...}" — CONNECT ack thành công cho namespace /signaling
          gotConnectAck = true;
          connectAckLatency.add(Date.now() - connectSentAt);
        } else if (socketIoType === '4') {
          // "44/signaling,{...}" — CONNECT_ERROR (vd token invalid/hết hạn)
          authFailRate.add(1);
          socket.close();
        }
      }
    });

    socket.on('close', function () {
      if (!gotConnectAck) dropRate.add(1);
      else dropRate.add(0);
    });

    socket.on('error', function () {
      dropRate.add(1);
    });

    // Giữ kết nối HOLD_SECONDS rồi chủ động đóng — mô phỏng client giữ session realtime.
    holdTimer = socket.setTimeout(function () {
      socket.close();
    }, HOLD_SECONDS * 1000);
  });

  check(res, { 'websocket upgrade 101': (r) => r && r.status === 101 });
}
