[← 11 · NFR & Production Readiness](./11-nfr-and-production-readiness.md) · **Sources**

# Nguồn tham khảo

Ưu tiên tài liệu chính thức/primary source cho quyết định có thể ảnh hưởng production. Ngày đối chiếu gần nhất: **2026-07-10**.

## Architecture và modular monolith

- Martin Fowler — [MonolithFirst](https://martinfowler.com/bliki/MonolithFirst.html).
- AWS Prescriptive Guidance — [Transactional outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html).

## LiveKit self-host

- LiveKit — [Self-hosting overview](https://docs.livekit.io/transport/self-hosting/): phân biệt self-host `Single-home SFU` với LiveKit Cloud `Global mesh SFU`; self-host một server/room.
- LiveKit — [Distributed multi-region](https://docs.livekit.io/transport/self-hosting/distributed/): Redis, node selection, draining và giới hạn một room phải fit một node.
- LiveKit — [Benchmarking](https://docs.livekit.io/transport/self-hosting/benchmark): capacity phụ thuộc publisher/subscriber/bitrate/packet workload; benchmark không phải capacity guarantee.
- LiveKit — [Kubernetes](https://docs.livekit.io/transport/self-hosting/kubernetes/): network/port/topology và yêu cầu khi deploy multi-node.

## Apple/Google IAP

- Apple — [App Store Receipts](https://developer.apple.com/documentation/appstorereceipts): receipt/`verifyReceipt` deprecated; ưu tiên signed transaction/App Store Server API.
- Apple — [App Store Server API](https://developer.apple.com/documentation/appstoreserverapi): transaction information, notification và server-side lifecycle.
- Apple — [Get Refund History](https://developer.apple.com/documentation/appstoreserverapi/get-refund-history): V2 refund history có pagination/revision.
- Google Play — [Integrate Google Play with your server backend](https://developer.android.com/google/play/billing/backend): purchase lifecycle, RTDN, acknowledge/consume và reconciliation.
- Google Play — [Fight fraud and abuse](https://developer.android.com/google/play/billing/security): verify `purchaseToken`, chỉ grant khi `PURCHASED`, handle `PENDING`, account binding và voided purchase.

## PostgreSQL concurrency

- PostgreSQL — [Index Uniqueness Checks](https://www.postgresql.org/docs/17/index-unique-checks.html): concurrent unique insert chờ transaction cạnh tranh commit/abort rồi kiểm tra lại.
- PostgreSQL — [INSERT / ON CONFLICT](https://www.postgresql.org/docs/16/sql-insert.html): atomic conflict handling và blocking behavior.

## Security/review

- OWASP — [Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/).
- PortSwigger Web Security Academy — [Business logic vulnerabilities](https://portswigger.net/web-security/logic-flaws).
- Claude Code Docs — [How Claude remembers your project](https://docs.anthropic.com/en/docs/claude-code/memory).

> Các bài viết secondary source có thể dùng để tìm ý, nhưng mọi claim thay đổi kiến trúc production phải truy về primary source/benchmark/ADR và ghi ngày/version.

---
[← 11 · NFR & Production Readiness](./11-nfr-and-production-readiness.md) · [00 · Overview & Index →](./00-overview-and-index.md)
