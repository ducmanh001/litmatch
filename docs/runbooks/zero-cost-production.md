# Release production chi phí 0 — single-node alpha/beta

Profile này giữ toàn bộ capability self-hosted, gồm phone OTP không dùng SMS (mã trả trực tiếp
qua API để client toast/tự điền), Google/guest login, admin, realtime, LiveKit, in-app
notification, audit, metrics/log và analytics. Ba capability cần vendor production bị tắt
fail-closed: store IAP, external push và video upload/transcode. Không có fake provider nào chạy
dưới `NODE_ENV=production`.

## 1. Những việc chủ hệ thống cần làm một lần

1. Tạo Oracle Cloud Free Tier và VM `VM.Standard.A1.Flex` Ubuntu 24.04 ARM64, **2 OCPU + 12 GB
   RAM**. Chỉ chọn resource có nhãn Always Free; quota/capacity thay đổi theo home region nên
   kiểm tra lại màn hình cost trước khi xác nhận.
2. Gắn public IPv4 và mở ingress ở OCI Security List/NSG:
   - TCP `22`, `80`, `443`, `7881`;
   - UDP `50000-50200`.
     Không mở PostgreSQL `5432`, Redis `6379`, Kafka hay metrics ra Internet.
3. Không cần mua domain: đổi IP `203.0.113.10` thành `203-0-113-10.sslip.io` và dùng giá trị đó
   làm `DOMAIN`. `app.<DOMAIN>`, `admin.<DOMAIN>`, `api.<DOMAIN>`, `realtime.<DOMAIN>` và
   `media.<DOMAIN>` tự resolve về IP nhúng; Caddy xin TLS HTTP-01 cho từng hostname.
4. Trong Google Cloud Console tạo OAuth 2.0 Client loại **Web application**. Thêm hai Authorized
   JavaScript origins `https://app.<DOMAIN>` và `https://admin.<DOMAIN>`. Copy Client ID; không
   tạo/đưa client secret vào repo.
5. Optional: tạo Grafana Cloud Free theo [runbook Grafana](./grafana-cloud.md) và PostHog Cloud
   Free theo [runbook PostHog](./posthog-cloud.md). Để trống env thì hai integration tắt sạch,
   không làm hỏng stack.

`sslip.io` phù hợp bootstrap không tốn tiền. Khi có domain riêng, đổi `DOMAIN`, cập nhật Google
origins và deploy lại; dữ liệu database không đổi.

## 2. Chuẩn bị VM

SSH vào VM, cập nhật OS, cài Git/curl/Node 22/pnpm 11.9.0 và Docker Engine + Compose plugin theo
tài liệu Docker chính thức. Thêm user deploy vào group `docker`, đăng xuất/đăng nhập lại, rồi kiểm
tra:

```bash
node --version
pnpm --version
docker --version
docker compose version
```

Clone đúng repo vào thư mục chỉ user deploy có quyền ghi. Với repo private, dùng GitHub deploy key
read-only; không copy personal access token vào `.env`.

## 3. Tạo cấu hình production

Từ repo trên VM:

```bash
cp deploy/production/.env.example deploy/production/.env
chmod 600 deploy/production/.env
openssl rand -base64 48
```

Sửa `.env`: `DOMAIN`, `PUBLIC_IP`, email ACME, Google Client ID và toàn bộ secret. Password
PostgreSQL chỉ dùng chữ/số/`_`/`-`; script dựng `DATABASE_URL` duy nhất từ các biến này. Không
commit `.env`.

Kiểm tra không thay đổi hệ thống:

```bash
pnpm release:preflight
```

Preflight từ chối placeholder, secret ngắn, cấu hình PostHog/Grafana thiếu một nửa và Compose
không hợp lệ.

## 4. Vòng đời mỗi release

1. Merge chỉ khi check **CI required** trên GitHub xanh.
2. Trên VM: `git fetch --all --prune`, checkout commit/tag đã xanh, xác nhận worktree sạch.
3. Chạy:

   ```bash
   pnpm release:deploy
   ```

Script thực hiện tuần tự: install lockfile → build bốn frontend/backend artifact → build bốn
runtime image → start/wait database/cache/broker → backup PostgreSQL → migration forward → start
app → TLS smoke API/realtime/web/admin → ghi tag hiện tại/trước đó. Một bước fail thì không ghi
release thành công.

4. Kiểm tra `https://app.<DOMAIN>`, `https://admin.<DOMAIN>` và Grafana/PostHog nếu đã bật.
5. Backup nằm tại `deploy/production/backups/*.dump`; copy định kỳ sang máy cá nhân hoặc storage
   khác. Backup cùng VM không bảo vệ khỏi mất VM.

Các lệnh vận hành:

```bash
pnpm release:smoke
pnpm release:backup
docker compose --env-file deploy/production/.env -f deploy/production/compose.yml ps
docker compose --env-file deploy/production/.env -f deploy/production/compose.yml logs --tail=200 core-api
pnpm release:rollback
```

Rollback chỉ đổi bốn application image về tag trước, không revert schema. Nếu migration mới không
backward-compatible, dừng traffic và restore file dump bằng `pg_restore` sau khi xác nhận rõ target;
không chạy restore tự động vì đó là thao tác ghi đè dữ liệu.

## 5. Tạo admin đầu tiên

1. Đăng nhập Google một lần tại web/admin và mở DevTools → Network → response
   `POST /api/v1/auth/social`; copy `data.userId`.
2. Trên VM, thay UUID chính xác rồi chạy:

   ```bash
   docker compose --env-file deploy/production/.env -f deploy/production/compose.yml \
     exec postgres psql -U litmatch -d litmatch \
     -c "UPDATE users SET role='admin' WHERE id='<USER_ID>' RETURNING id, nickname, role;"
   ```

3. Chỉ chấp nhận đúng **một** row trả về. Logout rồi login lại để access token mới mang role
   `admin`. Sau đó đổi role staff qua màn `/permissions`, không tiếp tục sửa SQL thủ công.

Nếu đã đổi `POSTGRES_USER`/`POSTGRES_DB`, thay hai giá trị trong lệnh bằng giá trị `.env`.

## 6. Giới hạn và ngưỡng nâng cấp

- Một VM là một failure domain: không HA, deploy có thể gián đoạn ngắn và LiveKit cạnh tranh CPU
  với Kafka/PostgreSQL. Đây là alpha/beta, không phải topology scale.
- Oracle có thể hết capacity hoặc đổi free quota; luôn kiểm tra trang cost/quota hiện tại trước
  khi tạo/resize. Không bật PAYG nếu mục tiêu là tuyệt đối không phát sinh phí.
- Khi CPU duy trì >70%, RAM >80%, database/storage gần giới hạn hoặc cần HA, chuyển về K8s theo
  `k8s/README.md`; không tự tách thêm backend thứ tư.
- Khi có ngân sách/vendor, bật từng capability bằng adapter production + secret thật + test
  sandbox trước; không đổi `disabled` thành `dev` trong production.
