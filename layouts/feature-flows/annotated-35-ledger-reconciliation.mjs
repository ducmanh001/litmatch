// Đối soát sổ cái (ADR 0015): bất biến Nợ = Có kiểm theo TRANG transaction có giới hạn (keyset created_at, id); tổng cộng dồn và
// cursor commit cùng nhau trong runtime_job_checkpoints nên pod thay thế tiếp tục đúng chỗ. Một lượt quét dở không bao giờ báo sạch.
// Job chỉ ĐỌC bảng tài chính; thứ duy nhất nó ghi là metadata chẩn đoán (checkpoint) dựng lại được.
// `src` = bằng chứng của từng comment; engine bỏ qua, verify-10m.mjs yêu cầu có.
const E = 'apps/core-api/src/modules/economy';
const RS = `${E}/jobs/reconciliation.service.ts`;
const CK = `${E}/jobs/ledger-reconciliation-checkpoint.ts`;
const WS = `${E}/jobs/wallet-reconciliation-sampler.ts`;
const MIG = 'apps/core-api/src/database/migrations';
const MIG_CKPT = `${MIG}/1759100000000-runtime-recovery-checkpoints.ts`;
const MIG_CURSOR = `${MIG}/1759200000000-recovery-cursor-indexes.ts`;
const MIG_ORPHAN = `${MIG}/1758400000000-reconciliation-indexes.ts`;
const END_FN = '^  }$';

const fn = (anchor) => ({ at: anchor, to: END_FN });

export const annotatedFeatures = [
  {
    id: '35-ledger-reconciliation',
    short: 'Ledger reconciliation',
    title: 'Đối soát sổ cái: trang bền vững có checkpoint, quét dở không báo sạch',
    summary:
      'Mỗi transaction ledger cân Nợ = Có theo currency khi ghi, nên tổng Nợ − Có của một tập transaction trọn vẹn phải bằng 0. Tier fast cộng dồn tổng đó theo từng trang transaction (keyset created_at, id; chỉ dữ liệu cũ hơn now() − LAG) và commit tổng cùng cursor trong một dòng runtime_job_checkpoints: mỗi tick có trần số lô và thời gian, pod thay thế tiếp tục đúng chỗ thay vì quét lại từ đầu, và một lượt quét dở không bao giờ báo sạch (complete = false thì ok = false). Tier deep lấy mẫu ví luân phiên theo khoá chính rồi so với số dư dẫn xuất từ ledger. Job chỉ đọc bảng tài chính, chỉ ghi metadata chẩn đoán dựng lại được. Giới hạn: thời gian bắt kịp và rebase phụ thuộc backlog và cấu hình (mặc định tối đa 10 lô × 2000 transaction mỗi tick); mã này thuộc đợt thay đổi chưa chạy kiểm chứng runtime (ADR 0015), nên đây là mô tả cơ chế, không phải chứng nhận công suất.',
    diagramAnchor: '09-diamond-top-up-va-vip',
    arch: 'ledger-integrity',
    endpoints: [
      {
        n: '01',
        slug: 'job-ledger-reconciliation-fast',
        method: 'JOB',
        short: 'fast tick',
        route: 'ReconciliationService.runFast (mỗi ECONOMY_RECONCILIATION_FAST_INTERVAL_MS)',
        name: 'Đối soát nhanh bất biến Nợ = Có theo trang bền vững',
        title:
          'Tiến checkpoint bền theo từng trang transaction (keyset created_at, id) trong ngân sách mỗi tick, đếm receipt đã credit mà thiếu transaction, rồi báo lệch qua log và metric; quét dở không bao giờ báo sạch.',
        flow: '[WORKER] → [POSTGRES]',
        roles: [
          ['WORKER', 'Interval riêng của tier fast (mặc định 60 giây) chạy dưới advisory lock cluster-singleton nên mỗi tick chỉ một pod làm. Mỗi tick tiến checkpoint tối đa MAX_BATCHES_PER_TICK lô (mặc định 10 lô × 2000 transaction) trong ngân sách TICK_BUDGET_MS (mặc định 1000 ms); chưa bắt kịp thì ok = false, lệch thì log error và metric; không tự sửa.'],
          ['POSTGRES', 'Mỗi trang là MỘT transaction: khoá dòng checkpoint (FOR UPDATE), đọc tối đa BATCH_SIZE transaction cũ hơn now() − LAG theo keyset (created_at, id) cùng tổng Nợ − Có theo currency, rồi UPDATE tổng và cursor. COUNT receipt mồ côi chạy riêng trên index một phần. Bảng tài chính chỉ đọc.'],
        ],
        tables: [
          ['transactions', 'đọc theo keyset (created_at, id) qua idx_transactions_reconciliation_cursor, chỉ những transaction cũ hơn now() − LAG; chỉ đọc.'],
          ['ledger_entries', 'các dòng Nợ/Có của từng transaction trong trang (join theo transaction_id), cộng theo currency; sổ cái chỉ thêm, không sửa không xoá.'],
          ['runtime_job_checkpoints', 'một dòng economy-ledger-reconciliation: tổng Nợ − Có theo currency, cursor (created_at, id), mốc hoàn tất và mốc rebase; khoá FOR UPDATE mỗi trang. Dữ liệu chẩn đoán dựng lại được, không phải nguồn chân lý tài chính.'],
          ['iap_receipts', 'COUNT receipt đã credit (status = credited) mà transaction_id còn NULL, trên index một phần idx_iap_receipts_orphan; chỉ đọc.'],
        ],
        related: [
          ['Tier deep', 'runDeep: lấy mẫu ví luân phiên theo keyset wallets.user_id, so snapshot với số dư dẫn xuất từ ledger (trang 02).'],
          ['Lên lịch', 'onApplicationBootstrap đăng ký hai interval độc lập (fast và deep), mỗi interval chạy dưới advisory lock cluster-singleton; scheduledRun nuốt lỗi để interval sống tiếp và đặt gauge của tier về 0 (không chép).'],
          ['Ghi sổ', 'LedgerService ghi append-only và kiểm Nợ = Có từng transaction lúc ghi; job đối soát chỉ đọc nên không bao giờ là nơi sửa lệch (không chép).'],
        ],
        nested: true,
        steps: [
          { at: 'async runFast(): Promise<FastReconciliationReport> {', text: 'Tier rẻ chạy dày: kiểm Nợ = Có theo currency và đếm receipt mồ côi' },
          { at: 'const progress = await this.currentImbalances();', text: 'Tiến checkpoint bền thêm vài trang, rồi lấy các currency còn lệch' },
          { at: 'for (let batch = 0; batch < options.maxBatches; batch++) {', text: 'Lặp theo trang tới khi hết trần lô, hết ngân sách hoặc đã bắt kịp' },
          { at: 'return this.dataSource.transaction(async (manager) => {', text: 'Mở một transaction cho đúng một trang' },
          { at: 'const [checkpoint] = (await manager.query(', text: 'Khoá dòng checkpoint, lấy cutoff = now − LAG từ đồng hồ DB' },
          { at: 'state = initialState();', text: 'Đến kỳ rebase thì đặt lại tổng và cursor' },
          { at: 'const [page] = (await manager.query(', text: 'Đọc trang transaction kế tiếp (keyset) kèm tổng Nợ − Có theo currency' },
          { at: 'const complete = page.count < options.batchSize;', text: 'Xác định đã bắt kịp cutoff hay chưa' },
          { at: 'await manager.query(', nth: 3, text: 'Ghi tổng và cursor mới vào dòng checkpoint' },
          { at: 'const [{ count: orphanReceipts }]: Array<{ count: string }> =', text: 'Đếm receipt đã credit mà chưa có transaction' },
          { at: 'ok:', text: 'Tính ok từ ba điều kiện: đã bắt kịp, không lệch, không receipt mồ côi' },
          { at: 'this.logger.error(', text: 'Lệch thì log error (metric đã ghi ở trên); job không tự sửa' },
        ],
        items: [
          {
            tag: 'WORKER',
            file: RS,
            dedent: true,
            ranges: [fn('async runFast(')],
            inline: [
              {
                at: 'const [{ count: orphanReceipts }]: Array<{ count: string }> =',
                text: ['COUNT chạy trên index một phần chỉ chứa receipt đã credit mà chưa gắn transaction (thường rỗng), nên không quét bảng receipt.'],
                src: 'migration 1758400000000-reconciliation-indexes.ts (comment idx_iap_receipts_orphan: "Câu COUNT orphan receipt của tier fast chỉ cần các receipt đã credit mà chưa gắn transaction — thường là rỗng")',
              },
              {
                at: 'ok:',
                text: ['Quét dở không bao giờ báo sạch: complete = false luôn kéo ok xuống false dù tổng đang cân, vì phần lịch sử chưa quét có thể còn lệch.'],
                src: 'ADR 0015 ("A partial scan never reports a clean audit"); doc ReconciliationService ("Incomplete history never reports a successful audit"); test reconciliation.service.spec.ts "does not report an incomplete balanced history as a successful audit"',
              },
              {
                at: 'if (',
                text: ['Đang bắt kịp mà chưa thấy lệch thì chỉ cảnh báo: chưa phải thành công (gauge last_run_status = 0) và cũng chưa phải lệch. Backlog lớn giữ trạng thái này qua nhiều tick.'],
                src: 'docs/services/economy-service.md (last_run_status "0 = lệch, chưa hoàn tất hoặc run lỗi"; "complete=false nghĩa là chưa bắt kịp lịch sử, không phải một lần đối soát thành công"; "không có bảo đảm tối đa 24 giờ khi backlog lớn"); economy.metrics.ts recordReconciliationRun (ok ? 1 : 0)',
              },
              {
                at: 'this.logger.error(',
                text: ['Chỉ log và metric để alert fire: sửa lệch thật phải đi qua reversal entry của LedgerService, không bao giờ từ job chẩn đoán.'],
                src: 'doc ReconciliationService ("BẤT BIẾN: financial tables are read-only here ... corrections still require reversal entries through LedgerService"); ADR 0015',
              },
            ],
          },
          {
            tag: 'WORKER',
            file: RS,
            dedent: true,
            ranges: [fn('private currentImbalances(')],
            inline: [
              {
                at: 'lagMs:',
                text: ['LAG phải lớn hơn giao dịch ghi sổ lâu nhất: created_at là giờ BẮT ĐẦU transaction, nên giao dịch chạy lâu có thể commit sau khi cursor đã đi qua mốc của nó; nó chỉ bị bắt lại ở lần rebase kế tiếp.'],
                src: 'doc ReconciliationService ("LAG must exceed the longest financial transaction. Late/backdated inserts are caught by a subsequent full paged rebase"); env.validation.ts comment ECONOMY_RECONCILIATION_LAG_MS ("created_at là giờ BẮT ĐẦU transaction DB nên LAG phải lớn hơn transaction ghi sổ lâu nhất")',
              },
            ],
          },
          {
            tag: 'WORKER',
            file: CK,
            dedent: true,
            ranges: [fn('async advance(')],
            inline: [
              {
                at: 'if (batch > 0 && Date.now() >= deadline) break;',
                text: ['Lô đầu luôn chạy nên tick nào cũng tiến được ít nhất một trang. Ngân sách thời gian chỉ được kiểm GIỮA các trang: một trang đang chạy không bị cắt, trần của riêng trang là statement deadline.'],
                src: 'ledger-reconciliation-checkpoint.ts advance (điều kiện batch > 0); docs/services/economy-service.md ("Mỗi tick bị chặn bởi ECONOMY_RECONCILIATION_MAX_BATCHES_PER_TICK và ECONOMY_RECONCILIATION_TICK_BUDGET_MS. Statement deadline vẫn áp dụng riêng mỗi trang")',
              },
            ],
          },
          {
            tag: 'POSTGRES',
            file: CK,
            dedent: true,
            ranges: [fn('private async advancePage(')],
            inline: [
              {
                at: 'return this.dataSource.transaction(async (manager) => {',
                text: ['Tổng cộng dồn và cursor commit CÙNG NHAU hoặc không gì cả: lỗi giữa chừng rollback cả hai, pod thay thế tiếp tục đúng chỗ, không cộng trùng và không bỏ sót trang.'],
                src: 'ADR 0015 ("commits aggregate plus cursor atomically"); economy.integration.spec.ts "a failed page commit preserves the prior cursor and sums for a replacement worker"',
              },
              {
                at: 'const [checkpoint] = (await manager.query(',
                text: ['Tính đúng đắn khi nhiều pod nằm ở khoá dòng này, không ở khoá cluster-singleton: hai pod chạy cùng lúc phải xếp hàng và nhận hai trang KHÁC nhau.'],
                src: 'economy.integration.spec.ts "two workers serialize checkpoint updates and advance two different transaction pages"; managed-interval.ts doc ("Correctness giữa nhiều process vẫn phải do transaction, lock hoặc idempotency của domain giữ")',
              },
              {
                at: 'state = initialState();',
                text: ['Rebase quét LẠI từ đầu nhưng vẫn theo trang và bị chặn như mọi tick. Mục đích là bắt transaction commit muộn, backdate hoặc entry chèn ngoài write path chuẩn mà lượt tăng dần đã đi qua; thời gian hoàn tất phụ thuộc backlog, không có cam kết 24 giờ.'],
                src: 'docs/services/economy-service.md ("Sau ECONOMY_RECONCILIATION_FULL_INTERVAL_MS, job bắt đầu một lượt rebase phân trang để phát hiện transaction commit muộn, backdate hoặc entry chèn ngoài write path chuẩn ... không có bảo đảm tối đa 24 giờ khi backlog lớn"); ADR 0015',
              },
              {
                at: 'const [page] = (await manager.query(',
                text: ['Keyset (created_at, id) trên idx_transactions_reconciliation_cursor: đọc tiếp ngay sau cursor, không sort cả lịch sử. Trang chứa trọn từng transaction (join ledger_entries theo id của lô) nên tổng luôn cân nếu dữ liệu đúng. Cursor lấy dạng text để giữ đủ micro giây.'],
                src: 'migration 1759200000000-recovery-cursor-indexes.ts ("Bounded keyset scans need ordered indexes, rather than a full historical sort"); docs/services/economy-service.md ("Aggregate luôn chứa trọn transaction"; "cursor microsecond")',
              },
              {
                at: 'for (const [currency, delta] of Object.entries(page.sums)) {',
                text: ['amount là bigint (driver trả string) nên cộng bằng BigInt, không dùng number.'],
                src: 'ledger-entry.entity.ts ("amount là bigint dương — TypeORM trả về string cho bigint, xử lý bằng BigInt() khi tính toán")',
              },
              {
                at: 'const complete = page.count < options.batchSize;',
                text: ['Trang ngắn hơn BATCH_SIZE nghĩa là đã hết transaction cũ hơn cutoff. Chỉ khi đó mới đặt completedBefore (và rebasedAt nếu vừa xong một lượt rebase); trang đầy thì chưa biết còn bao nhiêu nên không báo hoàn tất.'],
                src: 'ledger-reconciliation-checkpoint.ts advancePage; test reconciliation.service.spec.ts "exposes completion watermark only after the checkpoint catches up"; docs/services/economy-service.md ("complete=false nghĩa là chưa bắt kịp lịch sử")',
              },
              {
                at: 'await manager.query(',
                text: ['Chỉ metadata chẩn đoán dựng lại được mới được ghi, trong cùng transaction đang giữ khoá; transactions, ledger_entries, wallets và iap_receipts không bao giờ bị chạm.'],
                src: 'ADR 0015 ("writing coordination metadata is explicitly permitted"; "Checkpoints are rebuildable"); ledger-reconciliation-checkpoint.ts ("This row contains diagnostic progress only, never financial source-of-truth data")',
              },
              {
                at: 'imbalances: Object.entries(state.sums)',
                text: ['Báo lệch ngay từ tổng đang có, kể cả khi mới quét dở: mỗi transaction đã cân Nợ = Có lúc ghi và trang chứa trọn transaction, nên tổng riêng phần khác 0 là lệch thật chứ không do cắt ngang.'],
                src: 'ledger.service.ts validateEntries ("Tổng Nợ != tổng Có cho currency ... vi phạm bất biến double-entry"); economy.integration.spec.ts "a replacement worker resumes a partial audit and detects a skew without changing financial history"',
              },
            ],
          },
          {
            tag: 'POSTGRES',
            file: MIG_CKPT,
            dedent: true,
            title: 'runtime_job_checkpoints (bảng checkpoint)',
            ranges: [{ at: 'await queryRunner.query(`CREATE TABLE runtime_job_checkpoints (', to: '^    \\)`\\);$' }],
            inline: [
              {
                at: 'await queryRunner.query(`CREATE TABLE runtime_job_checkpoints (',
                text: ['Một dòng cho mỗi job: job_key là khoá chính, vừa là đích ON CONFLICT vừa là dòng bị khoá FOR UPDATE; state (jsonb) giữ tiến độ của job, ở đối soát sổ cái là tổng và cursor, ở mẫu ví là afterUserId. Chỉ là trạng thái điều phối thêm vào, không viết lại lịch sử tài chính và dựng lại được.'],
                src: 'migration 1759100000000-runtime-recovery-checkpoints.ts ("Additive coordination state only; no financial history is rewritten"); ADR 0015 ("Checkpoints are rebuildable"); ledger-reconciliation-checkpoint.ts CHECKPOINT_KEY và wallet-reconciliation-sampler.ts CHECKPOINT_KEY (hai dòng, state khác nhau)',
              },
            ],
          },
          {
            tag: 'POSTGRES',
            file: MIG_CURSOR,
            dedent: true,
            title: 'idx_transactions_reconciliation_cursor (index keyset)',
            ranges: [{ at: "name: 'idx_transactions_reconciliation_cursor',", to: '^  },$', pad: [1, 0] }],
            inline: [
              {
                at: "name: 'idx_transactions_reconciliation_cursor',",
                text: ['B-tree (created_at, id) đúng thứ tự keyset nên ORDER BY created_at, id LIMIT n đọc n khoá đầu sau cursor thay vì sort cả lịch sử. Migration tạo CONCURRENTLY, ngoài transaction.'],
                src: 'migration 1759200000000-recovery-cursor-indexes.ts ("Bounded keyset scans need ordered indexes, rather than a full historical sort"; transaction = false; CREATE INDEX CONCURRENTLY IF NOT EXISTS)',
              },
            ],
          },
          {
            tag: 'POSTGRES',
            file: MIG_ORPHAN,
            dedent: true,
            title: 'idx_iap_receipts_orphan (index một phần)',
            ranges: [{ at: "name: 'idx_iap_receipts_orphan',", to: '^  },$', pad: [1, 0] }],
            inline: [
              {
                at: "name: 'idx_iap_receipts_orphan',",
                text: ['Index một phần chỉ chứa receipt đã credit mà chưa gắn transaction (thường rỗng): câu COUNT orphan của tier fast gần như không tốn gì.'],
                src: 'migration 1758400000000-reconciliation-indexes.ts (comment idx_iap_receipts_orphan)',
              },
            ],
          },
        ],
      },
      {
        n: '02',
        slug: 'job-wallet-reconciliation-deep',
        method: 'JOB',
        short: 'deep sample',
        route: 'ReconciliationService.runDeep (mỗi ECONOMY_RECONCILIATION_INTERVAL_MS)',
        name: 'Đối soát sâu: mẫu ví luân phiên so với số dư dẫn xuất từ ledger',
        title:
          'Lấy một mẫu ví kế tiếp theo cursor user_id bền, so snapshot với số dư dẫn xuất từ ledger trong cùng một statement, rồi lưu cursor cùng transaction; ok chỉ phản ánh mẫu vừa kiểm.',
        flow: '[WORKER] → [POSTGRES]',
        roles: [
          ['WORKER', 'Interval riêng, thưa hơn tier fast (mặc định 300 giây), chạy dưới advisory lock cluster-singleton. Mỗi lần kiểm một mẫu ví (mặc định 100), đặt ok theo mẫu vừa kiểm, báo lệch bằng log error và metric wallet_sample; không tự sửa.'],
          ['POSTGRES', 'Một transaction: khoá dòng checkpoint, MỘT statement đọc tail (sau cursor) và head (vòng lại từ đầu) theo wallets.user_id rồi so snapshot với số dư dẫn xuất từ ledger_entries (cùng MVCC snapshot), sau đó UPDATE cursor; lỗi thì rollback cả cursor.'],
        ],
        tables: [
          ['wallets', 'keyset theo user_id (khoá chính): snapshot số dư diamond của mẫu ví; chỉ đọc.'],
          ['ledger_accounts', 'tìm tài khoản user_wallet của từng ví trong mẫu; chỉ đọc.'],
          ['ledger_entries', 'cộng Có − Nợ của tài khoản đó để dẫn xuất số dư; chỉ đọc.'],
          ['runtime_job_checkpoints', 'một dòng economy-wallet-reconciliation chứa cursor afterUserId (dữ liệu chẩn đoán, dựng lại được); khoá FOR UPDATE trong transaction của mẫu.'],
        ],
        related: [
          ['Tier fast', 'runFast: kiểm Nợ = Có theo trang bền vững, cùng bảng runtime_job_checkpoints (trang 01).'],
          ['Ghi ví', 'LedgerService là writer duy nhất của ví và ledger; sampler chỉ đọc, ví lệch được báo chứ không tự sửa (không chép).'],
        ],
        nested: true,
        steps: [
          { at: 'async runDeep(', text: 'Tier đắt, cadence thưa: đối chiếu mẫu ví với số dư dẫn xuất từ ledger' },
          { at: 'const walletMismatches = await new WalletReconciliationSampler(', text: 'Lấy mẫu ví kế tiếp theo cursor bền' },
          { at: 'if (!Number.isSafeInteger(size)', text: 'Chặn cỡ mẫu ngoài [1, 10.000]' },
          { at: 'return this.dataSource.transaction(async (manager) => {', text: 'Mở một transaction cho khoá, đọc mẫu và lưu cursor' },
          { at: 'const [checkpoint] = (await manager.query(', text: 'Khoá dòng checkpoint và đọc cursor afterUserId' },
          { at: 'const [page] = (await manager.query(', text: 'Một statement: đọc tail + head, dẫn xuất số dư từ ledger, liệt kê ví lệch' },
          { at: 'if (', nth: 2, text: 'Kiểm metadata cursor mà statement trả về' },
          { at: 'await manager.query(', nth: 3, text: 'Lưu cursor mới (ví lớn nhất vừa kiểm)' },
          { at: 'ok: walletMismatches.length === 0,', text: 'Đặt ok theo mẫu vừa kiểm' },
          { at: 'if (!report.ok) {', text: 'Lệch thì log error (metric đã ghi ở trên); job không tự sửa' },
        ],
        items: [
          {
            tag: 'WORKER',
            file: RS,
            dedent: true,
            ranges: [fn('async runDeep(')],
            inline: [
              {
                at: 'ok: walletMismatches.length === 0,',
                text: ['ok chỉ phản ánh MẪU vừa kiểm (mặc định 100 ví), không chứng minh toàn bộ ví đã sạch. Thời gian bao phủ một vòng phụ thuộc số ví, cadence và số lần chạy thành công.'],
                src: 'docs/services/economy-service.md ("`ok` chỉ phản ánh mẫu vừa kiểm tra, không chứng minh toàn bộ ví đã sạch; thời gian bao phủ một vòng phụ thuộc số ví, cadence và số job chạy thành công"); reconciliation.service.ts WALLET_SAMPLE_SIZE = 100',
              },
            ],
          },
          {
            tag: 'POSTGRES',
            file: WS,
            dedent: true,
            ranges: [fn('async sample(')],
            inline: [
              {
                at: 'Number.isSafeInteger(size)',
                text: ['Mẫu chạy tay cũng phải là số nguyên trong [1, 10.000]: mỗi ví là một phép cộng trên ledger_entries của ví đó, nên tăng cỡ mẫu vẫn phải đo chi phí lịch sử ledger mỗi ví.'],
                src: 'docs/services/economy-service.md ("Mẫu chạy tay phải là số nguyên 1–10.000; tăng cỡ mẫu vẫn cần đo chi phí lịch sử ledger mỗi ví"); wallet-reconciliation-sampler.ts MAX_SAMPLE_SIZE',
              },
              {
                at: 'return this.dataSource.transaction(async (manager) => {',
                text: ['Khoá, đọc mẫu và lưu cursor nằm trong CÙNG một transaction: lỗi đọc hay lỗi commit rollback cả cursor, nên pod thay thế kiểm lại đúng mẫu đó thay vì bỏ qua ví nào.'],
                src: 'docs/services/economy-service.md ("Khoá checkpoint, đọc mẫu và lưu cursor cùng transaction; lỗi đọc/commit không bỏ qua mẫu"); economy.integration.spec.ts "a failed cursor commit rolls back the page and a replacement samples it again"',
              },
              {
                at: 'const [checkpoint] = (await manager.query(',
                text: ['FOR UPDATE: hai sampler chạy cùng lúc phải xếp hàng nên mỗi bên nhận một trang khác nhau.'],
                src: 'economy.integration.spec.ts "two samplers serialize ownership and cover two distinct pages"',
              },
              {
                at: 'const [page] = (await manager.query(',
                text: ['Keyset theo khoá chính wallets.user_id: không sort cả bảng theo updated_at và không cần index trên cột đổi mỗi lần ghi số dư. Tail (sau cursor) và head (vòng lại từ đầu) là hai dải khoá không giao nhau, đọc trong CÙNG statement: hết tail thì head bù cho đủ cỡ mẫu nên DB nhỏ vẫn được kiểm hết mỗi lần chạy tay. Snapshot ví và ledger của từng ví dùng chung MVCC snapshot của statement.'],
                src: 'docs/services/economy-service.md ("Không sort toàn bộ ví theo updated_at và không thêm index vào cột cập nhật mỗi lần ghi số dư. Tail sau cursor và head khi hết tail được đọc trong cùng một statement"); comment gốc wallet-reconciliation-sampler.ts ("Tail and head are disjoint PK ranges ... share the statement\'s MVCC snapshot")',
              },
              {
                at: 'if (',
                text: ['Metadata cursor thiếu hoặc lạ thì ném lỗi (rollback): không lưu cursor và không bao giờ coi đó là một mẫu sạch.'],
                src: 'reconciliation.service.spec.ts "rejects missing sampling metadata without committing a cursor or reporting a clean sample"',
              },
              {
                at: 'await manager.query(',
                text: ['Cursor chỉ tiến SAU khi cả mẫu đã đọc xong, và là thứ duy nhất được ghi: ví, ledger và receipt không bị chạm.'],
                src: 'wallet-reconciliation-sampler.ts ("Financial rows are read-only; only the disposable sampling cursor is persisted"); docs/services/economy-service.md ("Các bảng tài chính vẫn chỉ đọc")',
              },
            ],
          },
        ],
      },
    ],
  },
];
