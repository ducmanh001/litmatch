#!/usr/bin/env bash
# Litmatch — LiveKit media load test cho Party Room (Giai đoạn 7 roadmap: "Benchmark LiveKit
# bằng profile Party Room production, đặt SLO/headroom và cảnh báo theo node").
#
# KHÁC BẢN CHẤT với matching-queue.js/calling-flow.js/signaling-ws.js trong thư mục này: 3 script
# đó dùng k6 gọi HTTP/WebSocket, không mở kết nối WebRTC thật nên KHÔNG đo được tải media (audio
# publish/subscribe, RTP forwarding, CPU của SFU). k6 không có client WebRTC. LiveKit cung cấp
# sẵn công cụ đúng việc này: `lk load-test` (LiveKit CLI hợp nhất, https://github.com/livekit/livekit-cli;
# tên binary cũ hơn là `livekit-cli`) — mở kết nối client thật (Go SDK) publish/subscribe track
# thật vào 1 room thật trên 1 LiveKit server thật.
#
# CHƯA TỪNG CHẠY: môi trường viết script này không có LiveKit server thật đang sống (chỉ có cấu
# hình dev trong apps/media-server/) và cũng chưa có `lk`/`livekit-cli` cài sẵn để thử — script đã
# đối chiếu cẩn thận flag với README chính thức của livekit-cli (xác nhận qua fetch tài liệu
# https://github.com/livekit/livekit-cli và https://docs.livekit.io/transport/self-hosting/benchmark/
# lúc viết), nhưng CHƯA từng benchmark thật. Chạy thử ở máy có `lk` cài sẵn + LiveKit server thật
# (dev docker-compose hoặc staging) trước khi tin số liệu — đúng tinh thần loadtest/README.md.
#
# ## Vì sao chọn các con số này (profile "Party Room production")
#
# Nguồn số liệu — đọc trực tiếp cấu hình/service thật, không đoán:
#   - `PARTY_MAX_MEMBERS=100` (mặc định) — .env.example:118, validate ở
#     apps/core-api/src/config/env.validation.ts:233 (`Joi.number().integer().min(2).default(100)`).
#     Đây là giới hạn CỨNG tổng số thành viên 1 phòng (host + speaker + audience), enforce ở
#     `PartyRoomService` (apps/core-api/src/modules/party-room/party-room.service.ts:211).
#   - `PARTY_MAX_SPEAKERS=8` (mặc định) — .env.example:116, validate ở env.validation.ts:231.
#     Giới hạn CỨNG số speaker (không tính host — host luôn publish mặc định, không chiếm slot
#     speaker, xem comment tại party-room.service.ts:376). Enforce dưới lock FOR UPDATE khi promote
#     role (party-room.service.ts:382).
#   - Audio-only: đã grep toàn bộ module party-room + calling — KHÔNG có bất kỳ tham chiếu nào tới
#     video/camera/track loại video (VideoGrant chỉ có `canPublish`/`canSubscribe`/`canPublishData`,
#     xem apps/core-api/src/modules/party-room/ports/livekit-party-room.ts:39-44,104-123). Litmatch
#     Party Room hiện tại là voice-only — không dùng --video-publishers.
#   - Publisher = 1 host (luôn canPublish=true) + tối đa PARTY_MAX_SPEAKERS speaker → tối đa 9
#     publisher đồng thời trong 1 phòng ở cấu hình mặc định.
#   - Subscriber = phần còn lại của PARTY_MAX_MEMBERS (audience, canPublish=false, canSubscribe=
#     true) → tối đa 91 subscriber ở cấu hình mặc định. (Audience còn canPublishData=true cho
#     chat/reaction qua data channel — `lk load-test` không mô phỏng kênh data tuỳ ý, nên phần này
#     KHÔNG được đo bởi script — ghi nhận là điểm mù, không phải bỏ sót.)
#
# Đây là profile "chạm trần cấu hình" (worst case theo giới hạn cứng hiện tại), đúng tinh thần
# docs/03-architecture.md § 3.5/§ 3.8.A: "Party Room phải giữ cap cứng cho tới khi có bằng chứng
# tải" — mục đích chạy load test này chính là để có bằng chứng đó, xác nhận 1 node có tải nổi 1
# phòng đầy tải mặc định hay không trước khi cân nhắc nới PARTY_MAX_MEMBERS/PARTY_MAX_SPEAKERS.
#
# ## Cách chạy (cần LiveKit server thật — dev docker-compose hoặc staging, MÔI TRƯỜNG NÀY CHƯA CÓ)
#
#   # 1. Cài lk (xem https://github.com/livekit/livekit-cli#installation) — không cài trong task
#   #    này theo giới hạn quyền của agent (không có quyền cài binary hệ thống).
#   # 2. Có LiveKit server thật đang chạy (vd `docker compose -f apps/media-server/docker-compose.yml
#   #    up -d` cho dev, hoặc staging LiveKit thật — repo này CHƯA có môi trường staging LiveKit
#   #    triển khai, k8s/base/media-server/ mới chỉ là manifest, chưa apply lên cluster thật).
#   # 3. Chạy:
#   LIVEKIT_URL=ws://localhost:7880 \
#   LIVEKIT_API_KEY=devkey \
#   LIVEKIT_API_SECRET=devsecret_change_me_0123456789abcdef \
#     ./loadtest/party-room-livekit.sh
#
# Đo gì: `lk load-test` tự in ra cuối lần chạy — bytes/s và packets/s in/out, số track publish/
# subscribe thành công, và (nếu trỏ Prometheus vào prometheus_port của LiveKit — xem
# apps/media-server/livekit.yaml) CPU/room/participant per-node observe qua
# k8s/base/media-server/prometheus-alerts.yaml. Đối chiếu kết quả với ngưỡng ở
# loadtest/party-room-slo.yaml — ngưỡng đó cũng CHƯA được xác nhận bằng số liệu thật, chỉ là mục
# tiêu khởi điểm.

set -euo pipefail

# --- Tìm binary: bản mới tên `lk`, bản cũ hơn tên `livekit-cli` (cùng tool, đổi tên khi gộp CLI) ---
LK_BIN="${LK_BIN:-}"
if [[ -z "${LK_BIN}" ]]; then
  if command -v lk >/dev/null 2>&1; then
    LK_BIN="lk"
  elif command -v livekit-cli >/dev/null 2>&1; then
    LK_BIN="livekit-cli"
  else
    echo "Không tìm thấy 'lk' hoặc 'livekit-cli' trong PATH." >&2
    echo "Cài theo hướng dẫn: https://github.com/livekit/livekit-cli#installation" >&2
    exit 1
  fi
fi

# --- Bắt buộc: thông tin LiveKit server thật (không có giá trị mặc định — không đoán host thật) ---
: "${LIVEKIT_URL:?Cần LIVEKIT_URL (vd ws://localhost:7880 cho dev, hoặc wss://... cho staging thật)}"
: "${LIVEKIT_API_KEY:?Cần LIVEKIT_API_KEY}"
: "${LIVEKIT_API_SECRET:?Cần LIVEKIT_API_SECRET}"

# --- Profile Party Room — override qua env nếu muốn thử cấu hình khác cấu hình mặc định ---
# Khớp PARTY_MAX_MEMBERS/PARTY_MAX_SPEAKERS thật (nguồn: xem comment ở đầu file).
PARTY_MAX_MEMBERS="${PARTY_MAX_MEMBERS:-100}"
PARTY_MAX_SPEAKERS="${PARTY_MAX_SPEAKERS:-8}"
PUBLISHERS=$((PARTY_MAX_SPEAKERS + 1)) # + host
SUBSCRIBERS=$((PARTY_MAX_MEMBERS - PUBLISHERS))

if (( SUBSCRIBERS < 0 )); then
  echo "PARTY_MAX_SPEAKERS + 1 (host) vượt PARTY_MAX_MEMBERS — kiểm tra lại 2 biến này." >&2
  exit 1
fi

ROOM_NAME="${ROOM_NAME:-party-loadtest-$(date +%s)}"
DURATION="${DURATION:-5m}"
# Ramp-up: số participant join thêm mỗi giây — 5/s nghĩa là phòng đầy ~20s, mô phỏng phòng đông
# dần chứ không phải 100 client cùng bấm join 1 khoảnh khắc; đây là PHỎNG ĐOÁN hợp lý, không phải
# số đo được từ traffic thật — chỉnh lại khi có dữ liệu production về tốc độ phòng đông lên thật.
RAMP_PER_SECOND="${RAMP_PER_SECOND:-5}"

echo "== Party Room LiveKit load test =="
echo "Binary:        ${LK_BIN}"
echo "Room:          ${ROOM_NAME}"
echo "Publishers:    ${PUBLISHERS} (1 host + ${PARTY_MAX_SPEAKERS} speaker, audio-only)"
echo "Subscribers:   ${SUBSCRIBERS} (audience, canPublish=false)"
echo "Duration:      ${DURATION}"
echo "Ramp/second:   ${RAMP_PER_SECOND}"
echo

"${LK_BIN}" load-test \
  --url "${LIVEKIT_URL}" \
  --api-key "${LIVEKIT_API_KEY}" \
  --api-secret "${LIVEKIT_API_SECRET}" \
  --room "${ROOM_NAME}" \
  --audio-publishers "${PUBLISHERS}" \
  --subscribers "${SUBSCRIBERS}" \
  --num-per-second "${RAMP_PER_SECOND}" \
  --simulate-speakers \
  --duration "${DURATION}"
