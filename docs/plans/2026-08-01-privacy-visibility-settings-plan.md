## Review — Privacy visibility settings — plan — 2026-08-01

### 1. Phạm vi & luồng nghiệp vụ

User mở Privacy → `GET /users/me/privacy` lấy state server → toggle gửi toàn bộ state qua
`PUT /users/me/privacy` → server upsert theo `userId` → các luồng Discovery/Nearby/Feed/Profile
đọc lại preference tại thời điểm trả dữ liệu → đối phương chỉ nhận thông tin khi chủ hồ sơ cho
phép.

Presence đi theo `signaling socket lease → realtime:presence:{userId} → core-api presence
endpoint`; phone search đi theo `phone identity → searchableByPhone guard → PublicProfileDto`.

### 2. Bảng giả định

| #   | Giả định                                                              | Vector phá / hậu quả                         | Vị trí chặn (file:line)                                                                                       | Verdict |
| --- | --------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | Client không tự quyết visibility bằng UI                              | Gọi thẳng API/đổi request body               | `user.controller.ts:62-93`; `privacy-settings.service.ts:19-65`; `user.service.ts:304-370`                    | ✅      |
| 2   | User cũ chưa có row vẫn có default an toàn                            | Row thiếu làm lộ online/phone hoặc hiện nhầm | `privacy-setting.dto.ts:6-35`; `1756800000000-user-privacy-settings.ts:8-17`                                  | ✅      |
| 3   | Hai toggle gửi đồng thời không tạo hai row                            | Race `PUT` đầu tiên cùng `userId`            | `privacy-settings.service.ts:25-37`; `privacy-setting.entity.ts:8-10`                                         | ✅      |
| 4   | Hidden profile biến mất khỏi Discovery/Feed, không chỉ biến mất ở web | Deep link/query trực tiếp                    | `user.service.ts:304-370`; `nearby.service.ts:314-321`; `feed.service.ts:105-112`; `story.service.ts:138-140` | ✅      |
| 5   | Distance không bị suy ra khi chủ hồ sơ tắt                            | Đọc raw API thay vì UI                       | `nearby.service.ts:227-252`; `nearby.dtos.ts:69-78`                                                           | ✅      |
| 6   | Presence không lộ khi tắt hoặc Redis hỏng                             | Presence endpoint/Redis outage               | `user.controller.ts:81-93`; `user-presence.service.ts:11-19`; `connection-quota.service.ts:125-157`           | ✅      |
| 7   | Phone search không trở thành user-enumeration oracle                  | Dò số không tồn tại/tắt quyền                | `phone-search.service.ts:22-34`; `phone-search.controller.ts:20-28`                                           | ✅      |

### 3. Checklist áp dụng

| Mục                       | Kết quả | Ghi chú                                                                                    |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| Boundary/domain ownership | ✅      | Preference thuộc User; Discovery/Feed chỉ gọi public User API hoặc enforce query guard.    |
| Authorization/IDOR        | ✅      | Privacy chỉ đọc/ghi theo `CurrentUser`; public presence/search không nhận quyền từ client. |
| Privacy                   | ✅      | Không thêm preference vào `PublicProfileDto`; distance/online gated riêng.                 |
| Concurrency               | ✅      | Settings upsert theo primary key; presence dùng lease member, không dùng Map cục bộ.       |
| Economy/state machine     | N/A     | Không chạm tiền, ledger hoặc matching state.                                               |

### 4. Test evidence

| Check                       | Kết quả                                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Core targeted privacy tests | ✅ 7 suites, 77 tests; phone-search bổ sung 3 tests                                                                                |
| Core strict gate            | ✅ 80 suites, 872 tests; lint, build, migration-run, 12 E2E                                                                        |
| Signaling strict gate       | ✅ 9 suites, 45 tests; lint, build, E2E 2 tests                                                                                    |
| Frontend strict gate        | ✅ lint, 75 test files/278 tests, build                                                                                            |
| OpenAPI sync/check          | ✅ PASS; generated client/spec đồng bộ                                                                                             |
| Prettier + module boundary  | ✅ PASS; 25 boundary tests                                                                                                         |
| Integration DB tests        | ⏭️ Không chạy riêng vì strict core E2E đã dùng DB cô lập; targeted integration fixtures chỉ chạy khi `INTEGRATION_DB_URL` được cấp |

`review-module verify`: PASS. Các assumption #1–#7 đã có vị trí chặn cụ thể ở bảng trên và
được bao phủ bởi unit/strict/E2E checks tương ứng; không có blocker còn mở.

### 5. Kết luận: PASS

Cho phép triển khai với migration mới, không sửa/xoá dữ liệu privacy cũ và không mở rộng
`PublicProfileDto` bằng trường nhạy cảm.
