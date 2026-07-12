[← 10 · Code Review Checklist](./10-code-review-checklist.md) · **Sources**

# Nguồn tham khảo dùng để nghiên cứu và bổ sung bộ docs này

- Ledger/double-entry cho ví điện tử: SDK.finance — "What Is a Double-Entry Ledger in Fintech?"; Fintechly — "Ledger System Design: Principles for Accuracy, Auditability, and Scale"; Prachub — "Design a bank account ledger" (Coinbase interview question)
- Matchmaking/matching queue quy mô lớn: Prachub — "Design game matchmaking and waiting queue" (Roblox interview question); Hello Interview — "System Design Interview Patterns" (contention/race condition)
- SFU quy mô lớn (mediasoup vs LiveKit): mediasoup official docs — "Scalability"; LiveKit Docs — "LiveKit SFU"; Forasoft — "mediasoup, Janus, LiveKit, Jitsi Videobridge, Pion: Choosing an SFU"
- Lỗi logic nghiệp vụ (business logic vulnerability) làm nền cho § 10.0: PortSwigger Web Security Academy — "Business logic vulnerabilities"; Pynt — "What Are Business Logic Vulnerabilities & How to Prevent Them"

> Ghi chú: đây là tài liệu kỹ thuật tổng hợp từ nghiên cứu thực tế + kinh nghiệm ngành, không phải bản sao chép nguyên văn từ bất kỳ nguồn nào — dùng làm định hướng, khi triển khai chi tiết từng phần nên đọc thêm tài liệu chính thức tương ứng (mediasoup docs, LiveKit docs, OWASP).

---

[← 10 · Code Review Checklist](./10-code-review-checklist.md) · [00 · Overview & Index →](./00-overview-and-index.md)
