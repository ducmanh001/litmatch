## Review — Feed & Short video — plan — 2026-07-18

### 1. Phạm vi & luồng nghiệp vụ

User tự sở hữu profile → tạo post/video/comment bằng identity từ access token → guard visibility của nội dung → batch-read `User` → compose `PublicProfileDto` vào `author` → web hiển thị avatar, nickname và link hồ sơ.

### 2. Bảng giả định

| #   | Giả định                                             | Ai phá / cách phá                       | Chặn ở đâu                                                                              | Verdict |
| --- | ---------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------- | ------- |
| 1   | Client không thể gán tác giả khác cho nội dung       | Gọi API với body/ID giả                 | Feed/ShortVideo service lấy `authorUserId` từ JWT, không từ body                        | ✅      |
| 2   | Chỉ người được xem nội dung mới nhận profile tác giả | Dò ID post/video/comment hoặc bypass UI | `getPostOrThrow` audience/block guard; `getVideoOrThrow` visibility guard trước compose | ✅      |
| 3   | Một trang không tạo N request hồ sơ                  | Page có nhiều tác giả                   | `UserService.findByIds()` batch-load, dedupe ID                                         | ✅      |
| 4   | Không lộ dữ liệu nhạy cảm của User                   | DTO mở rộng vô ý                        | Chỉ compose `PublicProfileDto`; không có birthDate, region, seeking, status, trustScore | ✅      |
| 5   | Quan hệ FK luôn có tác giả                           | DB corruption/xoá user trái luật        | FK author → users và DTO fail thay vì trả author thiếu                                  | ✅      |

### 3. Checklist áp dụng

| Mục                       | Kết quả | Ghi chú                                                                        |
| ------------------------- | ------- | ------------------------------------------------------------------------------ |
| Boundary/domain ownership | ✅      | User module sở hữu profile; Feed/Short-video chỉ gọi public API `UserService`. |
| Authorization/IDOR        | ✅      | Không thêm endpoint hay quyền mới; compose diễn ra sau guard nội dung hiện có. |
| Performance/N+1           | ✅      | One batch lookup per content page.                                             |
| Privacy                   | ✅      | Chỉ public profile fields.                                                     |
| Economy/state machine     | N/A     | Không thay đổi tiền hoặc state transition.                                     |

### 4. Test đã chạy

Chờ verify sau khi sync OpenAPI, test backend/web và build.

### 5. Kết luận: PASS

Kế hoạch cho phép triển khai: public author data đã có sẵn được compose vào content response; không mở thêm thông tin nhạy cảm hoặc social link.

## Review — Feed & Short video — verify — 2026-07-18

### 1. Phạm vi & luồng nghiệp vụ

User tự sở hữu profile → tạo post/video/comment bằng identity từ access token → guard visibility của nội dung → batch-read `User` → compose `PublicProfileDto` vào `author` → web hiển thị avatar, nickname và link hồ sơ.

### 2. Bảng giả định

| #   | Giả định                                             | Ai phá / cách phá                              | Chặn ở đâu                                                                                                         | Verdict |
| --- | ---------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------- |
| 1   | Client không thể gán tác giả khác cho nội dung       | Gọi API với body/ID giả                        | `feed.service.ts:230-246`; `short-video.service.ts:300-312` lấy tác giả từ JWT                                     | ✅      |
| 2   | Chỉ người được xem nội dung mới nhận profile tác giả | Dò ID post/video/comment hoặc bypass UI        | `feed.service.ts:186-214`; `short-video.service.ts:158-175` guard trước controller compose                         | ✅      |
| 3   | Một trang không tạo N request hồ sơ                  | Page có nhiều tác giả                          | `feed.controller.ts:77-79`, `:143-145`; `short-video.controller.ts:100-102`, `:191-193`; `user.service.ts:103-107` | ✅      |
| 4   | Không lộ dữ liệu nhạy cảm của User                   | DTO mở rộng vô ý                               | `PublicProfileDto` là shape author duy nhất; contract OpenAPI đã sync                                              | ✅      |
| 5   | UI comment/video hiển thị đúng tác giả trả về        | API trả nhiều commenter/video                  | `comment-list.tsx:47-77`; `video-comments-sheet.tsx:59-84`; test web thật                                          | ✅      |
| 6   | Web không sập khi core-api chưa reload contract mới  | Web mới nhận response cũ chỉ có `authorUserId` | Fallback author ở PostCard, VideoSlide và hai comment lists                                                        | ✅      |

### 3. Checklist áp dụng

| Mục                       | Kết quả | Ghi chú                                                              |
| ------------------------- | ------- | -------------------------------------------------------------------- |
| Boundary/domain ownership | ✅      | User module sở hữu profile; Feed/Short-video chỉ dùng `UserService`. |
| Authorization/IDOR        | ✅      | Không thêm endpoint hay quyền mới; compose sau guard visibility.     |
| Performance/N+1           | ✅      | One batch lookup per content page; web bỏ hydrate từng `/users/:id`. |
| Privacy                   | ✅      | Chỉ `PublicProfileDto`: nickname/avatar/gender/interests.            |
| API compatibility         | ✅      | `pnpm openapi:sync` và `pnpm openapi:check` PASS.                    |
| Economy/state machine     | N/A     | Không thay đổi tiền hoặc state transition.                           |

### 4. Test đã chạy

- `pnpm nx test core-api --runInBand` — 46 suites, 487 tests PASS (16 integration suites skipped vì không set `INTEGRATION_DB_URL`).
- `pnpm nx test web` — 57 files, 212 tests PASS (gồm 2 case response legacy không có `author`).
- `pnpm nx build core-api` — PASS.
- `pnpm nx build web` — PASS.
- `pnpm agent:verify core --tier=fast` — PASS.
- `pnpm agent:verify frontend --tier=fast` — PASS.
- `pnpm agent:verify core` — FAIL duy nhất ở repo-wide `pnpm format:check`: `apps/web/src/features/matching/components/matching-scanner.tsx` đã unformatted, là file ngoài phạm vi và có thay đổi sẵn trong worktree.

### 5. Kết luận: FAIL

Luồng và kiểm chứng theo phạm vi đều PASS. Theo invariant repo, chưa thể kết luận task hoàn tất cho đến khi full verify qua; cần chủ sở hữu của thay đổi `matching-scanner.tsx` format file đó, hoặc xác nhận cho phép format riêng file ngoài phạm vi.
