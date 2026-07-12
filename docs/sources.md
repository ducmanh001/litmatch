[← 10 · Code Review Checklist](./10-code-review-checklist.md) · **Sources**

# Nguồn tham khảo dùng để nghiên cứu và bổ sung bộ docs này

- Kiến trúc monolith-first: Martin Fowler —
  [Monolith First](https://martinfowler.com/bliki/MonolithFirst.html).
- Ledger/double-entry cho ví điện tử: SDK.finance — "What Is a Double-Entry Ledger in
  Fintech?"; Fintechly — "Ledger System Design: Principles for Accuracy, Auditability, and
  Scale"; Prachub — "Design a bank account ledger". Đây là nguồn định hướng; invariant của repo
  được chứng minh bằng DB constraint/property/integration test, không dựa riêng vào bài viết.
- Matchmaking/matching queue quy mô lớn: Prachub — "Design game matchmaking and waiting queue";
  Hello Interview — "System Design Interview Patterns" (contention/race condition).
- SFU: mediasoup official docs —
  [Scalability](https://mediasoup.org/documentation/v3/scalability/); LiveKit official docs —
  [Self-hosting](https://docs.livekit.io/transport/self-hosting/) và
  [Distributed multi-region](https://docs.livekit.io/transport/self-hosting/distributed/).
- Lỗi logic nghiệp vụ làm nền cho § 10.0: PortSwigger Web Security Academy —
  [Business logic vulnerability examples](https://portswigger.net/web-security/logic-flaws/examples)
  và [Race conditions](https://portswigger.net/web-security/race-conditions).

> Truy cập/kiểm lại URL ngày 2026-07-13. Nguồn thứ cấp chỉ dùng tạo hypothesis; quyết định về
> framework/provider phải ưu tiên tài liệu chính thức và ADR, correctness của code phải do test
> và invariant trong repo chứng minh.

---

[← 10 · Code Review Checklist](./10-code-review-checklist.md) · [00 · Overview & Index →](./00-overview-and-index.md)
