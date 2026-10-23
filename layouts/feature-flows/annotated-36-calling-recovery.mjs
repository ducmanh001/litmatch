// Calling ở 10M: timer và cleanup chạy trên MỌI pod core-api bằng lease claim nguyên tử (không cluster singleton), call kết thúc chỉ để
// marker cleanup bền vững, và GET trạng thái call đối soát với SFU mà không gia hạn reconnect grace hay ghi đè webhook mới hơn.
// `src` = bằng chứng của từng comment; engine bỏ qua, verify-10m.mjs yêu cầu có.
const CS = 'apps/core-api/src/modules/calling';
const TK = `${CS}/jobs/call-ticker.service.ts`;
const SV = `${CS}/calling.service.ts`;
const CT = `${CS}/calling.controller.ts`;
const WH = `${CS}/webhooks/livekit-webhook.controller.ts`;
const AD = `${CS}/clients/livekit-room.adapter.ts`;
const SDK = 'apps/core-api/src/common/livekit/livekit-sdk.client.ts';
const END_FN = '^  }$';

const fn = (anchor) => ({ at: anchor, to: END_FN });

export const annotatedFeatures = [
  {
    id: '36-calling-recovery',
    short: 'Calling recovery',
    title: 'Calling: worker có lease, reconnect grace, cleanup bền vững',
    summary:
      'Timer của Voice Match chạy trên mọi pod core-api: mỗi lượt claim nguyên tử tối đa 100 call bằng một câu UPDATE ... SKIP LOCKED với lease theo đồng hồ DB, terminal hoá call quá hạn dưới row lock và chỉ để lại marker cleanup_pending. Một vòng cleanup riêng dọn Matching và room LiveKit có thử lại, còn GET trạng thái call đối soát với SFU mà không gia hạn reconnect grace đã lưu và không để snapshot cũ ghi đè webhook mới hơn. Lease chỉ cho at-least-once (trạng thái đúng vẫn do kiểm lại dưới row lock); chưa có số đo tải nên đây không phải chứng nhận 10 triệu đồng thời.',
    diagramAnchor: '03-voice-match',
    arch: 'calling-recovery',
    endpoints: [
      {
        n: '01',
        slug: 'job-call-timer-tick',
        method: 'JOB',
        short: 'timer tick',
        route: 'CallTickerService.runOnce (mỗi CALLING_TICKER_INTERVAL_MS, trên mọi pod core-api)',
        name: 'Timer cuộc gọi: claim lô có lease, terminal hoá call quá hạn',
        title:
          'Mỗi pod claim nguyên tử tối đa 100 call bằng một câu UPDATE ... FOR UPDATE SKIP LOCKED (lease theo đồng hồ DB), chốt call pending quá hạn, quá reconnect grace hoặc vượt giới hạn free trong ngân sách thời gian của tick, chỉ để marker cleanup rồi nhả lease.',
        flow: '[WORKER] → [POSTGRES] → [SERVICE] → [POSTGRES]',
        roles: [
          ['WORKER', 'Chạy ở MỌI pod core-api (không cluster singleton): ba nhóm pending / reconnect / free-limit nối tiếp nhau dưới ngân sách CALLING_TICK_BUDGET_MS, nhóm bắt đầu luân phiên giữa các tick; không chạy chồng tick trong cùng process và dừng khi shutdown.'],
          ['POSTGRES', 'Một câu UPDATE ... SKIP LOCKED vừa chọn vừa gắn lease timer_claim_until theo clock_timestamp() của DB; nhả lease bằng so sánh timestamp chính xác.'],
          ['SERVICE', 'CallingService.endById khoá hàng FOR UPDATE (bỏ qua hàng đang bị khoá), kiểm lại điều kiện quá hạn dưới khoá rồi chuyển call sang ended kèm cleanup_pending = true; chỉ lời gọi thực hiện transition mới publish call.ended.'],
        ],
        tables: [
          ['call_sessions', 'timer_claim_until (lease; NULL hoặc đã hết hạn theo giờ DB thì claim được), status pending → active → ended, reconnect_started_at, cleanup_pending ghi cùng transaction với ended. Ba nhóm dùng ba index: (status, created_at) cho pending, index một phần (reconnect_started_at, id) cho reconnect, index một phần (started_at, id) cho free-limit Voice Match.'],
        ],
        redis: [
          ['realtime:user:{userId}', 'PUBLISH call.ended cho cả hai member, chỉ ở lời gọi thực hiện transition sang ended (best-effort, không chờ SFU).'],
        ],
        related: [
          ['Cleanup bền vững', 'trang kế (job-call-cleanup-tick): timer không chờ SFU, marker cleanup_pending do vòng cleanup riêng nhặt (không chép ở đây).'],
          ['Đối soát khi poll', 'trang GET /calling/calls/:id: mở hoặc giữ nguyên reconnect grace mà timer này chốt khi quá hạn (không chép ở đây).'],
          ['Admission theo DataSource', 'timer đăng ký ở làn critical (một slot riêng, hai kết nối pool dành riêng); chi tiết ở trang Vòng đời dữ liệu (không chép).'],
        ],
        nested: true,
        steps: [
          { at: 'async runOnce(): Promise<void> {', text: 'Một tick timer của pod này; tick chồng nhau trong cùng process bị bỏ' },
          { at: 'const deadline = this.tickDeadline();', text: 'Ngân sách thời gian của tick (CALLING_TICK_BUDGET_MS)' },
          { at: 'const stale = await this.selectCandidates({', in: 'sweepPending', text: 'Nhóm pending: claim tối đa 100 call tạo quá CALLING_PENDING_TIMEOUT_SECONDS' },
          { at: 'return this.dataSource.query(', in: 'claimCandidates', text: 'Một câu SQL vừa chọn (SKIP LOCKED) vừa gắn lease theo giờ DB' },
          { at: 'await this.callingService.endById(', in: 'sweepPending', text: 'Chốt call pending quá hạn: end pending_timeout, chỉ để marker cleanup' },
          { at: 'if (shouldEnd && !shouldEnd(call)) return { call, justEnded: false };', text: 'Kiểm lại điều kiện quá hạn dưới row lock: ứng viên chỉ là ảnh chụp cũ' },
          { at: 'call.cleanupPending = true;', text: 'Ghi marker cleanup cùng transaction với trạng thái ended' },
          { at: "await this.releaseUnused(stale, 'timer_claim_until');", text: 'Nhả lease của các call đã xử lý xong, kể cả nhánh lỗi hoặc bỏ qua' },
          { at: 'const stale = await this.selectCandidates({', in: 'sweepReconnectTimeouts', text: 'Nhóm reconnect: claim call có cửa sổ reconnect đã quá CALLING_RECONNECT_WINDOW_SECONDS' },
          { at: "const active = await this.claimCandidates(activeQuery, 'timer_claim_until');", text: 'Nhóm free-limit: claim call Voice Match active đã quá CALLING_FREE_CALL_SECONDS' },
          { at: 'const sweep = sweeps[this.nextSweep];', text: 'Vòng lặp của tick: chọn nhóm tới lượt rồi dời con trỏ, dừng khi hết ngân sách' },
        ],
        items: [
          {
            tag: 'WORKER',
            file: TK,
            dedent: true,
            ranges: [fn('async runOnce(')],
            inline: [
              {
                at: 'await this.job.runExclusive(async () => {',
                text: ['Trong MỘT process, tick không chạy chồng nhau (cờ running). Giữa các pod thì KHÔNG có loại trừ nào: nhiều pod cùng chạy timer là chủ đích, an toàn nhờ claim lease và kiểm lại dưới row lock.'],
                src: 'doc ManagedInterval (managed-interval.ts: "Correctness giữa nhiều process vẫn phải do transaction, lock hoặc idempotency của domain giữ") + doc CallTickerService ("Stateless — chạy được nhiều instance") + docs/services/calling-service.md mục 4',
              },
              {
                at: 'const sweeps = [',
                text: ['Ba nhóm chạy NỐI TIẾP, không song song: timer đi làn critical của admission, được dành riêng hai kết nối pool (một cho claim, một cho tác vụ) và chỉ một tick chạy mỗi lần.'],
                src: 'ManagedInterval priority "critical" (managed-interval.ts: "Reserved claim + task connections for the sequential calling timer only") + doc acquireBackgroundDatabaseAdmission (background-database-admission.ts: "two for the sequential calling timer (claim + task)") + call-ticker.service.ts onApplicationBootstrap (priority: critical)',
              },
              {
                at: 'const sweep = sweeps[this.nextSweep];',
                text: ['Luân phiên điểm bắt đầu: một nhóm chậm (backlog pending) có thể dùng hết ngân sách của tick; khi đó tick sau bắt đầu từ nhóm kế tiếp, nên reconnect và free-limit không bị bỏ đói.'],
                src: 'comment gốc runOnce (call-ticker.service.ts: "Rotate the next stage when a slow stage exhausts its budget; pending backlog must not starve free limits") + test call-ticker.service.spec.ts "deadline stops a pending backlog and the next tick reaches reconnect/free stages first"',
              },
            ],
          },
          {
            tag: 'WORKER',
            file: TK,
            dedent: true,
            ranges: [fn('private tickDeadline(')],
            inline: [
              {
                at: 'Date.now() +',
                text: ['Deadline hợp tác: chỉ chặn việc KHỞI ĐỘNG thêm ứng viên hoặc nhóm mới. SQL và I/O đã bắt đầu vẫn chờ driver kết thúc hoặc timeout riêng, không bị huỷ ngay khi hết ngân sách.'],
                src: 'docs/services/calling-service.md mục 4 ("đây là deadline hợp tác, không phải cam kết hủy ngay mọi lệnh đang chạy") + env.validation.ts CALLING_TICK_BUDGET_MS (mặc định 1000)',
              },
            ],
          },
          {
            tag: 'WORKER',
            file: TK,
            dedent: true,
            ranges: [fn('private async sweepPending(')],
            inline: [
              {
                at: '{ deferCleanup: true, skipLocked: true },',
                text: ['deferCleanup: timer chỉ chuyển call sang ended và để marker cleanup_pending, không chờ SFU hay Matching (một SFU chậm không được giữ vòng timer). skipLocked: hàng đang bị khoá bởi webhook hoặc người dùng thì bỏ qua thay vì chờ, các call sau không bị chặn và lô sau nhặt lại.'],
                src: 'docs/services/calling-service.md mục 4 ("Timer chỉ terminal hoá call và để marker cho cleanup; không chờ SFU"; "bỏ qua row vừa bị khóa lại") + test calling.integration.spec.ts "pending skips an older locked row and progresses another call, then retries after unlock"',
              },
              {
                at: "await this.releaseUnused(stale, 'timer_claim_until');",
                text: ['Nhả lease của CẢ lô khi tick xong, kể cả khi endById ném lỗi hoặc ngân sách cắt lô: call chưa xử lý được thử lại ngay ở tick sau thay vì chờ lease hết hạn. Chỉ pod CHẾT mới phải đợi lease hết.'],
                src: 'comment gốc releaseUnused (call-ticker.service.ts: "Settled/skipped attempts should retry next tick; only crashes wait for lease expiry") + docs/services/calling-service.md mục 4 + test call-ticker.service.spec.ts "pending failure releases the claimed batch using the exact lease timestamp"',
              },
            ],
          },
          {
            tag: 'WORKER',
            file: TK,
            dedent: true,
            ranges: [fn('private async sweepReconnectTimeouts(')],
            inline: [
              {
                at: 'reconnectStartedAt: LessThan(cutoff),',
                text: ['Mốc reconnectStartedAt được đặt MỘT lần khi gián đoạn bắt đầu (poll GET lặp lại không gia hạn), nên cửa sổ tính từ đúng mốc đó; quá hạn thì call được chốt ended(completed). Index một phần (reconnect_started_at, id) phục vụ truy vấn này.'],
                src: 'docs/services/calling-service.md mục 3 và 4 + CallingService.reconcileParticipants (call.reconnectStartedAt ??= now) + call-session.entity.ts idx_call_sessions_reconnect_started',
              },
            ],
          },
          {
            tag: 'WORKER',
            file: TK,
            dedent: true,
            ranges: [fn('private async processActiveCalls(')],
            inline: [
              {
                at: ".andWhere('call.reconnect_started_at IS NULL')",
                text: ['Call đang trong cửa sổ reconnect bị loại khỏi nhóm này: đồng hồ free-limit tạm dừng suốt gián đoạn; khi cả hai quay lại, startedAt được dời qua đoạn tạm dừng.'],
                src: 'docs/services/calling-service.md mục 4 ("timer tạm dừng ... Cả hai quay lại thì dời mốc startedAt qua đoạn gián đoạn") + index idx_call_sessions_voice_deadline (reconnect_started_at IS NULL)',
              },
              {
                at: `.andWhere("call.call_kind = 'voice_match'")`,
                text: ['Chỉ Voice Match có giới hạn free; Friend call không đi qua free timer.'],
                src: 'comment gốc processActiveCalls (call-ticker.service.ts: "Friend calls have no Voice Match free-window") + docs/services/calling-service.md mục 4',
              },
              {
                at: "'call.started_at <= now() - make_interval(secs => :freeSeconds)',",
                text: ['Deadline và thứ tự đều theo started_at nên khớp index một phần (started_at, id): khi chưa có call nào quá hạn, truy vấn dừng ở đầu index thay vì lọc cả tập active còn mới. now() là giờ DB.'],
                src: 'migration 1759000000000-call-free-deadline-index.ts ("Deadline range/order must use started_at") + docs/services/calling-service.md mục 4 + test calling.integration.spec.ts "uses the deadline range index with many fresh calls and few overdue calls"',
              },
              {
                at: '.catch((err) =>',
                text: ['Lỗi của một call được log rồi đi tiếp call kế: một call hỏng không làm mất cả lô; lease được nhả ở cuối nên tick sau thử lại.'],
                src: 'call-ticker.service.ts processActiveCalls (log "thử lại ở tick sau" rồi releaseUnused cuối hàm)',
              },
            ],
          },
          {
            tag: 'POSTGRES',
            file: TK,
            dedent: true,
            ranges: [fn('private selectCandidates(')],
          },
          {
            tag: 'POSTGRES',
            file: TK,
            dedent: true,
            ranges: [fn('private async claimCandidates(')],
            inline: [
              {
                at: 'const [sql, parameters] = query',
                text: ['Chọn và claim là MỘT câu lệnh: SELECT ... FOR UPDATE SKIP LOCKED nằm trong CTE rồi UPDATE cột lease ngay trong câu đó. Các pod nhận lô rời nhau kể cả khi khoá hàng của SELECT đã nhả; hàng còn lease chưa hết hạn không được chọn lại.'],
                src: 'comment gốc claimCandidates (call-ticker.service.ts: "Selection and claim are one statement: replicas get disjoint batches even after row locks are released") + docs/adr/0015-bounded-runtime-recovery.md',
              },
              {
                at: 'return this.dataSource.query(',
                text: ['Lease = clock_timestamp() + CALLING_JOB_LEASE_MS theo đồng hồ DB, không theo đồng hồ pod: pod chết giữa chừng thì lease tự hết hạn và pod khác nhận lại lô. Lease chỉ điều phối at-least-once; trạng thái đúng vẫn do kiểm lại dưới row lock quyết định.'],
                src: 'comment gốc claimCandidates ("A crashed worker loses its claim automatically by the database clock") + docs/adr/0015-bounded-runtime-recovery.md ("Claims permit at-least-once retries after lease expiry; domain state/idempotency remain the safety mechanism")',
              },
            ],
          },
          {
            tag: 'POSTGRES',
            file: TK,
            dedent: true,
            ranges: [fn('private async releaseUnused(')],
            inline: [
              {
                at: 'await this.dataSource.query(',
                text: ['Nhả bằng so sánh ĐÚNG timestamp đã claim: lần nhả đến muộn, sau khi lease hết hạn và pod khác đã claim lại, sẽ không khớp nên không thu hồi nhầm lease mới. Một câu UPDATE cho cả lô qua jsonb_to_recordset.'],
                src: 'comment gốc releaseUnused (call-ticker.service.ts: "Compare the exact DB timestamp so a delayed release cannot revoke a newer worker\'s lease") + test call-ticker.service.spec.ts "failure releases the claimed batch using the exact lease timestamp"',
              },
            ],
          },
          {
            tag: 'WORKER',
            file: TK,
            dedent: true,
            ranges: [fn('private canStartCandidate(')],
            inline: [
              {
                at: 'return !this.stopping && (attempted === 0 || Date.now() < deadline);',
                text: ['Một SELECT claim chậm có thể đã dùng hết ngân sách, nhưng tick vẫn thử ít nhất MỘT ứng viên để luôn tiến triển (không đói vô hạn); shutdown luôn thắng quy tắc này.'],
                src: 'comment gốc canStartCandidate (call-ticker.service.ts: "A successful slow SELECT must still make progress; shutdown always wins over this allowance") + test call-ticker.service.spec.ts "a slow candidate SELECT still attempts one timer item, with rotation on the next tick"',
              },
            ],
          },
          {
            tag: 'SERVICE',
            file: SV,
            dedent: true,
            ranges: [fn('async endById(')],
            inline: [
              {
                at: 'const call = await manager.findOne(CallSession, {',
                text: ['Khoá FOR UPDATE là chốt chặn race giữa end tay, timer và webhook (cùng khoá một hàng call_sessions). Với skipLocked (timer) hàng đang bị khoá thì trả call = null ngay thay vì chờ.'],
                src: 'doc endById (calling.service.ts: "Lock call FOR UPDATE: đây chính là chốt chặn race end-vs-tick") + docs/services/calling-service.md mục 4 ("Khi thực hiện transition cũng bỏ qua row vừa bị khóa lại") + test calling.integration.spec.ts "pending skips an older locked row..."',
              },
              {
                at: 'if (shouldEnd && !shouldEnd(call)) return { call, justEnded: false };',
                text: ['Ứng viên của timer chỉ là ảnh chụp lúc SELECT: webhook có thể đã kích hoạt hoặc cho call hồi phục trong lúc chờ khoá. Điều kiện quá hạn được kiểm lại ở đây, dưới khoá; không còn đúng thì call giữ nguyên.'],
                src: 'comment gốc endById ("Ticker candidates are snapshots: a webhook may have activated/resumed the call while waiting for this lock") + docs/services/calling-service.md mục 4 (Race webhook-vs-tick) + test calling.integration.spec.ts "pending timeout rechecks under lock after both participants activate the selected call"',
              },
              {
                at: 'call.cleanupPending = true;',
                text: ['Marker cleanup được ghi cùng transaction với ended: process chết ngay sau commit cũng không làm mất việc dọn Matching và room, vòng cleanup sẽ nhặt lại.'],
                src: 'call-session.entity.ts cleanupPending ("Durable retry marker: committing ended must not lose Matching/SFU cleanup after a crash") + docs/services/calling-service.md mục 1 + test calling.integration.spec.ts "a fresh ticker discovers cleanup committed before a simulated process crash"',
              },
              {
                at: 'if (call.startedAt && call.reconnectStartedAt) {',
                text: ['Thời gian nằm trong cửa sổ reconnect không tính vào thời lượng: dời startedAt qua đoạn gián đoạn trước khi chốt durationSeconds (giờ server core-api là nguồn sự thật).'],
                src: 'comment gốc endById ("Không tính thời gian nằm trong cửa sổ reconnect vào thời lượng đã dùng") + docs/services/calling-service.md mục 1',
              },
              {
                at: 'if (result.justEnded && result.call) {',
                text: ['Chỉ lời gọi thực hiện transition mới ghi metric và publish call.ended: end lặp hoặc hai bên đua nhau không bắn lại.'],
                src: 'doc endById ("Chỉ lời gọi thực hiện transition mới publish realtime") + test calling.service.spec.ts "end lần đầu ... end lặp: không bắn lại"',
              },
              {
                at: 'if (result.call?.cleanupPending && !options?.deferCleanup) {',
                text: ['Timer truyền deferCleanup nên bỏ qua nhánh này: vòng timer không chờ SFU hay Matching. Việc dọn do vòng cleanup riêng nhặt qua marker (trang kế); end trực tiếp từ endpoint vẫn dọn ngay tại đây.'],
                src: 'docs/services/calling-service.md mục 4 ("Timer chỉ terminal hoá call và để marker cho cleanup; không chờ SFU ... Endpoint end trực tiếp vẫn thử cleanup ngay")',
              },
            ],
          },
        ],
      },
      {
        n: '02',
        slug: 'job-call-cleanup-tick',
        method: 'JOB',
        short: 'cleanup tick',
        route: 'CallTickerService.runCleanupOnce (mỗi CALLING_TICKER_INTERVAL_MS, trên mọi pod core-api)',
        name: 'Cleanup call đã ended: Matching rồi room LiveKit, giữ marker khi lỗi',
        title:
          'Claim các call ended còn cleanup_pending bằng lease cleanup_claim_until, dọn Matching rồi xoá room LiveKit với độ đồng thời có trần; lỗi thì giữ marker để thử lại và cả lượt lỗi thì nghỉ ngẫu nhiên 2,5–5 giây.',
        flow: '[WORKER] → [POSTGRES] → [SERVICE] → [EXTERNAL]',
        roles: [
          ['WORKER', 'ManagedInterval RIÊNG của timer (gate runExclusive và làn admission riêng): claim lô, chạy tối đa min(CALLING_CLEANUP_CONCURRENCY, DATABASE_POOL_MAX / 4) tác vụ song song, không khởi động thêm khi hết ngân sách hoặc shutdown, nghỉ khi cả lượt lỗi.'],
          ['POSTGRES', 'Cùng câu claim UPDATE ... SKIP LOCKED nhưng trên cột lease riêng cleanup_claim_until, chọn theo index một phần (updated_at, id) của call ended còn cleanup_pending; nhả lease bằng timestamp chính xác.'],
          ['SERVICE', 'CallingService.endById trên call đã ended chỉ khoá và đọc lại (không metric, không publish lần nữa) rồi chạy cleanup: chốt MatchSession, xoá room, xoá marker; lỗi thì giữ marker và đẩy call về cuối hàng đợi.'],
          ['EXTERNAL', 'LiveKit RoomService.deleteRoom qua port và adapter; 404 (room đã bị xoá ở lần thử trước) coi là xong, lỗi khác ném lên để marker còn nguyên.'],
        ],
        tables: [
          ['call_sessions', 'cleanup_pending (marker bền vững, ghi cùng transaction với ended), cleanup_claim_until (lease), updated_at (thứ tự hàng đợi). Index một phần idx_call_sessions_cleanup_pending (updated_at, id) WHERE status = ended AND cleanup_pending.'],
          ['match_sessions', 'endVoiceSessionForCall chốt MatchSession Voice Match của cặp sang ended nếu còn confirmed (không chép).'],
        ],
        related: [
          ['Timer cuộc gọi', 'trang trước (job-call-timer-tick): chỉ terminal hoá call và để marker, không chờ SFU (không chép ở đây).'],
          ['Admission theo DataSource', 'làn critical của timer và làn thường dùng chung của cleanup: chi tiết ở trang Vòng đời dữ liệu (không chép).'],
        ],
        nested: true,
        steps: [
          { at: 'onApplicationBootstrap(): void {', text: 'Đăng ký HAI ManagedInterval riêng trong mỗi pod: timer (làn critical) và cleanup (làn thường)' },
          { at: 'await this.cleanupJob.runExclusive(async () => {', text: 'Một tick cleanup, gate runExclusive riêng nên không chặn timer' },
          { at: 'const pending = await this.selectCandidates(', text: 'Claim tối đa 100 call ended còn cleanup_pending bằng lease cleanup_claim_until' },
          { at: 'const concurrency = Math.min(', text: 'Độ đồng thời bị chặn bởi cấu hình, pool/4 và số call đã claim' },
          { at: 'const result = await this.callingService.endById(', text: 'Dọn từng call qua endById: đọc lại dưới khoá rồi chạy cleanup' },
          { at: 'await this.cleanupEndedCall(result.call);', text: 'Chốt Matching, xoá room SFU, rồi mới xoá marker' },
          { at: 'await this.roomService.deleteRoom(roomName);', text: 'Gọi LiveKit xoá room; 404 (đã xoá) coi là xong' },
          { at: 'await this.callRepo.update(', in: 'endById', text: 'Cleanup lỗi: giữ marker và đẩy call về cuối hàng đợi' },
          { at: "await this.releaseUnused(pending, 'cleanup_claim_until');", text: 'Nhả lease của cả lô để call chưa xong được thử lại' },
          { at: 'if (next > 0 && failures === next) {', text: 'Cả lượt đều lỗi: nghỉ ngẫu nhiên 2,5–5 giây trước khi thử lại' },
        ],
        items: [
          {
            tag: 'WORKER',
            file: TK,
            dedent: true,
            ranges: [fn('onApplicationBootstrap(')],
            inline: [
              {
                at: "priority: 'critical'",
                text: ['Timer đi làn critical của admission: một slot riêng và hai kết nối pool dành riêng (claim + tác vụ), nên job nền ở làn thường, kể cả cleanup chậm vì SFU, không chiếm chỗ của timer.'],
                src: 'ManagedInterval priority "critical" (managed-interval.ts) + background-database-admission.ts (critical: new AdmissionLane(1); CRITICAL_RESERVED_CONNECTIONS = 2) + docs/services/calling-service.md mục 4 ("Calling ticker dùng lane critical riêng (một tick)")',
              },
              {
                at: 'this.cleanupJob.start(this.scheduler, {',
                text: ['Cleanup là ManagedInterval RIÊNG (gate runExclusive riêng, làn admission thường): SFU (hoặc Matching) chậm giữ vòng cleanup lâu thì timer ở trên vẫn chạy và vẫn chốt call quá hạn.'],
                src: 'doc runCleanupOnce (call-ticker.service.ts: "Independent lifecycle: a slow SFU must never occupy the server timer\'s runExclusive gate") + docs/services/calling-service.md mục 4 + test call-ticker.service.spec.ts "a stalled cleanup does not block the independent server timer"',
              },
            ],
          },
          {
            tag: 'WORKER',
            file: TK,
            dedent: true,
            ranges: [fn('async runCleanupOnce(')],
            inline: [
              {
                at: 'if (this.stopping || Date.now() < this.cleanupRetryAfter) return;',
                text: ['Đang shutdown thì không bắt đầu tick. Sau một lượt lỗi toàn bộ, cleanup nghỉ tới cleanupRetryAfter thay vì gõ lại dependency đang hỏng mỗi giây; timer ở vòng riêng vẫn chạy.'],
                src: 'comment gốc runCleanupOnce ("All attempts failed: avoid hammering the same dependency once per second during an outage") + test call-ticker.service.spec.ts "backs off an entirely failing cleanup batch without blocking the timer"',
              },
              {
                at: 'const concurrency = Math.min(',
                text: ['Độ đồng thời bị chặn bởi CALLING_CLEANUP_CONCURRENCY (mặc định 2), bởi số call đã claim, và bởi DATABASE_POOL_MAX / 4 (tối thiểu 1): đúng phần pool mà admission đã tính cho worker song song của một slot job nền, nên pool nhỏ không bị cleanup vượt phần của nó.'],
                src: 'docs/services/calling-service.md mục 4 ("Cleanup mặc định tối đa hai tác vụ đồng thời, luôn bị chặn trên ở floor(DATABASE_POOL_MAX / 4) (tối thiểu một)") + background-database-admission.ts ("Each regular slot budgets a claim plus the existing bounded workers\' pool/4 parallelism. Tasks must keep that bound") + env.validation.ts CALLING_CLEANUP_CONCURRENCY (mặc định 2) + test call-ticker.service.spec.ts "small pools reserve capacity and one cleanup failure does not stop the others"',
              },
              {
                at: 'const call = pending[next++];',
                text: ['Các worker song song lấy chung một con trỏ next; hết ngân sách hoặc shutdown thì không khởi động thêm, còn lệnh đã bắt đầu vẫn chờ driver (deadline hợp tác, không huỷ ngay).'],
                src: 'docs/services/calling-service.md mục 4 ("hết ngân sách hoặc shutdown thì không khởi động thêm tác vụ ... deadline hợp tác") + test call-ticker.service.spec.ts "cleanup bounds concurrency and starts no further work after the deadline"',
              },
              {
                at: '{ skipLocked: true },',
                text: ['Không truyền deferCleanup: call đã ended nên endById chỉ khoá, đọc lại rồi chạy cleanup ngay trong lời gọi này. skipLocked bỏ qua call đang bị khoá thay vì chờ.'],
                src: 'CallingService.endById (nhánh cleanupPending && !deferCleanup) + test calling.integration.spec.ts "cleanup skips an older locked row and progresses another call, then retries after unlock"',
              },
              {
                at: 'if (result.call?.cleanupPending) failures++;',
                text: ['endById không ném khi cleanup lỗi mà giữ marker; lỗi nhận ra qua cờ cleanupPending còn bật trên call trả về.'],
                src: 'CallingService.endById (catch: logger.warn rồi giữ cleanupPending) + runCleanupOnce (failures === next)',
              },
              {
                at: "await this.releaseUnused(pending, 'cleanup_claim_until');",
                text: ['Nhả lease của cả lô: call lỗi hoặc chưa được thử được claim lại ở tick sau (sau thời gian nghỉ nếu cả lượt lỗi).'],
                src: 'releaseUnused + docs/services/calling-service.md mục 4 ("lease được thả bằng so sánh timestamp chính xác, kể cả nhánh lỗi hoặc skip do lock")',
              },
              {
                at: 'if (next > 0 && failures === next) {',
                text: ['Mọi call đã thử đều lỗi thì nghỉ ngẫu nhiên 2,5–5 giây (5 giây × 0,5–1,0). Đây là backoff theo process, không phải lịch retry bền vững cho từng room: marker trong DB mới giữ việc còn lại.'],
                src: 'docs/services/calling-service.md mục 4 (đoạn cuối: "nghỉ ngẫu nhiên 2,5–5 giây ... Đây là backoff theo process, không phải lịch retry bền vững cho từng room") + CLEANUP_FAILURE_BACKOFF_MS',
              },
            ],
          },
          {
            tag: 'WORKER',
            file: TK,
            dedent: true,
            ranges: [fn('private tickDeadline(')],
          },
          {
            tag: 'POSTGRES',
            file: TK,
            dedent: true,
            ranges: [fn('private selectCandidates(')],
          },
          {
            tag: 'POSTGRES',
            file: TK,
            dedent: true,
            ranges: [fn('private async claimCandidates(')],
            inline: [
              {
                at: 'const [sql, parameters] = query',
                text: ['Chọn và claim là MỘT câu lệnh (SELECT ... FOR UPDATE SKIP LOCKED trong CTE rồi UPDATE lease): hai pod nhận các lô rời nhau. Cleanup dùng cột riêng cleanup_claim_until, tách khỏi lease của timer.'],
                src: 'comment gốc claimCandidates (call-ticker.service.ts: "Selection and claim are one statement") + docs/services/calling-service.md mục 4 ("timer_claim_until / cleanup_claim_until riêng") + call-session.entity.ts',
              },
              {
                at: 'return this.dataSource.query(',
                text: ['Lease theo đồng hồ DB: pod chết giữa chừng thì lease tự hết hạn và pod khác nhận lại lô (mặc định CALLING_JOB_LEASE_MS = 30 giây). Cleanup là at-least-once nên chạy lại một call là an toàn.'],
                src: 'comment gốc claimCandidates ("A crashed worker loses its claim automatically by the database clock") + docs/services/calling-service.md mục 4 ("Cleanup là at-least-once và idempotent") + env.validation.ts CALLING_JOB_LEASE_MS',
              },
            ],
          },
          {
            tag: 'POSTGRES',
            file: TK,
            dedent: true,
            ranges: [fn('private async releaseUnused(')],
            inline: [
              {
                at: 'await this.dataSource.query(',
                text: ['Nhả bằng so sánh ĐÚNG timestamp đã claim: lần nhả đến muộn không thu hồi nhầm lease mới của pod khác.'],
                src: 'comment gốc releaseUnused (call-ticker.service.ts: "Compare the exact DB timestamp so a delayed release cannot revoke a newer worker\'s lease")',
              },
            ],
          },
          {
            tag: 'WORKER',
            file: TK,
            dedent: true,
            ranges: [fn('private canStartCandidate(')],
            inline: [
              {
                at: 'return !this.stopping && (attempted === 0 || Date.now() < deadline);',
                text: ['Ngay cả khi SELECT claim chậm đã dùng hết ngân sách, cleanup vẫn thử ít nhất MỘT call (attempted = 0) để luôn tiến triển; sau đó hết ngân sách hoặc shutdown thì không khởi động thêm.'],
                src: 'comment gốc canStartCandidate (call-ticker.service.ts: "A successful slow SELECT must still make progress; shutdown always wins over this allowance") + test call-ticker.service.spec.ts "a slow cleanup SELECT allows one task total across workers after the deadline"',
              },
            ],
          },
          {
            tag: 'SERVICE',
            file: SV,
            dedent: true,
            ranges: [fn('async endById(')],
            inline: [
              {
                at: 'if (call.status === CallSessionStatus.Ended) {',
                text: ['Cleanup đi qua nhánh này: call đã ended thì chỉ trả lại trạng thái với justEnded = false, nên chạy lại cleanup (at-least-once) không ghi metric hay publish call.ended lần nữa.'],
                src: 'doc endById (calling.service.ts: "Chỉ lời gọi thực hiện transition mới publish realtime") + docs/services/calling-service.md mục 4 ("Cleanup là at-least-once và idempotent; transition, metric kết thúc và lần publish realtime chỉ phát sinh ở nhánh justEnded")',
              },
              {
                at: 'await this.callRepo.update(',
                text: ['Cleanup lỗi: giữ marker và đẩy call về CUỐI hàng đợi (hàng đợi sắp theo updated_at, UPDATE này làm mới cột đó), để một room hỏng vĩnh viễn không đứng đầu mãi và bỏ đói các call khác.'],
                src: 'comment gốc endById ("Requeue at the tail: a permanently failing room must not starve newer cleanup tasks") + order updatedAt trong runCleanupOnce + base.entity.ts updatedAt (@UpdateDateColumn)',
              },
            ],
          },
          {
            tag: 'SERVICE',
            file: SV,
            dedent: true,
            ranges: [fn('private async cleanupEndedCall(')],
            inline: [
              {
                at: 'if (call.callKind !== CallKind.Friend && call.matchSessionId)',
                text: ['Chốt MatchSession (ended) cho cả cặp TRƯỚC khi xoá room; chỉ khi cả Matching lẫn SFU thành công marker mới bị xoá. Friend call không có MatchSession nên bỏ qua bước này.'],
                src: 'docs/services/calling-service.md mục 1 ("cleanup chốt Matching rồi deleteRoom LiveKit; chỉ khi cả hai thành công mới xoá marker") + test calling.integration.spec.ts "committed call end retains cleanup after a one-time Matching failure, then ticker retries it"',
              },
              {
                at: 'await this.livekit.deleteRoom(call.roomName);',
                text: ['[EXTERNAL] Xoá room trên SFU chạy SAU khi transaction của endById đã commit: SFU chậm không giữ khoá hàng call_sessions.'],
                src: 'CallingService.endById (cleanupEndedCall gọi sau dataSource.transaction) + docs/plans/2026-10-21-scale-recovery-review.md ("SFU I/O occurs outside row locks")',
              },
              {
                at: 'await this.callRepo.update(call.id, { cleanupPending: false });',
                text: ['Marker chỉ bị xoá khi Matching và SFU đều thành công; một trong hai ném lỗi thì marker còn nguyên và tick cleanup sau thử lại.'],
                src: 'docs/services/calling-service.md mục 1 + test calling.integration.spec.ts "SFU deletion failure leaves a durable retry marker until a later ticker succeeds"',
              },
            ],
          },
          {
            tag: 'EXTERNAL',
            file: AD,
            dedent: true,
            ranges: [fn('deleteRoom(roomName: string): Promise<void> {')],
          },
          {
            tag: 'EXTERNAL',
            file: SDK,
            dedent: true,
            ranges: [fn('async deleteRoom(')],
            inline: [
              {
                at: 'if (this.isNotFound(error)) return;',
                text: ['Cleanup là at-least-once: lần thử lại sau khi room đã bị xoá nhận 404 thì coi là xong. Mọi lỗi khác ném lên để marker còn nguyên và được thử lại.'],
                src: 'comment gốc deleteRoom (livekit-sdk.client.ts: "A retried cleanup is complete when the first attempt already deleted the room") + docs/services/calling-service.md mục 1 ("404 room đã xoá = thành công")',
              },
            ],
          },
          {
            tag: 'EXTERNAL',
            file: SDK,
            dedent: true,
            ranges: [fn('private isNotFound(')],
          },
        ],
      },
      {
        n: '03',
        slug: 'get-call-state',
        method: 'GET',
        short: '/calling/calls/:id',
        route: '/api/v1/calling/calls/:id',
        name: 'Trạng thái call: đối soát SFU mà không gia hạn reconnect grace',
        title:
          'Chỉ member đọc được; mỗi lần poll hỏi SFU ai đang có mặt (ngoài row lock), nếu cần ghi thì khoá hàng và kiểm lại status + snapshot trước khi mở hoặc giữ nguyên reconnect grace và phục hồi timer; SFU lỗi thì giữ nguyên call.',
        flow: '[CONTROLLER] → [SERVICE] → [EXTERNAL] → [SERVICE] → [POSTGRES]',
        roles: [
          ['CONTROLLER', 'Nhận callId, trả CallDto kèm trạng thái like; chỉ member của call đọc được (người ngoài nhận cùng 404 như call không tồn tại).'],
          ['SERVICE', 'Đối soát participant với SFU làm backstop khi webhook mất: ghi member đang có mặt như participant_joined, mở hoặc giữ nguyên reconnect grace, phục hồi timer; mọi ghi chỉ sau khi khoá hàng và kiểm lại status + snapshot.'],
          ['EXTERNAL', 'LiveKit RoomService.listParticipants qua port và adapter; chạy NGOÀI row lock, lỗi thì giữ nguyên trạng thái đã lưu.'],
          ['POSTGRES', 'Transaction ngắn chỉ khi có gì cần ghi: SELECT ... FOR UPDATE rồi UPDATE các mốc joined/started/reconnect/disconnected của call.'],
        ],
        tables: [
          ['call_sessions', 'đọc trạng thái; đối soát có thể ghi joined_a_at / joined_b_at, started_at, reconnect_started_at, disconnected_a_at / disconnected_b_at và chuyển pending → active dưới row lock. Không bao giờ chuyển sang ended: việc đó của ticker và endpoint end.'],
        ],
        related: [
          ['Timer cuộc gọi', 'trang job-call-timer-tick: chốt ended(completed) khi grace do GET hoặc webhook mở đã quá hạn (không chép ở đây).'],
          ['Webhook LiveKit', 'kênh chính cập nhật joined / left; GET này chỉ là backstop khi webhook mất (không chép ở đây).'],
          ['Trạng thái like', 'getLikeState đọc voice_match_reactions và quan hệ bạn bè để trả liked / matched; hop CRUD cơ bản (không chép).'],
        ],
        nested: true,
        steps: [
          { at: "@Get('calls/:id')", text: 'Poll fallback của realtime call.ended: chỉ member của call đọc được' },
          { at: 'const call = await this.callingService.getCall(user, id);', text: 'Đọc call kèm đối soát SFU rồi dựng response' },
          { at: 'throw new DomainException(', in: 'CallingService.getCall', text: 'Người ngoài call nhận cùng 404 như call không tồn tại (không lộ call có tồn tại)' },
          { at: 'call = await this.reconcileCallWithLivekit(call);', text: 'Đối soát participant với SFU làm backstop khi webhook bị mất' },
          { at: 'identities = await this.livekit.listParticipantIdentities(call.roomName);', text: 'Hỏi SFU ai đang thật sự trong room (ngoài row lock; lỗi thì giữ nguyên call)' },
          { at: 'return this.dataSource.transaction(async (manager) => {', in: 'reconcileParticipants', text: 'Chỉ khi có gì cần ghi mới mở transaction và khoá hàng' },
          { at: 'if (call.status !== observed.status || !unchanged) return call;', text: 'Webhook đã đổi call trong lúc chờ SFU: bỏ kết quả cũ, trả call mới nhất' },
          { at: 'this.recordParticipantJoined(call, identity, now);', in: 'reconcileParticipants', text: 'Ghi member đang có mặt như participant_joined (set-if-null)' },
          { at: 'call.reconnectStartedAt ??= now;', text: 'Có member vắng mặt: mở grace hoặc GIỮ NGUYÊN mốc đã lưu' },
          { at: 'this.resumeCallTimer(call, now);', in: 'reconcileParticipants', text: 'Cả hai có mặt: phục hồi timer và loại khoảng tạm dừng' },
        ],
        items: [
          { tag: 'CONTROLLER', file: CT, dedent: true, ranges: [fn("@Get('calls/:id')")] },
          {
            tag: 'SERVICE',
            file: SV,
            dedent: true,
            ranges: [fn('async getCall(')],
            inline: [
              {
                at: 'throw new DomainException(',
                text: ['Call không tồn tại và call của người khác trả CÙNG một 404, để người ngoài không dò được call nào tồn tại.'],
                src: 'doc getCall (calling.service.ts: "chỉ member (gộp 404, chống oracle)") + test calling.integration.spec.ts "IDOR: người ngoài session/call nhận CÙNG 404"',
              },
              {
                at: 'call = await this.reconcileCallWithLivekit(call);',
                text: ['GET không chỉ đọc DB: webhook là kênh chính nhưng có thể mất, nên mỗi lần poll đối soát với SFU làm backstop. Mọi thay đổi chỉ được ghi dưới row lock ở bước sau, không ghi thẳng từ kết quả SFU.'],
                src: 'doc reconcileCallWithLivekit (calling.service.ts: "Webhook là kênh chính; đối soát RoomService là backstop cho cấu hình webhook lỗi/mất mạng") + docs/services/calling-service.md mục 3',
              },
            ],
          },
          {
            tag: 'SERVICE',
            file: SV,
            dedent: true,
            ranges: [fn('private async reconcileCallWithLivekit(')],
            inline: [
              {
                at: 'identities = await this.livekit.listParticipantIdentities(call.roomName);',
                text: ['[EXTERNAL] Gọi SFU nằm NGOÀI mọi row lock và transaction: SFU chậm không giữ khoá call_sessions. Vì vậy kết quả chỉ là ảnh chụp, được kiểm lại dưới khoá ở reconcileParticipants.'],
                src: 'comment gốc reconcileParticipants (calling.service.ts: "SFU I/O runs outside the lock") + docs/plans/2026-10-21-scale-recovery-review.md ("SFU I/O occurs outside row locks")',
              },
              {
                at: 'return call;',
                text: ['SFU lỗi thì giữ nguyên call đã lưu thay vì trả 500: màn cuộc gọi không được mất vì RoomService tạm unavailable; webhook và ticker vẫn là đường dự phòng.'],
                src: 'comment gốc reconcileCallWithLivekit ("GET không được biến lỗi hạ tầng SFU thành lỗi 500") + test calling.service.spec.ts "unavailable SFU keeps the stored call and reconnect grace unchanged"',
              },
            ],
          },
          {
            tag: 'EXTERNAL',
            file: AD,
            dedent: true,
            ranges: [fn('listParticipantIdentities(roomName: string): Promise<string[]> {')],
          },
          {
            tag: 'EXTERNAL',
            file: SDK,
            dedent: true,
            ranges: [fn('async listParticipantIdentities(')],
          },
          {
            tag: 'SERVICE',
            file: SV,
            dedent: true,
            ranges: [fn('private async reconcileParticipants(')],
            inline: [
              {
                at: 'if (',
                text: ['Hai trường hợp không có gì để ghi (pending mà SFU chưa thấy ai; active đang khoẻ: cả hai có mặt và không trong grace) trả ngay, không mở transaction và không khoá hàng.'],
                src: 'calling.service.ts reconcileParticipants (hai guard đầu trả observed trước transaction)',
              },
              {
                at: 'const call = await manager.findOne(CallSession, {',
                text: ['Khoá hàng rồi MỚI so snapshot: kết quả SFU đã cũ sau lúc chờ I/O, webhook có thể đã commit rejoin hoặc disconnect mới.'],
                src: 'comment gốc reconcileParticipants ("SFU I/O runs outside the lock. Ignore both presence and absence observations if a webhook changed this call while the snapshot was in flight") + docs/plans/2026-10-21-scale-recovery-review.md (bảng, dòng "SFU snapshot cannot overwrite newer webhook state")',
              },
              {
                at: 'if (call.status !== observed.status || !unchanged) return call;',
                text: ['Status hoặc một mốc bất kỳ (joined, started, reconnect, disconnected, updatedAt) đã đổi thì BỎ kết quả SFU và trả call mới nhất: snapshot cũ không mở lại grace sau rejoin và không xoá mất disconnect mới đã commit.'],
                src: 'docs/services/calling-service.md mục 3 + test calling.integration.spec.ts "SFU GET snapshot finishing after a committed rejoin cannot reopen reconnect grace", "stale SFU presence cannot clear a concurrent disconnect committed while fetching participants", "pending SFU snapshot cannot override webhook activation followed by a newer disconnect"',
              },
              {
                at: 'for (const identity of [call.userAId, call.userBId]) {',
                text: ['Webhook joined bị mất cũng không sao: member nào thật sự có mặt ở SFU được ghi như participant_joined (set-if-null), đủ hai bên thì pending thành active. Identity chỉ lấy từ hai member của call, client không tự khai.'],
                src: 'docs/services/calling-service.md mục 3 ("mọi identity member đang thật sự có mặt sẽ được ghi nhận như participant_joined ... Client không được tự gửi cờ active/joined") + port listParticipantIdentities (ports/livekit-room.ts)',
              },
              {
                at: 'call.reconnectStartedAt ??= now;',
                text: ['Chỉ mở grace khi chưa có: ??= giữ NGUYÊN mốc đã lưu (từ webhook hoặc lần poll đầu), nên poll lặp lại không gia hạn cửa sổ; quá hạn thì ticker mới chốt call.'],
                src: 'docs/services/calling-service.md mục 3 ("mở hoặc giữ nguyên reconnect grace đã lưu ... không gia hạn cửa sổ qua mỗi lần poll") + test calling.service.spec.ts "disconnect → repeated GET preserves grace → rejoin resumes the same call" + docs/plans/2026-10-21-scale-recovery-review.md (calling.service.ts:623)',
              },
              {
                at: 'this.resumeCallTimer(call, now);',
                text: ['Cả hai member đều có mặt mà DB vẫn ghi grace (webhook rejoin bị mất): phục hồi timer và loại khoảng tạm dừng khỏi thời lượng, nên ticker không chốt nhầm một call đang khoẻ.'],
                src: 'docs/services/calling-service.md mục 3 ("Khi cả hai member hiện diện, đối soát cũng phục hồi timer và loại khoảng tạm dừng dù webhook rejoin bị mất") + test calling.integration.spec.ts "SFU recovers lost joined webhooks, accounts the pause and prevents ticker ending a healthy call"',
              },
            ],
          },
          {
            tag: 'SERVICE',
            file: SV,
            dedent: true,
            ranges: [fn('private recordParticipantJoined(')],
            inline: [
              {
                at: 'if (identity === call.userAId) call.joinedAAt ??= now;',
                text: ['Set-if-null: ghi lại lần join thứ hai (webhook trùng hoặc đối soát) không đổi mốc đã có, nên startedAt chỉ được đặt một lần.'],
                src: 'doc handleWebhookEvent (calling.service.ts: "joined = set-if-null") + docs/services/calling-service.md mục 1',
              },
              {
                at: 'if (identity === call.userAId) call.disconnectedAAt = null;',
                text: ['Member quay lại thì xoá dấu rời phòng của chính họ; timer chỉ chạy tiếp khi cả hai dấu đều null.'],
                src: 'call-session.entity.ts disconnectedAAt ("để chỉ resume timer khi cả hai đã quay lại") + CallingService.resumeCallTimer',
              },
            ],
          },
          {
            tag: 'SERVICE',
            file: SV,
            dedent: true,
            ranges: [fn('private resumeCallTimer(')],
            inline: [
              {
                at: 'call.startedAt = new Date(call.startedAt.getTime() + pausedMs);',
                text: ['Dời startedAt đúng bằng khoảng tạm dừng nên mốc free-limit (startedAt + CALLING_FREE_CALL_SECONDS) cũng được đẩy muộn theo. Rồi xoá reconnectStartedAt, nên poll hoặc webhook joined lặp lại không cộng khoảng tạm dừng lần hai.'],
                src: 'docs/plans/2026-10-21-scale-recovery-review.md (dòng "Pause is accounted once": locked timer helper calling.service.ts:712 clears grace after accounting) + docs/services/calling-service.md mục 4',
              },
            ],
          },
        ],
      },
      {
        n: '04',
        slug: 'post-livekit-webhook',
        method: 'POST',
        short: '/calling/webhooks/livekit',
        route: '/api/v1/calling/webhooks/livekit',
        name: 'Webhook LiveKit: verify chữ ký, ghi joined / left idempotent',
        title:
          'Endpoint công khai chỉ tin event sau khi verify chữ ký trên nguyên văn body; mỗi event chạy trong một transaction khoá hàng với set-if-null và kiểm status nên webhook gửi lại, đến trễ hoặc sai thứ tự không phá trạng thái; rời phòng chỉ mở reconnect grace, không end call.',
        flow: '[CONTROLLER] → [EXTERNAL] → [SERVICE] → [POSTGRES]',
        roles: [
          ['CONTROLLER', '@Public vì LiveKit không có JWT của user: lấy nguyên văn body và header Authorization, verify rồi mới đọc event; thiếu hoặc sai chữ ký thì 401; đã verify thì trả 200 sau khi service xử lý xong.'],
          ['EXTERNAL', 'WebhookReceiver của SDK LiveKit verify chữ ký JWT ký bằng API key/secret trên body nguyên văn; adapter rút gọn event còn loại, room và identity.'],
          ['SERVICE', 'Bỏ qua room không phải call-*; joined ghi mốc set-if-null (đủ hai bên thì active); left, connection aborted và room_finished chỉ mở reconnect grace; ended là terminal nên event đến sau chỉ là no-op.'],
          ['POSTGRES', 'Mỗi event một transaction SELECT ... FOR UPDATE trên call_sessions rồi UPDATE các mốc; các webhook và lần đối soát GET đến cùng lúc chạy lần lượt trên cùng hàng.'],
        ],
        tables: [
          ['call_sessions', 'webhook ghi joined_a_at / joined_b_at (set-if-null), started_at và pending → active khi đủ hai bên, disconnected_a_at / disconnected_b_at và reconnect_started_at khi rời phòng, rồi xoá dấu và dời started_at khi cả hai quay lại. Không bao giờ chuyển sang ended: việc đó của ticker và endpoint end.'],
        ],
        related: [
          ['Timer cuộc gọi', 'trang job-call-timer-tick: chốt ended(completed) khi grace do webhook mở đã quá hạn (không chép ở đây).'],
          ['Đối soát khi poll', 'trang GET /calling/calls/:id dùng cùng recordParticipantJoined và resumeCallTimer làm backstop khi webhook mất (không chép ở đây).'],
        ],
        nested: true,
        steps: [
          { at: '@Public()', text: 'LiveKit gọi vào endpoint công khai: không có JWT user, chữ ký thay thế' },
          { at: "const rawBody = req.rawBody?.toString('utf8');", text: 'Lấy nguyên văn body để verify chữ ký' },
          { at: 'event = await this.livekit.receiveWebhook(rawBody, authHeader);', text: 'Verify chữ ký JWT rồi rút gọn event; sai chữ ký thì 401' },
          { at: 'await this.callingService.handleWebhookEvent(event);', text: 'Xử lý idempotent: biến event thành chuyển trạng thái của call' },
          { at: "if (!event.roomName?.startsWith('call-')) return;", text: 'Chỉ room của calling; không có call tương ứng thì bỏ qua' },
          { at: 'await this.markJoined(call.id, event.participantIdentity);', text: 'participant_joined: ghi mốc join (set-if-null), đủ hai bên thì active' },
          { at: 'await this.markDisconnected(call.id, event.participantIdentity);', text: 'participant_left hoặc connection aborted: mở reconnect grace, không end call' },
          { at: 'await this.markRoomDisconnected(call.id);', text: 'room_finished: coi cả hai đã rời, vẫn chỉ mở grace' },
          { at: 'this.resumeCallTimer(call, now);', in: 'markJoined', text: 'Cả hai đã quay lại: dời startedAt qua đoạn gián đoạn và xoá grace' },
          { at: 'call.reconnectStartedAt ??= now;', in: 'markDisconnected', text: 'Mốc grace chỉ đặt một lần, left lặp lại không kéo dài cửa sổ' },
        ],
        items: [
          { tag: 'CONTROLLER', file: WH, dedent: true, ranges: [fn("@Post('livekit')")], inline: [
            {
              at: "const rawBody = req.rawBody?.toString('utf8');",
              text: ['LiveKit không có JWT của user nên endpoint là @Public; thay vào đó chữ ký JWT ký bằng API key/secret được verify trên NGUYÊN VĂN body TRƯỚC khi đọc nội dung event. Thiếu body hoặc header, hoặc sai chữ ký, thì 401.'],
              src: 'doc LivekitWebhookController (livekit-webhook.controller.ts: "@Public (LiveKit không có JWT user) nhưng chữ ký JWT ký bằng API key/secret được verify trên NGUYÊN VĂN body (main.ts bật rawBody) TRƯỚC khi đọc nội dung. Sai chữ ký → 401")',
            },
            {
              at: 'await this.callingService.handleWebhookEvent(event);',
              text: ['Event đã rút gọn chỉ còn loại, room và identity (không có id để dedup), nên webhook gửi lại hoặc đến sai thứ tự an toàn nhờ trạng thái: set-if-null và kiểm status dưới row lock ở service.'],
              src: 'ports/livekit-room.ts LivekitWebhookEvent ({event, roomName, participantIdentity}) + doc handleWebhookEvent (calling.service.ts: "Idempotent với retry/out-of-order") + doc LivekitWebhookController ("Xử lý idempotent (service) → LiveKit retry an toàn")',
            },
          ] },
          { tag: 'EXTERNAL', file: AD, dedent: true, ranges: [fn('async receiveWebhook(')] },
          { tag: 'EXTERNAL', file: SDK, dedent: true, ranges: [fn('async receiveWebhook(')], inline: [
            {
              at: 'const event = await this.receiver.receive(rawBody, authHeader);',
              text: ['WebhookReceiver verify chữ ký JWT của header Authorization trên body nguyên văn; sai chữ ký thì ném lỗi và controller đổi thành 401.'],
              src: 'livekit-sdk.client.ts (receiver = new WebhookReceiver(apiKey, apiSecret)) + port LivekitRoomPort.receiveWebhook ("Verify chữ ký webhook ... sai chữ ký thì throw") + livekit-webhook.controller.ts (catch → WEBHOOK_INVALID 401)',
            },
          ] },
          {
            tag: 'SERVICE',
            file: SV,
            dedent: true,
            ranges: [fn('async handleWebhookEvent(')],
            inline: [
              {
                at: "if (!event.roomName?.startsWith('call-')) return;",
                text: ['Tiền tố call- là cố định theo id call: room khác bị bỏ qua trước khi chạm DB, và room call-* không có call tương ứng cũng chỉ bị bỏ qua.'],
                src: 'call-session.entity.ts callRoomName ("prefix cố định để webhook lọc room không thuộc mình") + test calling.service.spec.ts "room không phải call-* hoặc không có call → bỏ qua"',
              },
              {
                at: "case 'participant_left':",
                text: ['Rời phòng hay mất kết nối KHÔNG end call: chỉ mở cửa sổ reconnect (timer tạm dừng). Ticker mới chốt call khi quá CALLING_RECONNECT_WINDOW_SECONDS.'],
                src: 'docs/services/calling-service.md mục 1 và 3 + test calling.service.spec.ts "participant_left mở reconnect grace, không end call ngay"',
              },
              {
                at: "case 'room_finished':",
                text: ['LiveKit có thể phát participant_left hoặc room_finished vì mất mạng hay connection bị abort, nên room_finished cũng chỉ mở grace: chờ reconnect ngắn trước khi terminal hoá.'],
                src: 'comment gốc handleWebhookEvent (calling.service.ts: "LiveKit có thể phát participant_left/room_finished do mất mạng hoặc connection bị abort. Chờ reconnect ngắn trước khi terminal hóa call.")',
              },
            ],
          },
          {
            tag: 'SERVICE',
            file: SV,
            dedent: true,
            ranges: [fn('private async markJoined(')],
            inline: [
              {
                at: 'const call = await manager.findOne(CallSession, {',
                text: ['Mỗi webhook là một transaction khoá hàng nên các webhook đến cùng lúc (joined của hai bên, left, lần đối soát GET) chạy lần lượt trên cùng call và không ghi đè nhau. Thứ tự đến không được đảm bảo: tính đúng nằm ở set-if-null và kiểm status.'],
                src: 'doc handleWebhookEvent (calling.service.ts: "Idempotent với retry/out-of-order") + docs/services/calling-service.md mục 1 ("webhook LiveKit retry/đến trễ/out-of-order không phá state")',
              },
              {
                at: 'if (!call || call.status === CallSessionStatus.Ended) return;',
                text: ['Ended là terminal: webhook joined đến trễ hoặc gửi lại sau khi call đã kết thúc là no-op, không đảo ngược trạng thái.'],
                src: 'docs/services/calling-service.md mục 1 ("webhook đến sau khi call đã ended là retry/no-op")',
              },
              {
                at: 'this.resumeCallTimer(call, now);',
                text: ['Chỉ resume khi CẢ HAI đã quay lại: joined của bên thứ nhất chỉ xoá dấu của bên đó và grace vẫn còn; joined của bên thứ hai mới dời startedAt và xoá grace.'],
                src: 'test calling.service.spec.ts "cả hai re-join thì resume timer sau khoảng gián đoạn" + CallingService.resumeCallTimer',
              },
            ],
          },
          {
            tag: 'SERVICE',
            file: SV,
            dedent: true,
            ranges: [fn('private recordParticipantJoined(')],
            inline: [
              {
                at: 'if (identity === call.userAId) call.joinedAAt ??= now;',
                text: ['Set-if-null: webhook joined trùng không đổi mốc đã có, nên startedAt chỉ được đặt một lần. Identity lạ (không phải một trong hai member) rơi xuống nhánh trả false và markJoined không save gì; identity hợp lệ luôn do server đặt khi mint token.'],
                src: 'doc handleWebhookEvent (calling.service.ts: "joined = set-if-null") + docs/services/calling-service.md mục 1 + test calling.service.spec.ts "identity lạ → không ghi gì" + port LivekitRoomPort.mintJoinToken ("identity do SERVER đặt (= userId)")',
              },
              {
                at: 'if (identity === call.userAId) call.disconnectedAAt = null;',
                text: ['Member quay lại thì xoá dấu rời phòng của chính họ; timer chỉ chạy tiếp khi cả hai dấu đều null.'],
                src: 'call-session.entity.ts disconnectedAAt ("để chỉ resume timer khi cả hai đã quay lại") + CallingService.resumeCallTimer',
              },
            ],
          },
          {
            tag: 'SERVICE',
            file: SV,
            dedent: true,
            ranges: [fn('private resumeCallTimer(')],
            inline: [
              {
                at: 'call.startedAt = new Date(call.startedAt.getTime() + pausedMs);',
                text: ['Dời startedAt đúng bằng khoảng tạm dừng rồi xoá reconnectStartedAt, nên webhook joined gửi lại không cộng khoảng tạm dừng lần hai.'],
                src: 'docs/plans/2026-10-21-scale-recovery-review.md (dòng "Pause is accounted once": locked timer helper calling.service.ts:712 clears grace after accounting)',
              },
            ],
          },
          {
            tag: 'SERVICE',
            file: SV,
            dedent: true,
            ranges: [fn('private async markDisconnected(')],
            inline: [
              {
                at: 'if (!call || call.status !== CallSessionStatus.Active) return;',
                text: ['Chỉ call đang active mới có grace: left của call pending (chưa đủ hai bên) hoặc đã ended bị bỏ qua.'],
                src: 'calling.service.ts markDisconnected (guard status Active) + docs/services/calling-service.md mục 1',
              },
              {
                at: 'call.reconnectStartedAt ??= now;',
                text: ['Mốc grace chỉ đặt một lần: left lặp lại, hoặc left của bên thứ hai, không kéo dài cửa sổ.'],
                src: 'test calling.service.spec.ts "participant_connection_aborted và room_finished đều idempotent trong grace" + docs/plans/2026-10-21-scale-recovery-review.md (calling.service.ts:623)',
              },
            ],
          },
          {
            tag: 'SERVICE',
            file: SV,
            dedent: true,
            ranges: [fn('private async markRoomDisconnected(')],
            inline: [
              {
                at: 'call.disconnectedAAt ??= now;',
                text: ['room_finished coi cả hai bên đã rời: đặt cả hai dấu để timer chỉ chạy tiếp khi cả hai thật sự quay lại, nhưng vẫn chỉ mở grace, không end call ngay.'],
                src: 'test calling.service.spec.ts "participant_connection_aborted và room_finished đều idempotent trong grace" + comment gốc handleWebhookEvent (calling.service.ts, case room_finished)',
              },
            ],
          },
        ],
      },
    ],
  },
];
