# libs

Shared libraries dùng chung giữa `core-api`, `signaling-gateway`, `media-server`. Tạo trong Giai đoạn 0 (`../docs/07-roadmap.md`):

- `common-exceptions` — `DomainException` base class + error format chuẩn
- `common-dtos` — DTO/type dùng chung
- `logger` — logging chuẩn hoá
- `config-validator` — validate `.env` bằng Joi

Xem `../docs/05-coding-standards.md` cho convention chi tiết.
