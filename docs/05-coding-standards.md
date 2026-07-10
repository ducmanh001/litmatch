[← 04 · Tech Stack](./04-tech-stack.md) · **05 · Coding Standards** · [06 · Domain Rules →](./06-domain-rules.md)

# 5. Coding Standard (NestJS) — tuân theo xuyên suốt, mọi module, mọi giai đoạn

## 5.1 Nguyên tắc chung
- **Không hardcode**: mọi config (port, DB url, secret, giá diamond, thời lượng free call, tỉ lệ quy đổi VIP...) đưa vào `.env` + `ConfigModule`, validate bằng `Joi`.
- **Layer rõ ràng**: `Controller` → `Service` → `Repository`. Controller không gọi thẳng Repository.
- **DTO + class-validator** cho mọi input/output, không nhận `any`.
- **Dependency Injection** triệt để.
- **Module hoá theo domain**, không import chéo lung tung giữa module.
- **Error handling chuẩn hoá**: `DomainException` base class + global `ExceptionFilter`, format lỗi thống nhất (code, message, traceId).
- **Idempotency bắt buộc** cho mọi API động tới diamond (idempotencyKey).
- **Transaction DB bắt buộc** cho mọi thao tác trừ/cộng diamond (`SELECT FOR UPDATE` hoặc optimistic lock) — chỗ hay bug nhất trong toàn hệ thống.
- **Test bắt buộc**: unit test Service (Jest), e2e test cho flow quan trọng (matching → call → billing, mua diamond → nhận gift).
- **Lint/format**: ESLint + Prettier + Husky pre-commit.

## 5.2 NestJS lifecycle convention
- Dùng đúng lifecycle hook (`OnModuleInit`, `OnApplicationBootstrap`) để khởi tạo kết nối Redis/Kafka.
- `Guard` cho auth/permission, `Interceptor` cho logging/transform response, `Pipe` cho validate.
- Config qua `ConfigService`, không dùng `process.env` trực tiếp trong business logic.

## 5.3 Cấu trúc thư mục (ví dụ trong `apps/core-api`)
```
src/
 |-- modules/
 |    |-- matching/
 |    |    |-- matching.controller.ts
 |    |    |-- matching.service.ts
 |    |    |-- matching.module.ts
 |    |    |-- dto/
 |    |    |-- entities/       (MatchTicket, MatchQueue, MatchSession)
 |    |    `-- events/
 |    `-- economy/
 |         |-- economy.controller.ts
 |         |-- economy.service.ts       (tính toán/derive Wallet snapshot)
 |         |-- ledger.service.ts        (ghi bút toán Nợ/Có, chỉ append)
 |         |-- economy.module.ts
 |         |-- dto/
 |         `-- entities/       (LedgerEntry, Wallet, Transaction)
 |-- common/
 |    |-- filters/
 |    |-- interceptors/
 |    |-- guards/
 |    `-- decorators/
 |-- config/
 `-- main.ts
```

Mỗi module nghiệp vụ khác (auth, user, social, content, moderation, notification, gift) đi theo đúng bộ khung `*.controller.ts / *.service.ts / *.module.ts / dto/ / entities/ / events/` như ví dụ `matching/` ở trên.

---
[← 04 · Tech Stack](./04-tech-stack.md) · [06 · Domain Rules →](./06-domain-rules.md)
