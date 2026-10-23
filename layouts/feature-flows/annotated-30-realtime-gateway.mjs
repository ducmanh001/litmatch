// Realtime gateway ở 10M: kết nối và giữ kết nối. Mỗi socket phải qua ba cửa TRƯỚC khi coi là đã kết nối (JWT, lease slot trên Redis,
// subscribe kênh của chính user) và được gia hạn lease theo LÔ bằng một timer cho cả pod, không phải một timer mỗi socket.
// `src` = bằng chứng của từng comment; engine bỏ qua, verify-annotated.mjs yêu cầu có.
const G = 'apps/signaling-gateway/src/app';
const GW = `${G}/signaling.gateway.ts`;
const CQ = `${G}/connection-quota.service.ts`;
const RF = `${G}/realtime-fanout.ts`;
const LR = `${G}/lease-refresher.ts`;
const AB = `${G}/connection-admission-budget.ts`;
const OB = `${G}/outbound-budget.ts`;
const END_FN = '^  }$';
const END_PROP = '^  };$';

const fn = (anchor) => ({ at: anchor, to: END_FN });
const prop = (anchor) => ({ at: anchor, to: END_PROP });

export const annotatedFeatures = [
  {
    id: '30-realtime-gateway',
    short: 'Realtime gateway',
    title: 'Realtime gateway: kết nối và giữ kết nối',
    summary:
      'Mô hình của repo giả định 10 triệu socket đồng thời (≈ 200 pod ở 50.000 socket/pod, giả định chưa benchmark; cấu hình mặc định hiện giới hạn mỗi process ở 2.000 socket và 64 handshake bất đồng bộ). Ở quy mô đó mỗi socket không được tốn một timer hay một lệnh Redis riêng, mỗi sự kiện không được đánh thức mọi pod, và một socket chậm không được làm đầy bộ nhớ của pod.',
    arch: 'realtime-gateway',
    diagramAnchor: '25-realtime-fanout',
    endpoints: [
      {
        n: '01',
        slug: 'ws-handshake-admit',
        method: 'WS',
        short: 'handshake',
        route: 'socket.io: handshake middleware → connect',
        name: 'Kết nối WebSocket: admission, JWT, lease slot, subscribe theo user',
        title:
          'Giữ chỗ admission (trần socket và trần handshake, không hàng chờ), xác thực JWT, xin lease slot (tối đa N socket/user) trên Redis và SUBSCRIBE kênh của chính user; chỉ khi xong hết mới đăng ký gia hạn lease.',
        flow: '[GATEWAY] → [REDIS] → [GATEWAY]',
        roles: [
          ['GATEWAY', 'Middleware handshake: giữ chỗ admission trước mọi việc nặng, verify JWT, xin lease, subscribe; sự kiện connect: đăng ký lease với bộ gia hạn và vào room của user. Lỗi ở bước sau thì hoàn tác bước trước.'],
          ['REDIS', 'Lease slot + presence trong MỘT script Lua nguyên tử (cùng shard theo userId); fanout theo user: mỗi pod chỉ SUBSCRIBE kênh của user đang có socket trên pod.'],
        ],
        tables: [],
        redis: [
          ['signaling:connection-quota:{userId}', 'sorted set các lease của user: member = leaseId, score = hạn lease (ms); đếm ≤ trần socket/user.'],
          ['presence của user', 'sorted set cùng hạn với lease; xoá khi hết lease nên không có "online giả" quá một TTL.'],
          ['realtime:user:{userId}', 'kênh pub/sub của user; pod chỉ SUBSCRIBE khi có socket của user đó.'],
        ],
        related: [
          ['Gia hạn lease', 'trang kế tiếp: một timer cho cả pod, gia hạn theo lô bằng pipeline.'],
          ['Core API publish', 'core-api publish tới kênh của user theo cùng hàm hash shard (không chép).'],
        ],
        nested: true,
        steps: [
          { at: 'async admit(client: Socket): Promise<void> {', text: 'Middleware handshake: mọi thứ xong TRƯỚC khi socket được coi là đã kết nối' },
          { at: 'const admission = this.admissionBudget.reserve();', text: 'Giữ chỗ (một slot kết nối + một slot handshake) TRƯỚC mọi việc nặng; hết chỗ thì từ chối ngay, không xếp hàng' },
          { at: 'await this.authenticate(client);', text: 'Xác thực JWT trong handshake.auth.token' },
          { at: 'if (!(await this.admitConnection(client, userId))) {', text: 'Xin lease slot của user trên Redis (vượt trần thì từ chối)' },
          { at: 'admitted = await this.connectionQuota.acquire(userId, leaseId);', text: 'Script Lua nguyên tử: dọn lease hết hạn, kiểm trần, ghi lease + presence cùng TTL' },
          { at: 'await this.admitFanout(client, userId);', text: 'SUBSCRIBE kênh Redis của riêng user này TRƯỚC khi handshake xong' },
          { at: 'await fanout.subscribeUser(userId);', text: 'Socket đầu tiên của user trên pod mới thật sự SUBSCRIBE; các socket sau chỉ tăng bộ đếm' },
          { at: 'this.abortQuotaAdmission(client);', text: 'Subscribe lỗi: trả lease ngay vì socket sẽ không bao giờ connect' },
          { at: 'admission.finishHandshake();', text: 'Chỉ nhả slot handshake khi chuỗi JWT/Redis bất đồng bộ đã xong, kể cả khi transport đã đóng giữa chừng' },
          { at: 'handleConnection(client: Socket): void {', text: 'Sự kiện connect (handshake đã xong): đăng ký lease với bộ gia hạn và vào room của user' },
          { at: 'this.refresher?.add(leaseId, userId, () => client.conn.close(true));', text: 'Hết hạn lease mà không gia hạn được thì ĐÓNG transport để client tự reconnect có backoff' },
        ],
        items: [
          {
            tag: 'GATEWAY',
            file: GW,
            dedent: true,
            ranges: [fn('async admit(')],
            inline: [
              {
                at: "client.conn.once('close', cleanup);",
                text: ['Slot kết nối chỉ được nhả khi transport đóng hoặc handshake bị từ chối, qua đúng một hàm cleanup tự gỡ listener của chính nó; nhờ vậy socket chưa bao giờ connect (handshake chưa xong) vẫn không để lại slot.'],
                src: 'admit signaling.gateway.ts (cleanup, data.capacityCleanup) + docs/services/realtime-gateway.md (admission: "Connection reservations are released on rejection, transport close, disconnect and shutdown")',
              },
              {
                at: 'await this.authenticate(client);',
                text: ['Handshake fail closed: JWT sai/thiếu thì ném Unauthorized (client thử làm mới phiên rồi kết nối lại), quota hoặc Redis lỗi thì ném CONNECTION_QUOTA_UNAVAILABLE — client reconnect có backoff, không "mở cửa" cho socket chưa được admit.'],
                src: 'doc admit signaling.gateway.ts + docs/services/realtime-gateway.md § 5',
              },
              {
                at: 'admission.finishHandshake();',
                text: ['Transport đóng không được nhả slot handshake khi việc JWT/Redis bất đồng bộ còn đang chạy: nếu nhả sớm, client reconnect liên tục sẽ lách trần handshake đồng thời trong lúc việc cũ vẫn chiếm Redis.'],
                src: 'comment gốc signaling.gateway.ts (admit, "Transport closure cannot free this slot while JWT/Redis work is still pending") + docs/services/realtime-gateway.md',
              },
            ],
          },
          {
            tag: 'GATEWAY',
            file: AB,
            dedent: true,
            ranges: [fn('reserve(): ConnectionAdmission | undefined {')],
            inline: [
              {
                at: 'this.closed ||',
                text: ['Hai trần hữu hạn và KHÔNG có hàng chờ: socket đã xác thực cộng socket đang chờ tối đa WS_MAX_CONNECTIONS_PER_PROCESS (mặc định 2.000) và handshake bất đồng bộ tối đa WS_MAX_CONCURRENT_HANDSHAKES (mặc định 64). Hết chỗ thì từ chối ngay bằng lỗi có thể thử lại CONNECTION_QUOTA_UNAVAILABLE để client giữ backoff có jitter và REST dự phòng. Hai số này là điểm khởi đầu thận trọng, chưa phải năng lực đã đo.'],
                src: 'doc class ConnectionAdmissionBudget ("No queue: reserve before asynchronous JWT/Redis work, then fail fast when full") + docs/services/realtime-gateway.md (admission, "conservative starting limits, not measured socket capacity")',
              },
            ],
          },
          {
            tag: 'GATEWAY',
            file: GW,
            dedent: true,
            ranges: [fn('private async admitConnection(')],
            inline: [
              {
                at: 'admitted = await this.connectionQuota.acquire(userId, leaseId);',
                text: ['[REDIS] Lỗi/timeout ở đây có thể xảy ra SAU khi script đã chạy phía Redis (lease đã được cấp mà ta không biết) nên luôn thử release; nếu Redis quá tệ thì TTL của lease là lưới an toàn cuối.'],
                src: 'comment gốc signaling.gateway.ts (admitConnection, "The acquire may have executed server-side…")',
              },
            ],
          },
          {
            tag: 'REDIS',
            file: CQ,
            dedent: true,
            ranges: [fn('async acquire(')],
          },
          {
            tag: 'GATEWAY',
            file: GW,
            dedent: true,
            ranges: [fn('private abortQuotaAdmission(')],
          },
          {
            tag: 'GATEWAY',
            file: GW,
            dedent: true,
            ranges: [fn('private async admitFanout(')],
            inline: [
              {
                at: 'data.fanoutUserId = userId;',
                text: ['Đặt cờ TRƯỚC khi await: transport đóng trong lúc chờ Redis vẫn thấy cờ và hoàn tác được; mỗi socket giữ quyền sở hữu đúng một lần đếm để đóng giữa chừng không làm giảm đếm hai lần (mất subscription của socket khác cùng user).'],
                src: 'comment gốc signaling.gateway.ts (admitFanout) + doc subscribeUser realtime-fanout.ts',
              },
            ],
          },
          {
            tag: 'REDIS',
            file: RF,
            dedent: true,
            ranges: [fn('async subscribeUser('), fn('private requestSubscription(')],
            inline: [
              {
                at: 'if (entry.failed || !shard.ready || shard.redis.status !== ',
                text: ['Promise cũ đã resolve từ trước một lần Redis mất kết nối: subscription thật có thể không còn. SUBSCRIBE idempotent nên gửi lại; reject khi connection còn đứt (offline queue tắt) và handshake fail closed đúng như socket đầu tiên.'],
                src: 'comment gốc realtime-fanout.ts (subscribeUser)',
              },
              {
                at: 'const attempt = shard.redis',
                text: ['Ghi kết quả vào entry; chỉ lần gửi MỚI NHẤT được tính là trạng thái của entry. Promise đã reject không bao giờ được await lại như "đã sẵn sàng".'],
                src: 'doc requestSubscription realtime-fanout.ts + commit c52e715 (plan § 10 / C18)',
              },
            ],
          },
          {
            tag: 'GATEWAY',
            file: GW,
            dedent: true,
            ranges: [fn('handleConnection('), fn('private trackLease(')],
            inline: [
              {
                at: 'this.refresher?.add(leaseId, userId, () => client.conn.close(true));',
                text: ['Lease hết hạn mà không gia hạn được: ĐÓNG transport thay vì client.disconnect(true). disconnect gửi DISCONNECT cuối cùng của namespace nên client không tự kết nối lại; đóng transport thì Socket.IO tự reconnect với backoff của client.'],
                src: 'comment gốc signaling.gateway.ts (trackLease, "A transient lease failure must close the transport…")',
              },
            ],
          },
          {
            tag: 'REDIS',
            file: CQ,
            dedent: true,
            ranges: [{ at: 'const ACQUIRE_SCRIPT = `', to: '^`;$' }],
          },
        ],
      },
      {
        n: '02',
        slug: 'job-lease-refresh-tick',
        method: 'JOB',
        short: 'lease refresh',
        route: 'LeaseRefresher.tick (mỗi giây, một timer cho cả pod)',
        name: 'Gia hạn lease theo lô',
        title:
          'Mỗi giây gom các lease đến hạn của cả pod thành vài pipeline, thử cấp lại lease Redis báo mất, nhả lease cho socket đã ngắt, ngắt socket chỉ khi không còn chứng minh được lease.',
        flow: '[GATEWAY] → [REDIS] → [GATEWAY]',
        roles: [
          ['GATEWAY', 'Một timer cho cả pod: chọn lease đến hạn, áp kết quả, ngắt socket hết hạn (quét hạn độc lập với việc chờ Redis).'],
          ['REDIS', 'Pipeline EVALSHA theo shard (tối đa 500 lệnh/pipeline): gia hạn, cấp lại, nhả.'],
        ],
        tables: [],
        redis: [
          ['signaling:connection-quota:{userId}', 'sorted set lease; gia hạn cập nhật score (hạn mới), cấp lại chỉ khi còn slot.'],
        ],
        related: [
          ['Kết nối WebSocket', 'trang trước: acquire lease lúc handshake và đăng ký lease với bộ gia hạn.'],
        ],
        nested: true,
        steps: [
          { at: 'async tick(): Promise<void> {', text: 'Một tick (mỗi giây) cho TOÀN BỘ socket của pod; không bao giờ chạy chồng nhau' },
          { at: 'if (entry.nextRefreshAt > startedAt) continue;', text: 'Chọn các lease đã đến hạn gia hạn (tối đa maxBatch)' },
          { at: 'outcomes = await this.options.quota.refreshMany(', text: 'Gia hạn cả lô bằng pipeline EVALSHA theo shard' },
          { at: 'const reacquired = await this.recoverLost(due, outcomes);', text: 'Lease "lost" chưa chắc là hết quyền: thử CẤP LẠI trước khi ngắt socket' },
          { at: 'this.apply(due, outcomes, reacquired, startedAt);', text: 'Áp kết quả cho từng lease: ok thì gia hạn, lost hoặc hết biên an toàn thì ngắt, error thì thử lại dày hơn' },
          { at: "if (reacquired.has(index) || outcomes[index] === 'error') {", text: 'Socket đã ngắt trong lúc chờ nhưng lô vẫn cấp/gia hạn: nhả lease để không còn slot ma' },
          { at: 'entry.nextRefreshAt = Math.min(', text: 'Lần thử kế tiếp không được muộn hơn mốc ngắt' },
        ],
        items: [
          {
            tag: 'GATEWAY',
            file: LR,
            dedent: true,
            ranges: [fn('async tick(')],
            inline: [
              {
                at: 'outcomes = await this.options.quota.refreshMany(',
                text: ['Một timer + vài pipeline thay cho một setInterval và một lệnh Redis mỗi socket. Ở 50.000 socket/pod đó là 50.000 timer và 50.000 round trip mỗi chu kỳ; pha gia hạn được rải đều (jitter) để không dồn thành đợt sau một lần reconnect hàng loạt.'],
                src: 'doc class LeaseRefresher lease-refresher.ts',
              },
            ],
          },
          {
            tag: 'GATEWAY',
            file: LR,
            dedent: true,
            ranges: [fn('private async recoverLost(')],
            inline: [
              {
                at: 'const reacquire = this.options.quota.reacquireMany;',
                text: ['Redis restart hoặc failover mất dữ liệu làm MỌI lease biến mất cùng lúc: ngắt hết socket khi đó là biến sự cố Redis thành reconnect storm. Cấp lại idempotent theo leaseId và kiểm trần nên chỉ cấp lại khi slot còn trống; hết slot thì vẫn lost và socket bị ngắt.'],
                src: 'doc reacquireMany connection-quota.service.ts + doc class LeaseRefresher',
              },
            ],
          },
          {
            tag: 'GATEWAY',
            file: LR,
            dedent: true,
            ranges: [fn('private apply(')],
            inline: [
              {
                at: "if (reacquired.has(index) || outcomes[index] === 'error') {",
                text: ['Socket ngắt và gateway đã release TRƯỚC khi lô của nó chạy mà lô vẫn cấp một lease không ai giữ: slot ma + presence online giả tới hết TTL. Timeout cũng có thể che một lần cấp thành công; release lease đã gỡ là idempotent kể cả khi thao tác lỗi chỉ là một lần gia hạn.'],
                src: 'comment gốc lease-refresher.ts (apply) + plan § 10 (C18)',
              },
              {
                at: 'entry.nextRefreshAt = Math.min(',
                text: ['Lỗi Redis KHÔNG ngắt ngay: thử lại dày hơn và chỉ ngắt khi lần gia hạn thành công cuối đã đủ leaseMs (trừ biên an toàn). Lần thử kế tiếp không được muộn hơn mốc ngắt, nếu không socket có thể sống thêm tới một chu kỳ sau khi Redis đã có thể cấp lại slot của nó.'],
                src: 'doc class LeaseRefresher + comment gốc lease-refresher.ts (apply)',
              },
            ],
          },
          { tag: 'GATEWAY', file: LR, dedent: true, ranges: [fn('private releaseOrphans(')] },
          { tag: 'GATEWAY', file: LR, dedent: true, ranges: [fn('private expire(')] },
          { tag: 'REDIS', file: CQ, dedent: true, ranges: [fn('async refreshMany(')] },
          { tag: 'REDIS', file: CQ, dedent: true, ranges: [fn('async reacquireMany(')] },
          { tag: 'REDIS', file: CQ, dedent: true, ranges: [fn('async releaseMany(')] },
          {
            tag: 'REDIS',
            file: CQ,
            dedent: true,
            ranges: [fn('private async pipelineByShard(')],
            inline: [
              {
                at: 'const results = new Array<[Error | null, unknown] | undefined>(',
                text: ['`fill` để mảng không có "lỗ": Array.prototype.map bỏ qua ô trống nên lease không nhận được kết quả sẽ không bao giờ được ánh xạ thành error.'],
                src: 'comment gốc connection-quota.service.ts (pipelineByShard)',
              },
            ],
          },
          {
            tag: 'REDIS',
            file: CQ,
            dedent: true,
            ranges: [{ at: 'const REFRESH_SCRIPT = `', to: '^`;$' }],
          },
        ],
      },
      {
        n: '03',
        slug: 'ws-relay-outbound-budget',
        method: 'WS',
        short: 'relay + ngân sách gửi',
        route: 'Redis pub/sub message → SignalingGateway.relay (mỗi sự kiện realtime)',
        name: 'Relay sự kiện tới socket của user với ngân sách gửi',
        title:
          'Nhận envelope từ Redis, chỉ emit cho socket CỤC BỘ của user, đặt chỗ ngân sách gửi (theo socket và theo cả pod) TRƯỚC khi enqueue, và đóng transport của socket chậm để nó reconnect rồi đọc bù qua REST.',
        flow: '[REDIS] → [GATEWAY]',
        roles: [
          ['REDIS', 'Kênh pub/sub realtime:user:{userId} là nguồn của event; at-most-once và không giữ lịch sử, nên socket bị đóng phải đọc bù trạng thái bền qua REST.'],
          ['GATEWAY', 'Kiểm room cục bộ, đo kích thước gói, đặt chỗ ngân sách theo socket và theo pod, emit riêng từng socket, đuổi socket có backlog lâu nhất khi pod hết chỗ, đóng transport của socket chậm.'],
        ],
        tables: [],
        redis: [
          ['realtime:user:{userId}', 'kênh pub/sub của user; message là JSON {event, data}; pod chỉ SUBSCRIBE khi có socket của user đó (trang 01).'],
        ],
        related: [
          ['Kết nối WebSocket', 'trang 01: SUBSCRIBE kênh của user trước khi handshake xong.'],
          ['Core API publish', 'core-api publish sau khi commit bền vững (không chép).'],
          ['Client reconnect', 'frontend thử lại admission có backoff/jitter rồi refetch qua REST (không chép).'],
        ],
        nested: true,
        skip: ['hasLocalSockets'],
        steps: [
          { at: 'relay(channel: string, raw: string): void {', text: 'Một sự kiện từ Redis tới pod: chỉ chuyển cho socket của user ngay trên pod này' },
          { at: 'if (!this.hasLocalSockets(room)) {', text: 'Kiểm room cục bộ TRƯỚC khi parse JSON' },
          { at: 'const nextBytes = OutboundBudget.eventBytes(', text: 'Ước lượng kích thước gói sẽ gửi (JSON + overhead bảo thủ)' },
          { at: 'if (!this.outboundTotal.fitsAlone(nextBytes)) {', text: 'Event lớn hơn cả ngân sách của pod: bỏ, không đuổi ai để nhường chỗ' },
          { at: 'budget.evict();', text: 'Socket đã đầy ngân sách riêng: đóng transport để nó reconnect, các socket khoẻ vẫn được phục vụ' },
          { at: 'const cancel = budget.reserve(nextBytes);', text: 'Đặt chỗ ngân sách TRƯỚC khi enqueue, kể cả event đầu tiên của kết nối' },
          { at: 'const oldest = this.backlogs.values().next().value;', text: 'Pod hết chỗ: đuổi socket có backlog LÂU NHẤT (tối đa 32 lần) để nhường chỗ' },
          { at: 'this.server.local.to(id).emit(envelope.event, envelope.data);', text: 'Emit riêng từng socket bằng server.local' },
          { at: 'cancel();', text: 'Trả chỗ đã đặt nếu emit không tạo ra gói Engine.IO nào' },
          { at: 'const reserved = this.reservation;', text: 'Gói thật thay chỗ đã đặt trước nên chỉ cộng phần chênh' },
          { at: 'const writer = response ?? transport;', text: 'Gói chỉ được tính là đã gửi khi ghi xong thật: drain (WebSocket) hoặc finish của HTTP response (polling)' },
        ],
        items: [
          {
            tag: 'GATEWAY',
            file: GW,
            dedent: true,
            ranges: [fn('relay(channel: string, raw: string): void {')],
            inline: [
              {
                at: 'if (!this.hasLocalSockets(room)) {',
                text: ['Kiểm room TRƯỚC khi parse JSON: ở chế độ pattern đa số event không dành cho user nào trên pod, còn ở chế độ user đây là lưới an toàn cho event tới muộn sau khi socket cuối của user đã rời.'],
                src: 'doc relay signaling.gateway.ts ("Kiểm tra room TRƯỚC khi parse JSON")',
              },
              {
                at: 'if (!this.outboundTotal.fitsAlone(nextBytes)) {',
                text: ['Một event lớn hơn cả ngân sách của pod thì không thể được nhận chỗ bằng cách đuổi ai: bỏ ngay (đếm vào signaling_outbound_pressure_total{result="dropped"}).'],
                src: 'comment gốc signaling.gateway.ts (relay, "An event larger than the entire pod budget cannot be admitted by evicting anyone") + docs/services/realtime-gateway.md',
              },
              {
                at: 'budget.evict();',
                text: ['Đóng transport chứ không gửi DISCONNECT của namespace, vì client nhận DISCONNECT sẽ ngừng tự nối lại. Socket chậm reconnect rồi đọc bù trạng thái qua REST; socket khoẻ trong cùng room vẫn được phục vụ.'],
                src: 'comment gốc signaling.gateway.ts (relay, "a namespace DISCONNECT would disable automatic reconnect") + docs/services/realtime-gateway.md (ngân sách gửi)',
              },
              {
                at: 'this.server.local.to(id).emit(envelope.event, envelope.data);',
                text: ['Emit riêng từng socket để MỖI người nhận đặt chỗ ngân sách trước khi enqueue, kể cả event đầu tiên. `local` là bắt buộc: mọi pod đã nhận bản Redis relay của event này, nên broadcast không-local sẽ được cluster adapter chuyển sang pod khác và socket nhận N bản.'],
                src: 'comment gốc signaling.gateway.ts (relay, "Emit separately so every recipient reserves capacity BEFORE enqueue ... local is essential") + doc relay',
              },
              {
                at: 'cancel();',
                text: ['Chỉ trả lại chỗ đặt trước khi emit không tạo ra gói Engine.IO nào (ví dụ socket vừa đóng); nếu có gói thì packetCreate đã chuyển chỗ đặt thành gói thật.'],
                src: 'comment gốc signaling.gateway.ts (relay, "only releases a reservation if emit did not create an Engine.IO packet") + doc reserve outbound-budget.ts',
              },
            ],
          },
          {
            tag: 'GATEWAY',
            file: OB,
            dedent: true,
            ranges: [fn('static eventBytes(')],
            inline: [
              {
                at: 'Buffer.byteLength(',
                text: ['Envelope từ Redis luôn là JSON nên Socket.IO phát đúng một gói EVENT không nhị phân và không có ACK id; cộng overhead bảo thủ (loại gói Engine.IO + header frame WebSocket lớn nhất) để tính cả polling.'],
                src: 'comment gốc outbound-budget.ts (eventBytes, FRAME_OVERHEAD)',
              },
            ],
          },
          {
            tag: 'GATEWAY',
            file: OB,
            dedent: true,
            ranges: [fn('fitsAlone('), fn('makeRoom('), fn('update(')],
            inline: [
              {
                at: 'for (let evicted = 0; evicted < 32; evicted++) {',
                text: ['Công việc đuổi socket cho MỖI người nhận bị chặn ở 32 lần: tin realtime là best-effort nên thà bỏ event còn hơn quét cả pod trong một lần relay.'],
                src: 'doc makeRoom outbound-budget.ts ("Bound eviction work per recipient; best-effort delivery can drop instead of scanning a pod") + docs/services/realtime-gateway.md (tối đa 32 lần)',
              },
              {
                at: 'const oldest = this.backlogs.values().next().value;',
                text: ['Tập backlog giữ thứ tự chèn nên chọn socket có backlog lâu nhất là O(1), và socket rảnh không bị giữ lại trong tập.'],
                src: 'comment gốc outbound-budget.ts (backlogs, "Insertion order gives O(1) oldest-backlog selection, retaining no idle sockets")',
              },
            ],
          },
          {
            tag: 'GATEWAY',
            file: OB,
            dedent: true,
            ranges: [fn('allows('), fn('reserve(bytes: number)'), fn('evict(): void {'), fn('private update(')],
            inline: [
              {
                at: 'if (this.disposed || (this.total && !this.total.makeRoom(bytes))) return;',
                text: ['Đặt chỗ phải qua ngân sách của cả pod. makeRoom có thể đuổi chính kết nối này nếu nó đang giữ backlog cũ nhất, nên kiểm lại disposed ngay sau đó.'],
                src: 'reserve outbound-budget.ts (comment gốc "makeRoom may evict this connection if it already holds the oldest backlog")',
              },
              {
                at: 'this.dispose();',
                text: ['Nhả sổ sách gói đang xếp hàng và đang ghi NGAY, kể cả khi việc đóng transport hoàn tất muộn hơn: ngân sách của pod không được kẹt vì một socket đã bị đuổi.'],
                src: 'comment gốc outbound-budget.ts (evict, "Release queued and in-flight accounting synchronously, even if close completes later")',
              },
            ],
          },
          {
            tag: 'GATEWAY',
            file: OB,
            dedent: true,
            ranges: [prop('private readonly onPacket = '), prop('private readonly onFlush = '), prop('private readonly dispose = ')],
            inline: [
              {
                at: 'const reserved = this.reservation;',
                text: ['Chỗ đặt trước khi emit được chuyển thành gói thật ở packetCreate: chỉ cộng phần chênh, nên mỗi gói được đếm đúng một lần dù đã đặt chỗ trước.'],
                src: 'doc reserve outbound-budget.ts ("Reserve BEFORE emit; packetCreate converts the reservation into the actual packet")',
              },
              {
                at: 'if (size === undefined) continue;',
                text: ['Gói xếp hàng trước khi tracker được gắn (ví dụ handshake) không có kích thước ghi nhận: bỏ qua thay vì đếm sai.'],
                src: 'comment gốc outbound-budget.ts (onFlush, "handshake queued before this tracker was attached")',
              },
              {
                at: 'const writer = response ?? transport;',
                text: ["'drain' của Engine.IO bắn ngay sau flush chứ không phải sau khi ghi ra mạng, và với polling còn bắn lúc res.end(): nên chờ 'finish' của HTTP response; WebSocket thì chờ 'drain' của transport. Gói chỉ rời bộ đếm khi đó."],
                src: "comment gốc outbound-budget.ts (onFlush, \"Engine.IO's own 'drain' fires immediately after flush, NOT after writing to the network\")",
              },
            ],
          },
        ],
      },
      {
        n: '04',
        slug: 'boot-quota-topology-guard',
        method: 'BOOT',
        short: 'topology guard',
        route: 'ConnectionQuotaService.onModuleInit (lúc gateway khởi động)',
        name: 'Khởi động: khoá placement quota bằng fingerprint topology',
        title:
          'Mỗi gateway tính fingerprint của danh sách shard Redis có thứ tự và đăng ký nó một lần trên Redis điều phối; fingerprint khác thì từ chối khởi động để rolling update không tạo hai quota độc lập cho cùng một user.',
        flow: '[GATEWAY] → [REDIS]',
        roles: [
          ['GATEWAY', 'Tính fingerprint từ giao thức, host, port, database và query option của từng shard theo đúng thứ tự (bỏ credential), chờ một shard quota sẵn sàng, từ chối khởi động khi topology đổi.'],
          ['REDIS', 'Redis điều phối (REDIS_URL) giữ key bền vững chứa fingerprint; script Lua đặt-nếu-chưa-có rồi so sánh, nguyên tử.'],
        ],
        tables: [],
        redis: [
          ['signaling:connection-quota-topology:v1', 'fingerprint sha256 của placement; bền vững, không tự hết hạn khi pod dừng; Redis điều phối phải giữ key này qua failover và restore.'],
        ],
        related: [
          ['Cắt chuyển topology', 'quy trình drain toàn bộ gateway, chờ hết lease dài nhất rồi mới xoá key và đổi danh sách shard là thủ tục vận hành, không phải code (không chép).'],
          ['Chọn shard theo userId', 'cùng hàm hash ở libs/common-dtos cho cả core-api và gateway (không chép).'],
        ],
        nested: true,
        steps: [
          { at: 'async onModuleInit(): Promise<void> {', text: 'Khởi động gateway: đăng ký topology song song với việc chờ một shard quota sẵn sàng' },
          { at: 'await this.waitReady(this.topologyClient);', text: 'Đăng ký fingerprint topology trên Redis điều phối (chờ kết nối tới Redis điều phối trước)' },
          { at: 'const registered = await this.topologyClient.eval(', text: 'Script Lua nguyên tử: chưa có thì ghi, có rồi thì so sánh' },
          { at: 'if (registered !== 1) {', text: 'Fingerprint khác: từ chối khởi động thay vì để hai quota cùng tồn tại' },
        ],
        items: [
          {
            tag: 'GATEWAY',
            file: CQ,
            dedent: true,
            ranges: [fn('async onModuleInit('), fn('private async registerTopology(')],
            inline: [
              {
                at: 'Promise.any(this.clients.map((client) => this.waitReady(client))),',
                text: ['Một shard chết lúc khởi động không được chặn cả pod (rolling restart đúng lúc một shard failover sẽ crash-loop): user của shard đó fail closed lúc handshake, user của các shard còn lại vẫn được phục vụ. Chỉ khi KHÔNG shard nào lên được mới là lỗi khởi động.'],
                src: 'doc onModuleInit connection-quota.service.ts',
              },
              {
                at: 'const registered = await this.topologyClient.eval(',
                text: ['Fingerprint gồm thứ tự, endpoint, database và mọi query option của URL trừ username/password, vì ioredis cho phép ?db=, ?host=, ?keyPrefix= đổi chỗ đặt dữ liệu; đổi mật khẩu thì không đổi fingerprint.'],
                src: 'comment gốc connection-quota.service.ts (constructor, "ioredis accepts query overrides such as db, host and keyPrefix") + docs/services/realtime-gateway.md',
              },
              {
                at: 'if (registered !== 1) {',
                text: ['Đổi số hoặc thứ tự shard làm modulo remap: gateway cũ và mới cùng chạy sẽ cấp hai quota độc lập cho cùng một user. Từ chối khởi động; chuyển topology phải theo thủ tục drain toàn bộ gateway rồi mới xoá key.'],
                src: 'comment gốc connection-quota.service.ts (registerTopology, "A rolling modulo remap would create two independent quotas for the same user") + docs/services/realtime-gateway.md',
              },
            ],
          },
          { tag: 'REDIS', file: CQ, dedent: true, ranges: [{ at: 'const REGISTER_TOPOLOGY_SCRIPT = `', to: '^`;$' }] },
        ],
      },
    ],
  },
];
