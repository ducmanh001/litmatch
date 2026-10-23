// Outbox relay (Outbox Pattern): event kinh tế ghi vào outbox_events cùng transaction với sổ cái, relay đọc rồi publish Kafka sau.
// Mỗi tick bắt kịp backlog qua nhiều lô nhưng bị chặn bởi trần số lô và ngân sách thời gian; lỗi broker đầu tiên kết thúc lô.
// TRUNG THỰC: relay đang TẮT mặc định ở mọi profile và repo chưa có consumer nào subscribe topic này.
// `src` = bằng chứng của từng comment; engine bỏ qua, verify-10m.mjs yêu cầu có.
const E = 'apps/core-api/src/modules/economy';
const RL = `${E}/jobs/outbox-relay.service.ts`;
const KB = 'apps/core-api/src/common/events/kafka-event-bus.adapter.ts';
const MIG_OUTBOX = 'apps/core-api/src/database/migrations/1757000000000-outbox-reliability.ts';
const END_FN = '^  }$';

const fn = (anchor) => ({ at: anchor, to: END_FN });

export const annotatedFeatures = [
  {
    id: '37-outbox-relay',
    short: 'Outbox relay',
    title: 'Outbox relay: bắt kịp backlog có ngân sách',
    summary:
      'Outbox Pattern: event kinh tế được ghi vào outbox_events cùng transaction với sổ cái, relay đọc rồi publish Kafka sau. Mỗi tick relay bắt kịp backlog qua nhiều lô (mặc định tối đa 10 lô × 100 event) nhưng bị chặn bởi ngân sách thời gian (mặc định 1000 ms), không bắt đầu publish mới khi hết ngân sách hoặc shutdown, và lỗi broker đầu tiên kết thúc lô để không giữ khoá DB qua nhiều lần timeout. Nhiều pod chạy song song nhờ FOR UPDATE SKIP LOCKED; event lỗi được thử lại có trần rồi chuyển dead-letter và giữ nguyên để replay. Lưu ý trung thực: relay đang TẮT mặc định ở mọi profile (env, K8s base, compose production, hosted) và repo chưa có consumer nào subscribe topic litmatch.economy.events, nên đây là cơ chế sẵn có chứ chưa phải đường dữ liệu đang chạy; mã này thuộc đợt thay đổi chưa chạy kiểm chứng runtime (ADR 0015), không phải chứng nhận công suất.',
    diagramAnchor: '09-diamond-top-up-va-vip',
    arch: 'ledger-integrity',
    endpoints: [
      {
        n: '01',
        slug: 'job-outbox-relay-tick',
        method: 'JOB',
        short: 'relay tick',
        route: 'OutboxRelayService.flushOnce (mỗi ECONOMY_OUTBOX_RELAY_INTERVAL_MS; TẮT mặc định)',
        name: 'Outbox relay: bắt kịp backlog có ngân sách mỗi tick',
        title:
          'Mỗi tick bắt kịp backlog qua tối đa MAX_BATCHES lô (100 event/lô) trong ngân sách thời gian: chọn event chưa publish bằng FOR UPDATE SKIP LOCKED, publish Kafka, thử lại có trần rồi dead-letter. Relay đang tắt mặc định và chưa có consumer.',
        flow: '[WORKER] → [POSTGRES] → [KAFKA]',
        roles: [
          ['WORKER', 'Interval riêng (ECONOMY_OUTBOX_RELAY_INTERVAL_MS, mặc định 2000 ms), KHÔNG chạy dưới khoá cluster-singleton: mọi pod đều chạy relay. Mỗi tick tối đa MAX_BATCHES_PER_TICK lô (mặc định 10 lô × 100 event) trong ngân sách TICK_BUDGET_MS (mặc định 1000 ms); không bắt đầu publish mới khi hết ngân sách hoặc shutdown. TẮT mặc định ở mọi profile.'],
          ['POSTGRES', 'Mỗi lô là MỘT transaction: SELECT ... FOR UPDATE SKIP LOCKED tối đa 100 event chưa publish và chưa dead-letter theo created_at, giữ khoá hàng trong lúc publish, rồi lưu published_at, attempts, last_error, dead_lettered_at và commit. Pod khác bỏ qua các hàng đang bị khoá.'],
          ['KAFKA', 'KafkaEventBusAdapter.publish gửi envelope (id, topic, type, version, key, payload) bằng producer idempotent, 1 request in-flight; lỗi được ném lại để relay giữ dòng outbox và thử lại. Event kinh tế đi vào topic litmatch.economy.events; hiện chưa có consumer nào subscribe topic này.'],
        ],
        tables: [
          ['outbox_events', 'event ghi cùng transaction nghiệp vụ; relay đọc các dòng published_at IS NULL và dead_lettered_at IS NULL theo created_at rồi UPDATE published_at, attempts, last_error, dead_lettered_at. Khi relay tắt, bảng tích luỹ không giới hạn vì job retention chỉ xoá dòng đã publish.'],
        ],
        related: [
          ['Ghi event', 'LedgerService ghi outbox_events cùng DB transaction với sổ cái và ví (Outbox Pattern); relay chỉ phát lại, không tạo event (không chép).'],
          ['Retention outbox', 'EconomyRetentionJob chỉ xoá dòng ĐÃ publish quá OUTBOX_PUBLISHED_RETENTION_DAYS (mặc định 7); dòng dead-letter mặc định giữ vì cần người xử lý (không chép).'],
          ['Consumer', 'Adapter Kafka có sẵn đường subscribe kèm inbox/dedup nhưng chưa module nào dùng; cần chốt consumer đầu tiên và chứng minh replay/catch-up trước khi bật relay ở production (không chép).'],
        ],
        nested: true,
        steps: [
          { at: 'async onApplicationBootstrap(', text: 'Khởi động: chỉ lên lịch relay khi ECONOMY_OUTBOX_RELAY_ENABLED bật' },
          { at: 'this.job.start(this.scheduler, {', text: 'Đăng ký interval; mỗi tick chạy flushOnce' },
          { at: 'for (let batch = 0; batch < maxBatches && !this.stopping; batch++) {', text: 'Bắt kịp backlog bằng nhiều lô trong một tick, có trần số lô và thời gian' },
          { at: 'return this.dataSource.transaction(async (manager) => {', text: 'Một lô là một transaction giữ khoá hàng' },
          { at: 'const events: OutboxEvent[] = await manager', text: 'Lấy tối đa 100 event chưa publish bằng FOR UPDATE SKIP LOCKED' },
          { at: '(attempted > 0 && Date.now() >= deadline)', text: 'Chỉ bắt đầu attempt mới khi còn ngân sách và chưa shutdown' },
          { at: 'await this.eventBus.publish(toEventEnvelope(event));', text: 'Publish lên Kafka rồi đánh dấu đã publish' },
          { at: 'event.attempts += 1;', text: 'Publish lỗi: tăng attempts và lưu lỗi lên dòng đã khoá' },
          { at: 'await this.deadLetter(event);', text: 'Đủ số lần thử thì chuyển dead-letter' },
          { at: 'await manager.save(events);', text: 'Lưu trạng thái cả lô rồi commit, nhả khoá' },
          { at: 'if (count < BATCH_SIZE) break;', text: 'Lô ngắn thì kết thúc tick' },
        ],
        items: [
          {
            tag: 'WORKER',
            file: RL,
            dedent: true,
            ranges: [fn('async onApplicationBootstrap(')],
            inline: [
              {
                at: 'if (',
                text: ['TẮT mặc định ở mọi profile (env, K8s base, compose production, hosted) và repo chưa có module nào subscribe topic này: tắt thì event outbox giữ published_at = NULL và bảng tích luỹ, không tự bật Kafka/consumer và không xoá event chưa publish. Trước khi bật ở production phải chốt consumer đầu tiên.'],
                src: 'docs/services/economy-service.md (mục Outbox: "Khi relay tắt (mặc định ở MỌI profile: env, K8s base, compose production, hosted-free) các dòng giữ published_at = NULL ... repo chưa có module nào subscribe topic này"; "Relay tắt thì startup cảnh báo; không tự bật Kafka/consumer hoặc xóa unpublished events"); k8s/base/core-api/configmap.yaml ECONOMY_OUTBOX_RELAY_ENABLED: \'false\'; deploy/production/compose.yml; .env.example; env.validation.ts default false',
              },
              {
                at: 'this.job.start(this.scheduler, {',
                text: ['Không có khoá cluster-singleton như job đối soát: mọi pod đều chạy relay và FOR UPDATE SKIP LOCKED chia event giữa các pod, nên relay không bị trần "một pod mỗi tick".'],
                src: 'doc OutboxRelayService ("FOR UPDATE SKIP LOCKED — nhiều instance chạy song song không dẫm nhau"); ADR 0015 ("Cluster-wide timer singleton jobs cap throughput independently of the number of API replicas"); economy.integration.spec.ts "2 instance relay flushOnce SONG SONG trên cùng batch"',
              },
            ],
          },
          {
            tag: 'WORKER',
            file: RL,
            dedent: true,
            ranges: [fn('async flushOnce(')],
            inline: [
              {
                at: 'for (let batch = 0; batch < maxBatches && !this.stopping; batch++) {',
                text: ['Mặc định tối đa 10 lô × 100 event mỗi tick và bị chặn bởi TICK_BUDGET_MS (1000 ms): backlog được rút dần qua nhiều tick mà mỗi tick vẫn có trần. stopping được đặt true ở onApplicationShutdown nên shutdown cũng dừng vòng lặp.'],
                src: 'docs/services/economy-service.md ("Relay bắt kịp backlog qua tối đa ECONOMY_OUTBOX_RELAY_MAX_BATCHES_PER_TICK lô/tick (mặc định 10, 100 event/lô), bị chặn bởi ECONOMY_OUTBOX_RELAY_TICK_BUDGET_MS (mặc định 1000)"); env.validation.ts defaults',
              },
              {
                at: 'if (count < BATCH_SIZE) break;',
                text: ['Lô ngắn có thể do hết event, hết ngân sách, shutdown hoặc broker lỗi: dừng tick thay vì đốt thêm lượt retry và dead-letter trong cùng một tick.'],
                src: 'comment gốc outbox-relay.service.ts ("Stop on a short or failed batch, rather than burning retry/DLQ attempts in one tick.")',
              },
            ],
          },
          {
            tag: 'POSTGRES',
            file: RL,
            dedent: true,
            ranges: [fn('private async flushBatch(')],
            inline: [
              {
                at: 'return this.dataSource.transaction(async (manager) => {',
                text: ['Event được publish TRONG lúc transaction giữ khoá hàng và chỉ được đánh dấu published_at khi commit: crash giữa publish và commit làm event được publish lại ở tick sau (at-least-once, không mất event), nên consumer phải khử trùng theo id event.'],
                src: 'kafka-event-bus.adapter.ts ("The stable event id is part of the message so downstream consumers can dedupe"; "The outbox still remains at-least-once across DB crashes"); economy.integration.spec.ts "Kafka chết lúc publish → event Ở LẠI outbox với attempts+1, tick sau publish lại đúng 1 lần (at-least-once, không mất event)"',
              },
              {
                at: 'const events: OutboxEvent[] = await manager',
                text: ['Các pod relay chạy song song lấy những hàng chưa bị pod khác khoá thay vì chờ hay dẫm nhau, không deadlock. Điều kiện và thứ tự khớp index một phần idx_outbox_events_relayable (created_at, chưa publish, chưa dead-letter).'],
                src: 'economy.integration.spec.ts "2 instance relay flushOnce SONG SONG ... FOR UPDATE SKIP LOCKED chia phần, không event nào publish 2 lần, không deadlock"; migration 1757000000000-outbox-reliability.ts (idx_outbox_events_relayable)',
              },
              {
                at: '(attempted > 0 && Date.now() >= deadline)',
                text: ['Attempt đầu của lô luôn được thử. Ngân sách chỉ chặn attempt MỚI: publish đang bay không bị huỷ và vẫn chờ deadline của driver (EVENT_BUS_KAFKA_REQUEST_TIMEOUT_MS, mặc định 5000 ms).'],
                src: 'docs/services/economy-service.md ("Không bắt đầu network attempt mới khi hết budget/shutdown ... I/O đang chạy vẫn chờ deadline driver"); kafka-event-bus.adapter.ts requestTimeout; env.validation.ts EVENT_BUS_KAFKA_REQUEST_TIMEOUT_MS default 5000',
              },
              {
                at: 'event.attempts += 1;',
                text: ['Event Ở LẠI outbox với attempts + 1 và lastError ngay trên dòng đã khoá, tick sau thử lại; chỉ khi attempts đạt ECONOMY_OUTBOX_MAX_ATTEMPTS (mặc định 5) mới bị chuyển dead-letter.'],
                src: 'economy.integration.spec.ts "Kafka chết lúc publish ..." và "retry có bound → sau max attempts event được giữ lại ở trạng thái dead-letter, không retry vô hạn"; env.validation.ts ECONOMY_OUTBOX_MAX_ATTEMPTS default 5',
              },
              {
                at: 'break;',
                text: ['Lỗi broker đầu tiên kết thúc lô: nếu thử tiếp, một lần broker chết sẽ tiêu hết 100 timeout mạng trong khi transaction giữ khoá DB.'],
                src: 'comment gốc outbox-relay.service.ts ("A broker outage must not consume all 100 network deadlines while holding DB locks."); docs/services/economy-service.md ("lỗi broker đầu tiên kết thúc batch để không giữ DB lock qua 100 lần timeout")',
              },
            ],
          },
          {
            tag: 'WORKER',
            file: RL,
            dedent: true,
            ranges: [fn('private async deadLetter(')],
            inline: [
              {
                at: 'await this.eventBus.publishDeadLetter(',
                text: ['Publish bản sao sang topic .DLQ nhưng GIỮ dòng outbox gốc: đó là nguồn replay cho người vận hành, kể cả khi broker hay DLQ đang hỏng.'],
                src: 'event-bus.port.ts doc publishDeadLetter ("The caller keeps the original outbox row so an operator can inspect or replay it even when the broker/DLQ is unavailable")',
              },
              {
                at: 'event.deadLetteredAt = new Date();',
                text: ['Luôn đánh dấu dead-letter, kể cả khi publish DLQ cũng lỗi: tránh vòng thử vô hạn. Dòng giữ nguyên payload để replay tay và không bao giờ tự xoá.'],
                src: 'comment gốc outbox-relay.service.ts ("Keep the payload and mark it terminal even if Kafka is still down. This prevents an infinite retry loop; the retained row is the operator replay source of truth."); docs/services/economy-service.md ("dòng dead-letter mặc định GIỮ")',
              },
            ],
          },
          {
            tag: 'KAFKA',
            file: KB,
            dedent: true,
            title: 'KafkaEventBusAdapter.publish (producer.send) và getProducer (cấu hình idempotent)',
            ranges: [
              { at: 'await producer.send({', to: '^      \\}\\);$' },
              { at: 'const producer = this.kafka.producer({', to: '^    \\}\\);$' },
            ],
            inline: [
              {
                at: 'key: event.key,',
                text: ['Id event ổn định nằm trong message (value là cả envelope) để consumer khử trùng: relay chỉ bảo đảm at-least-once.'],
                src: 'kafka-event-bus.adapter.ts comment gốc ("The stable event id is part of the message so downstream consumers can dedupe.")',
              },
              {
                at: 'idempotent: true,',
                text: ['Producer idempotent với 1 request in-flight giữ thứ tự theo key và làm retry của producer an toàn; outbox vẫn chỉ at-least-once khi DB crash.'],
                src: 'kafka-event-bus.adapter.ts comment gốc getProducer ("One in-flight request and Kafka idempotence preserve ordering for a stable key and make producer-level retries safe. The outbox still remains at-least-once across DB crashes.")',
              },
            ],
          },
          {
            tag: 'POSTGRES',
            file: MIG_OUTBOX,
            dedent: true,
            title: 'outbox_events: trạng thái dead-letter và index của relay',
            ranges: [{ at: 'await queryRunner.query(', lines: 9 }],
            inline: [
              {
                at: 'ADD COLUMN dead_lettered_at',
                text: ['dead_lettered_at là trạng thái cuối của relay: event vượt số lần thử được giữ nguyên payload để người vận hành xem hay replay, và relay không lấy lại nó.'],
                src: 'outbox-event.entity.ts ("Terminal relay state; the original payload remains available for inspection/replay."); migration 1757000000000-outbox-reliability.ts ("Adds bounded-relay state")',
              },
              {
                at: 'CREATE INDEX idx_outbox_events_relayable',
                text: ['Index một phần đúng theo điều kiện của relay (chưa publish và chưa dead-letter, theo created_at): lô tiếp theo là các khoá đầu của index.'],
                src: 'migration 1757000000000-outbox-reliability.ts (idx_outbox_events_relayable WHERE published_at IS NULL AND dead_lettered_at IS NULL); câu truy vấn trong flushBatch',
              },
            ],
          },
        ],
      },
    ],
  },
];
