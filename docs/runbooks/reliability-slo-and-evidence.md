# Reliability SLO, error budget và bằng chứng production

Tài liệu này là production gate. Script/load-test config, dashboard hoặc alert rule chỉ là
scaffold; chúng không phải bằng chứng đã chạy. Mỗi lần promote production phải chạy
`pnpm reliability:production-gate` với `RELIABILITY_EVIDENCE_DIR` trỏ tới artifact bất biến của
đúng build.

## SLO theo rolling 30 ngày

Mọi SLI loại trừ request synthetic được gắn nhãn rõ và lỗi 4xx do input/quyền không hợp lệ; timeout,
5xx, dependency failure và kết quả nghiệp vụ không hoàn tất đều tính lỗi.

| Journey    | Good event                                                        |    SLO | Error budget / 30 ngày                            | Latency objective                        |
| ---------- | ----------------------------------------------------------------- | -----: | ------------------------------------------------- | ---------------------------------------- |
| Login      | OTP/social/guest login hợp lệ trả token                           | 99.90% | 0.10% eligible event (43m50s downtime-equivalent) | p95 < 800 ms                             |
| Matching   | ticket hợp lệ đạt `matched` trong 30 giây                         | 99.50% | 0.50% eligible event (3h39m downtime-equivalent)  | p95 < 15 giây                            |
| Messaging  | send hợp lệ được persist và đọc lại                               | 99.90% | 0.10% eligible event (43m50s downtime-equivalent) | p95 < 500 ms                             |
| Call setup | hai member join hợp lệ và call đạt `active`                       | 99.50% | 0.50% eligible event (3h39m downtime-equivalent)  | p95 < 10 giây                            |
| Party room | create/join hợp lệ, token dùng được và participant hiện diện      | 99.50% | 0.50% eligible event (3h39m downtime-equivalent)  | p95 < 10 giây                            |
| Payment    | store-confirmed purchase tạo đúng một ledger transaction cân bằng | 99.95% | 0.05% eligible event (21m55s downtime-equivalent) | p95 < 3 giây, không tính thời gian store |

Nguồn đo: `http_request_duration_seconds` cho API boundary;
`matching_ticket_wait_seconds`, `economy_transaction_total`, reconciliation metrics cho outcome
durable; synthetic journey cho messaging read-after-write, call setup và party presence. Synthetic
phải chạy ít nhất mỗi 5 phút từ ngoài cluster và dùng account riêng không được loại khỏi SLI.

Backend on-call là owner SLO login/matching/messaging/payment; Realtime on-call là owner signaling,
call setup và party room; Platform on-call sở hữu pipeline Sentry/OTel/Grafana và alert delivery.
Mỗi artifact vẫn phải ghi tên DRI cá nhân đang chịu trách nhiệm cho lần release — tên team không đủ.

## Burn-rate alert và chính sách error budget

- Page khi burn rate 14.4x trong cả cửa sổ 5 phút và 1 giờ.
- Ticket khẩn khi burn rate 6x trong cả cửa sổ 30 phút và 6 giờ.
- Cảnh báo quota phải có: Redis quota failure, rejected connection theo reason, quota key drift và
  reconnect failure sau pod termination.
- Payment page ngay khi reconciliation mismatch tăng hoặc có transaction failed không phải lỗi
  input/store-decline dự kiến.
- Đã tiêu 50% budget trước nửa kỳ: dừng rollout tăng tải/capacity.
- Đã tiêu 100%: freeze feature release của journey đó; chỉ reliability/security fix được promote
  tới khi SLO về trong budget hoặc incident commander chấp nhận ngoại lệ có thời hạn.

## Staging load + multi-pod reconnect

1. Deploy đúng git SHA với ít nhất 2 signaling replicas và Redis giống topology production.
2. Chạy Socket.IO load thật (Artillery/client Socket.IO native được ưu tiên) qua load balancer,
   không gọi thẳng pod. Profile tối thiểu: steady 15 phút, peak dự kiến x 1.5 trong 10 phút.
3. Trong steady phase, terminate một pod đang giữ connection; client phải reconnect sang pod khác.
4. Cùng một JWT mở connection đồng thời qua nhiều pod; tổng accepted không vượt
   `WS_MAX_CONNECTIONS_PER_USER`.
5. Lưu raw result, dashboard snapshot, pod events, image digest/git SHA và quota counters vào
   artifact bất biến. Không copy số liệu thủ công vào PR.

`loadtest.json` phải có `environment`, `status=pass`, `gitSha`, `executedAt`, `runUrl`, `owner` và
`checks=["signaling-quota","multi-pod-reconnect","staging-load"]`; artifact cũ hơn 30 ngày không
mở production gate.

## Fault injection / game day

Mỗi quý và sau thay đổi alert quan trọng:

1. Redis latency/loss: inject có scope vào staging; quota phải fail closed, readiness/alert fire.
2. Signaling pod kill: connection reconnect qua replica khác trong SLO; quota không leak sau TTL.
3. Core API 5xx/latency: login/messaging/call-setup burn alert phải fire đúng severity.
4. LiveKit unreachable: call/party synthetic fail và alert tới Realtime on-call.
5. Payment verifier timeout + reconciliation mismatch test fixture: không double-credit; page tới
   Backend on-call.
6. Xác nhận delivery bằng incident/alert ID, thời gian detect, acknowledge, recover; rule chỉ được
   đánh dấu verified khi notification tới đúng người.

`game-day.json` dùng cùng field bắt buộc, liệt kê đủ check mà gate yêu cầu và hết hạn sau 90 ngày.
Rollback toàn bộ fault trước khi kết thúc; production fault injection cần incident commander phê
duyệt riêng.

## Telemetry production gate

Kubernetes đặt `OBSERVABILITY_REQUIRED=true`. Core API và signaling sẽ fail boot nếu thiếu OTel
trace endpoint, OTLP metrics endpoint/credential, Sentry DSN hoặc release. Readiness chỉ có ý nghĩa
khi exporter delivery được theo dõi; Platform on-call phải có alert “telemetry absent/export
failure”, không chỉ alert ứng dụng.

Hosted-free là demo/alpha không SLA nên có thể không đặt gate này; nó không được gọi là production
SLO profile. `slo-dashboard.json` xác nhận đủ sáu check `login`, `matching`, `messaging`,
`call-setup`, `party-room`, `payment` của đúng release đã có data và delivery test PASS trong 30
ngày.
