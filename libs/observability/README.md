# observability

Prometheus registry + HTTP request duration middleware dùng chung cho `core-api` và
`signaling-gateway` (docs/07 Giai đoạn 6 — Scale & Observability). Lib này CHỈ chứa phần
trung lập (registry + default metrics + middleware đo request); metric riêng theo domain
(matching latency, call drop rate, transaction failure rate...) sống ngay trong module sở
hữu domain đó ở từng app — xem `docs/services/*` tương ứng.

## Building

Run `nx build observability` to build the library.

## Running unit tests

Run `nx test observability` to execute the unit tests via [Jest](https://jestjs.io).
