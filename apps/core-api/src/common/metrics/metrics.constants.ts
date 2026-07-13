/** DI token cho Registry Prometheus dùng chung (docs/07 Giai đoạn 6) — module domain inject token
 * này để tự đăng ký metric riêng (matching latency, call drop rate...), không phụ thuộc MetricsModule. */
export const METRICS_REGISTRY = Symbol('METRICS_REGISTRY');
