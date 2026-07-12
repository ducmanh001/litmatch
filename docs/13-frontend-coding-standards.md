[← 12 · Frontend Architecture](./12-frontend-architecture.md) · **13 · Frontend Coding Standards**

# 13. Frontend Coding Standards — tuân theo xuyên suốt, mọi feature, mọi phase

Áp dụng cho `apps/admin`, `apps/web`, `libs/api-client`. Kiến trúc/boundary/thứ tự triển khai
nằm ở [12-frontend-architecture.md](./12-frontend-architecture.md); file này quy định cách
viết code cụ thể. Nguyên tắc gốc (ownership, abstraction, comment) vẫn là
[11-engineering-principles.md](./11-engineering-principles.md) — FE không có bộ triết lý riêng.

## 13.1 Nguyên tắc chung

- **Kim chỉ nam: ưu tiên tính scale trong mọi quyết định** — hệ thống này xây cho quy mô lớn
  thật ([docs/00](./00-overview-and-index.md)), FE không ngoại lệ: cấu trúc phải chịu được
  N feature và N agent làm song song. Hệ quả bắt buộc: mọi quy tắc đặt vị trí/tách file trong
  bộ chuẩn này là **deterministic theo ngữ nghĩa** — 2 người (hoặc 2 agent) quyết định độc lập
  phải ra cùng 1 kết quả. Không tồn tại ngưỡng "linh động" kiểu đợi-lặp-đủ-N-lần hay
  đợi-file-đủ-dài: tiêu chí theo số đếm phụ thuộc thời điểm nhìn vào code, nên 2 thời điểm
  khác nhau cho 2 câu trả lời khác nhau — đó không phải là chuẩn.
- **Server là nguồn sự thật, UI là hàm của state**. FE không tự tính toán lại giá trị nghiệp vụ
  (giá gift, số dư, trạng thái matching) — hiển thị đúng cái server trả, kể cả khi "tự tính
  cũng ra". Hai công thức ở 2 nơi là bug chờ ngày lệch.
- **Single source of truth** như § 5.1 backend, phiên bản FE:
  1. Giá trị từ API → dùng type/hằng từ `libs/api-client` generated hoặc `common-dtos`,
     không khai lại tay.
  2. Giá trị khác nhau theo môi trường (base URL, socket URL, LiveKit URL) → env qua module
     `env.ts` của app (§ 13.10), không đọc `import.meta.env`/`process.env` rải rác.
  3. Hằng UI thuần → constant đặt tên, **vị trí theo ngữ nghĩa của concern, KHÔNG theo số nơi
     đang dùng** (đúng luật § 5.1 mục 3 backend — không đợi có nơi dùng thứ 2 mới tách): hằng
     thuộc concern của đúng 1 feature (ngưỡng filter riêng của queue report) → file chủ quản
     trong feature đó; hằng là chuẩn cấp app (page size mặc định mọi list, debounce chuẩn
     input, thời lượng toast) → `shared/` NGAY TỪ ĐẦU, kể cả khi mới 1 chỗ dùng.
- **Không business logic trong FE** (luật ở 12.1). FE được phép: validate format input trước
  khi gửi, ẩn/hiện theo role, tính toán thuần hiển thị (format tiền, thời gian tương đối).
  FE không được phép: quyết định "đủ tiền hay không", tự cộng trừ số dư sau mutation thay vì
  refetch, tự suy ra trạng thái phòng thay vì nghe server.
- **Không tạo abstraction để dành**: không wrapper quanh TanStack Query "cho gọn", không
  design system riêng. Tiêu chí tách component/hook dùng chung là **ngữ nghĩa, không phải số
  chỗ lặp**: tách khi nó là MỘT khái niệm UI/nghiệp vụ có tên, có chủ quản và hợp đồng props
  rõ (`user-avatar`, `diamond-amount`, `use-countdown`) — khái niệm thật thì tách ngay từ chỗ
  dùng đầu tiên; "code trông giống nhau" không phải khái niệm, giống mấy lần cũng không tách.

Nhiều luật trong file này được **guard enforce bằng máy** (`scripts/agent/guard-core.mjs`):
env ngoài `shared/env.ts`, fetch/axios tay, import entry chính `common-dtos`, import
`apps/core-api` — vi phạm bị chặn ngay lúc ghi file, không đợi review.

## 13.2 TypeScript & lint

- `strict: true` cho mọi project FE. Cấm `any` — dùng `unknown` + narrow; cấm non-null
  assertion `!` trừ khi kèm comment vì sao chắc chắn non-null tại đó.
- Type của dữ liệu API **chỉ** đến từ `libs/api-client/src/generated/` — không tự khai
  `interface User` song song (2 định nghĩa = hợp đồng lệch âm thầm, đúng bệnh § 5.3 đã cấm
  ở backend).
- `import type` cho import chỉ dùng ở type-position — đặc biệt với `common-dtos` để chắc chắn
  không kéo runtime vào bundle.
- **Boundary enforce bằng lint, không bằng lòng tin**: gắn Nx tag trong `project.json`
  (`scope:frontend` cho admin/web, `scope:shared` cho api-client/common-dtos, `scope:backend`
  cho 3 app backend) + rule `@nx/enforce-module-boundaries` ở eslint root: `scope:frontend`
  chỉ được depend `scope:shared`. Vi phạm quy tắc 12.9-2 phải là lỗi lint, không đợi reviewer
  soi.

## 13.3 Cấu trúc feature & naming

- File: **kebab-case toàn bộ**, kể cả component (`user-table.tsx`, `use-report-queue.ts`) —
  cùng 1 quy ước với backend (§ 5.6), không trộn PascalCase file. Component/type PascalCase,
  hook `useXxx`, hằng UPPER_SNAKE.
- Component **named export**, không default export (trừ file Next bắt buộc default:
  `page.tsx`, `layout.tsx`, `error.tsx`) — rename-safe, autocomplete đúng tên.
- Trong 1 feature (`features/<tên>/`), xếp theo vai trò — chọn dòng ĐẦU TIÊN khớp:

| Thành phần là gì?                                                                                          | Vị trí                                                                                                               |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Gọi API: query/mutation hooks + query-key factory của feature                                              | `api.ts`; feature có nhiều resource → `api/<resource>.ts` mỗi resource 1 file, chia theo ngữ nghĩa không theo độ dài |
| Màn hình gắn route                                                                                         | `pages/` (admin) · `app/` route file gọi vào (web)                                                                   |
| Component chỉ feature này dùng                                                                             | `components/`                                                                                                        |
| Hook logic chỉ feature này dùng                                                                            | `hooks/`                                                                                                             |
| Schema Zod của form trong feature                                                                          | cạnh form dùng nó                                                                                                    |
| Thuộc concern cấp app, không của riêng feature nào (auth, env, theme, layout khung, realtime/media wiring) | `shared/` của app — theo ngữ nghĩa, kể cả khi mới 1 feature dùng                                                     |

- Feature không import feature khác (12.9). Khái niệm cấp app → `shared/` của app. Hợp đồng
  dùng chung giữa 2 app chỉ tồn tại trong libs đã khai (`api-client`, `common-dtos`); cần lib
  chung mới là **quyết định kiến trúc** — cập nhật doc 12 trước rồi mới code, không tự tạo
  trong PR feature (12.9-6).

## 13.4 Server state — TanStack Query là chuẩn duy nhất

- **Query key có factory tập trung per feature** trong `api.ts`, dạng
  `['<domain>', '<resource>', params]` (vd `reportKeys.list(filters)`,
  `reportKeys.detail(id)`) — invalidate qua factory, cấm gõ key literal tại chỗ dùng
  (đúng bệnh "chuỗi định danh phải là hằng" § 5.1 mục 4).
- Default (`staleTime`, `retry`, `refetchOnWindowFocus`) khai **1 lần** ở `QueryClient` trong
  `providers.tsx`; per-query chỉ override khi có lý do ghi tại chỗ.
- Sau mutation: `invalidateQueries` theo key factory, để server trả trạng thái mới. **Không
  `setQueryData` tự dựng kết quả nghiệp vụ** (tự cộng số dư, tự đổi trạng thái ticket) — đó là
  business logic trong FE. Optimistic update chỉ cho tương tác thuần UI (like, đánh dấu đã
  đọc) và task phải nói rõ.
- **Cấm copy data từ query vào `useState`/store rồi render từ bản copy** — 2 nguồn sự thật,
  refetch xong UI vẫn cũ. Cần derive thì derive lúc render hoặc `select` của query.
- Endpoint có `Idempotency-Key` (economy, gift...): FE sinh UUID **một lần cho mỗi intent của
  user** (lúc mở form/bấm lần đầu), giữ nguyên key đó khi retry vì lỗi mạng — sinh key mới mỗi
  lần gọi là vô hiệu hoá idempotency của backend.

## 13.5 Client state

Thứ tự bắt buộc, chỉ leo bậc khi bậc dưới thật sự không đủ:
`useState` tại component → lift lên cha gần nhất → context nhỏ theo concern (theme, auth) →
Zustand store (chỉ state client thuần: UI panel đang mở, draft chưa gửi, trạng thái socket).
Cấm Redux. Cấm để server state vào store (§ 13.4). Store Zustand đặt ở `shared/` hoặc trong
feature sở hữu nó, mỗi store 1 concern — không store "app state" tổng.

## 13.6 Form

- React Hook Form + Zod resolver cho **mọi** form. Schema Zod đặt cạnh form, là nơi duy nhất
  khai rule format phía client — nhưng validate thật vẫn ở backend, client chỉ đỡ UX.
- Lỗi từ backend hiển thị **nguyên message của envelope**, không dịch lại/không nuốt; lỗi
  validate field-level (nếu backend trả) map vào đúng field qua `setError`.
- Nút submit disable trong lúc mutation pending — chống double-submit ở UI; chống thật vẫn là
  idempotency key (§ 13.4).

## 13.7 Error handling & UX states

- `libs/api-client` parse envelope lỗi thống nhất của backend
  (`{ error: { code, message, traceId } }` — § 5.4) và throw đúng **một** class `ApiError`
  chứa `code`, `message`, `traceId`, `status`. Mọi nơi bắt lỗi API đều switch theo `code`
  (UPPER_SNAKE của § 5.5), không parse message string.
- 401: api-client tự refresh rotation **một lần** rồi retry; refresh fail → logout + về login.
  Logic này ở 1 chỗ trong api-client, không rải ra từng hook.
- Mỗi màn hình gắn dữ liệu phải có đủ 4 trạng thái: loading / empty / error / data — error
  state hiển thị message + `traceId` (admin bắt buộc hiện traceId để ops tra log; web hiện
  message thân thiện, traceId trong chi tiết).
- Error boundary theo route (route `errorElement` ở admin, `error.tsx` ở web) — 1 màn vỡ
  không kéo sập cả app. Toast chỉ dùng cho kết quả hành động (mutation thành công/thất bại),
  không dùng toast thay error state của màn hình.

## 13.8 Realtime & media (apps/web)

- **Một** socket instance per app, quản lý trong `shared/realtime/` — component không tự
  `io(...)`. Event name/payload type lấy từ `realtime-events.ts` của `common-dtos`; string
  event tự chế là vi phạm boundary (12.9-3).
- Đăng ký listener trong hook, **luôn cleanup** khi unmount — listener rò là bug mặc định
  của FE realtime.
- Reconnect: sau khi socket nối lại, **refetch state nền qua REST** (invalidate query liên
  quan) rồi mới nghe tiếp delta — socket là kênh delta, không phải nguồn sự thật; đoán state
  từ event bị miss là tự chế business logic.
- LiveKit: mint token qua endpoint core-api như mobile; wrapper trong `shared/media/` sở hữu
  connect/disconnect lifecycle, component chỉ consume.

## 13.9 Styling & UI

- **Tailwind là chuẩn duy nhất** — không CSS module, không CSS-in-JS trộn thêm. Inline
  `style=` chỉ cho giá trị runtime thật (toạ độ, % progress).
- Design token (màu, radius, spacing đặc thù) khai bằng CSS variables tại 1 file theme per
  app — không rải mã hex trong className khi giá trị đó có ngữ nghĩa dùng lại.
- Admin: shadcn/ui generate vào `shared/ui/` — file generate được sửa tại chỗ (đó là mô hình
  của shadcn), nhưng sửa gì thì ghi comment tại dòng sửa. Icon: `lucide-react` (đi cùng
  shadcn) — 1 bộ icon, không trộn.
- A11y baseline không thương lượng: đúng element ngữ nghĩa (`button` cho hành động, không
  `div onClick`), mọi input có label, focus-visible không bị tắt, ảnh có `alt`.

## 13.10 Env & config

- Mỗi app có đúng **một** module `src/shared/env.ts`: parse `import.meta.env` /
  `process.env.NEXT_PUBLIC_*` qua Zod schema lúc boot, export object env đã validate. Thiếu/sai
  env → app chết ngay lúc khởi động với message rõ, không chạy tiếp với `undefined` — tương
  đương `getOrThrow` + Joi của backend (§ 5.2).
- Code ngoài `env.ts` cấm đụng `import.meta.env`/`process.env` trực tiếp.
- Khai env mới: thêm schema + `.env.example` của app trong cùng PR (quy ước "không key mồ côi"
  § 5.2). Prefix `VITE_` / `NEXT_PUBLIC_` nghĩa là **công khai trong bundle** — secret không
  bao giờ được mang prefix này; FE không có secret hợp lệ nào ngoài token phiên của user.

## 13.11 Security FE

- Cấm `dangerouslySetInnerHTML`; ngoại lệ duy nhất là nội dung đã sanitize và lý do ghi ngay
  tại chỗ dùng.
- Cấm log token/OTP/PII ra console kể cả khi debug; cấm gửi chúng vào bất kỳ analytics nào.
- `localStorage` chỉ chứa refresh token theo quyết định 12.6 — không nhét thêm PII/cache
  dữ liệu người khác vào storage bền.
- Ẩn/hiện theo role là UX; mọi enforcement thật ở backend guard (12.9-9). Không bao giờ coi
  "UI không có nút đó" là chốt chặn.

## 13.12 Testing

- **Vitest + @testing-library/react cho cả 2 app** — FE thống nhất 1 runner (backend giữ
  Jest); 2 runner trong cùng tầng FE là 2 chuẩn song song không có lý do.
- Test cái gì (theo thứ tự giá trị): logic hook (guard route theo role, key sinh idempotency,
  reconnect refetch) → schema Zod của form (case biên) → component có branch logic (4 trạng
  thái § 13.7) → wrapper api-client (refresh 1 lần rồi logout). KHÔNG snapshot test cả trang
  — vỡ theo mọi thay đổi markup, không bắt được bug thật.
- `*.spec.tsx?` đặt cạnh file nó test, như quy ước backend (§ 5.3).
- E2E (Playwright) dựng khi có flow login + 1 flow nghiệp vụ thật để test — không scaffold
  trước (nguyên tắc không để dành).

## 13.13 Performance

- Code-split theo route là mặc định (`lazy()` trong router admin; Next tự chia theo route).
  Không split sâu hơn khi chưa đo.
- Cấm `useMemo`/`useCallback`/`React.memo` rải "cho chắc" — chỉ thêm khi có số đo hoặc dep
  của effect yêu cầu; memo hoá sai còn tệ hơn không memo.
- Ảnh ở web đi qua `next/image`. Danh sách dài dần vô hạn dùng cursor pagination +
  `useInfiniteQuery` khớp chuẩn API § 5.4 — không tự chế offset.
- Mỗi PR scaffold/thêm dependency: kiểm bundle không chứa `class-validator`/`@nestjs/*`
  (bằng chứng theo 12.11). Thêm dependency FE mới phải nêu lý do trong PR — mặc định là không
  thêm khi stack đã chốt (§ 12.4, § 12.5) cover được.

## 13.14 Git/PR & definition of done mỗi phase

- Conventional Commits, scope là app/lib: `feat(admin): ...`, `feat(web): ...`,
  `feat(api-client): ...`.
- PR theo feature dọc (route + api + component + test của 1 việc), không PR "toàn bộ phase"
  một cục.
- DoD mỗi PR: `pnpm format:check`, `pnpm lint`, `nx build <app>`, `nx test <app>` pass;
  `.env.example` đủ key mới; không sửa tay file trong `generated/`; app serve được và flow
  vừa làm bấm được bằng tay với backend local.
- Phát hiện chuẩn trong file này sai/thiếu khi làm thật → sửa file này trong cùng PR, như
  luật docs sống của repo.

---

[← 12 · Frontend Architecture](./12-frontend-architecture.md) · [00 · Mục lục →](./00-overview-and-index.md)
