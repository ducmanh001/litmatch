# 0005. Networking RTC multi-node LiveKit = hostNetwork

- **Ngày**: 2026-07-13
- **Trạng thái**: Accepted (mở rộng [ADR 0001](./0001-livekit-self-host-lam-media-server.md))
- **Liên quan**: [docs/03-architecture.md § 3.5/3.8.A](../03-architecture.md), `k8s/base/media-server/deployment.yaml`, `k8s/README.md`

## Bối cảnh

LiveKit RTC dùng dải UDP `50000-50200` cho **mỗi** pod; `Service` ClusterIP/LoadBalancer chuẩn
không share được dải port đó cho nhiều pod cùng lúc (client phải map đúng ICE candidate tới đúng
pod). Đây là blocker networking khiến `media-server` bị ghim `replicas: 1` từ Giai đoạn 6
(điểm mở #2 trong `k8s/README.md`) — muốn chạy nhiều node LiveKit trên nhiều Node k8s (tiền đề
multi-region Giai đoạn 7) phải chốt phương án trước.

## Quyết định

Bật **`hostNetwork: true`** (+ `dnsPolicy: ClusterFirstWithHostNet`) cho pod `media-server`:
pod dùng thẳng network namespace của Node, client kết nối trực tiếp IP Node trên dải UDP RTC.
Đây là cách phổ biến nhất trong cộng đồng LiveKit self-host.

## Phương án đã loại & lý do

- **NodePort/port riêng theo từng pod** — cần cơ chế gán + khám phá port động cho từng pod mà
  repo chưa có, phải xây từ đầu và chưa kiểm chứng; độ phức tạp không đổi lại lợi ích nào so với
  hostNetwork ở topology hiện tại (1 pod media-server / Node).

## Hệ quả

- **Đánh đổi chấp nhận**: mất cô lập network namespace của pod; port `7880/7881/50000-50200`
  phải trống trên Node; tối đa **1 pod media-server / Node** (với `hostNetwork`, scheduler coi
  `containerPort` là host port nên không xếp 2 pod trùng port lên cùng Node). Firewall/security
  group của Node phải mở dải UDP cho client — điều kiện hạ tầng lúc deploy thật, ngoài manifest.
- Gỡ blocker **networking** cho việc chạy >1 replica media-server trên nhiều Node. **KHÔNG** tự
  nó thay đổi trần "một room phải vừa một node" (ADR 0001 + docs/03 § 3.5) — đó là giới hạn
  resource per-room, trục khác. Vì vậy thay đổi này **giữ nguyên `replicas: 1`, không thêm HPA**:
  tăng replica chỉ làm sau khi có số liệu benchmark thật từ profile Party Room
  (`loadtest/party-room-livekit.sh` — chưa từng chạy trên hạ tầng production thật, xem
  `docs/07-roadmap.md` mục 1), là một quyết định riêng.
- Tầng ứng dụng đi kèm: `core-api` chọn URL LiveKit trả cho client theo region qua
  `LIVEKIT_REGION_URLS` (JSON map region → URL, fallback `LIVEKIT_URL`). **Bất biến**: mọi URL
  trong map phải trỏ về **cùng một cụm LiveKit** (chung Redis room state) — chọn URL chỉ là chọn
  edge endpoint gần client, không phải chọn cụm khác; room được ghim endpoint theo region của
  host lúc tạo (snapshot trong DB), participant vào sau dùng đúng endpoint đó.
- Điều kiện xem xét lại: nếu cần >1 pod media-server trên cùng một Node, hoặc chính sách bảo mật
  cấm hostNetwork — quay lại phương án port động bằng ADR mới.
