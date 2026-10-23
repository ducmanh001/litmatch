// Đăng ký, Onboarding và Guest (module auth): CHỈ luồng có cơ chế thật
// (OTP: UPDATE có điều kiện + HMAC + dùng một lần; find-or-create chống race; refresh: xoay token + phát hiện dùng lại).
// Một file, luồng đi liền mạch từ trên xuống theo thứ tự chạy; mỗi đoạn có nhãn tầng.
// `src` = bằng chứng của từng comment (comment gốc trong code hoặc docs); engine bỏ qua, verify-annotated.mjs yêu cầu có.
const A = 'apps/core-api/src/modules/auth';
const AC = `${A}/auth.controller.ts`;
const AS = `${A}/auth.service.ts`;
const AK = `${A}/auth.cookies.ts`;
const OS = `${A}/services/otp.service.ts`;
const TS = `${A}/services/token.service.ts`;
const RA = `${A}/repositories/typeorm-refresh-session.adapter.ts`;
const MIG = 'apps/core-api/src/database/migrations/1751900000000-init-auth-user.ts';
const END_FN = '^  }$';
const END_SQL = '^    `\\);$';

const fn = (anchor) => ({ at: anchor, to: END_FN });
const top = (anchor) => ({ at: anchor, to: '^}' });
const sql = (anchor) => ({ at: anchor, to: END_SQL, pad: [1, 0] });

// Controller dựng response: refresh token chỉ đi qua cookie httpOnly (dùng chung cho verify và refresh).
const FINALIZE_SESSION = {
  tag: 'CONTROLLER',
  file: AC,
  dedent: true,
  ranges: [fn('private finalizeSession(')],
  inline: [
    {
      at: 'setAuthCookies(res, {',
      text: ['Refresh token chỉ đi qua cookie httpOnly rồi bị bóc khỏi body trả về: client (và XSS) không bao giờ thấy giá trị này.'],
      src: 'doc finalizeSession auth.controller.ts L148 + docs/adr/0007-httponly-cookie-refresh-token.md mục 1',
    },
  ],
};

export const annotatedFeatures = [
  {
    id: '17-dang-ky-onboarding-va-guest',
    short: 'Đăng ký, Onboarding và Guest',
    title: 'Đăng nhập: refresh token (bảng tăng nhanh nhất) và giao OTP',
    summary: 'Mỗi lần xoay refresh token (≈ 15 phút một lần khi đang mở app) là một INSERT + một UPDATE: ở quy mô đề bài đó là ≈ 290 triệu hàng/ngày, bảng tăng nhanh nhất của hệ thống. Trang 01 cho thấy đường xoay, phát hiện dùng lại và đường dọn token cũ tuỳ chọn. Trang 02 là cách giao OTP qua cổng SMS mà không để mã hợp lệ "mồ côi" và không bơm SMS tốn tiền.',
    arch: 'data-lifecycle',
    diagramAnchor: '17-dang-ky-onboarding-va-guest',
    endpoints: [
      {
        n: '01',
        slug: 'post-refresh',
        method: 'POST',
        short: '/auth/refresh',
        route: '/api/v1/auth/refresh',
        name: 'Đổi refresh token lấy phiên mới',
        title: 'Xoay refresh token mỗi lần dùng và phát hiện dùng lại: token đã xoay mà bị dùng lại thì thu hồi cả họ token.',
        flow: '[CONTROLLER] → [SERVICE] → [POSTGRES] → [CONTROLLER]',
        roles: [
          ['CONTROLLER', 'Chặn bằng CSRF double-submit, đọc refresh token từ cookie httpOnly, rồi đặt cặp cookie mới và trả access token (không trả refresh token trong body).'],
          ['SERVICE', 'Sinh token mới và nhờ adapter xoay token cũ; kiểm lại trạng thái user tại thời điểm refresh, bị khóa thì thu hồi token vừa cấp.'],
          ['POSTGRES', 'Khóa dòng token (FOR UPDATE), đánh dấu rotated bằng UPDATE có điều kiện, ghi token mới cùng transaction; dùng lại token cũ thì thu hồi cả family.'],
        ],
        tables: [
          ['refresh_tokens', 'mỗi lần xoay: dòng cũ được đánh dấu rotated_at, dòng mới giữ cùng family_id; token_hash unique; dùng lại thì revoked_at được đặt cho cả family.'],
          ['users', 'đọc user để lấy role, isGuest và kiểm trạng thái còn Active.'],
        ],
        related: [
          ['CsrfGuard', 'chặn trước khi vào controller: so cookie csrf_token với header X-CSRF-Token (không chép).'],
          ['POST /auth/otp/verify, /auth/social, /auth/guest', 'nơi cấp refresh token đầu tiên của 1 family (xem file 01).'],
          ['POST /auth/logout', 'thu hồi token hiện tại và xóa cookie (chưa chép).'],
        ],
        nested: true, // lồng nhau tự động theo quan hệ gọi hàm; `skip` (hàm cơ bản không bung) và `steps` (đánh số bước) khai bên dưới
        // findByTokenHash: đọc theo băm; issueTokens: ký JWT + sinh chuỗi ngẫu nhiên; setAuthCookies/cookieOptions: dựng cờ cookie
        skip: ['findByTokenHash', 'issueTokens', 'setAuthCookies', 'cookieOptions'],
        steps: [
          { at: "@Post('refresh')", text: 'Nhận request: CSRF double-submit, refresh token đọc từ cookie' },
          { at: 'const session = await this.refreshSessions.findByTokenHash(', text: 'Tìm token theo băm SHA-256, kiểm chưa thu hồi và còn hạn' },
          { at: 'const tokens = await this.issueTokens(', text: 'Sinh cặp token mới (chưa lưu vào DB)' },
          { at: 'const result = await this.refreshSessions.rotate({', text: 'Giao adapter xoay token trong 1 transaction' },
          { at: 'const session = await manager.findOne(RefreshToken, {', text: 'Đọc lại token cũ và khóa dòng (FOR UPDATE)' },
          { at: 'if (session.rotatedAt) {', text: 'Token đã xoay mà bị dùng lại thì thu hồi cả family' },
          { at: 'const marked = await manager.update(', text: 'Đánh dấu token cũ đã xoay (UPDATE có điều kiện)' },
          { at: 'await manager.insert(RefreshToken, {', text: 'Ghi token mới cùng family, cùng transaction' },
          { at: 'await manager.query(', in: 'TypeOrmRefreshSessionAdapter.rotate', text: 'Tuỳ chọn (mặc định TẮT): dọn token đã xoay cũ hơn N ngày của CÙNG họ, FOR UPDATE SKIP LOCKED' },
          { at: "if (result === 'invalid') {", text: 'Kết quả invalid hoặc reused thì từ chối với 401' },
          { at: 'const user = await this.userService.getByIdOrThrow(userId);', text: 'Kiểm lại trạng thái user, bị khóa thì thu hồi token vừa cấp' },
          { at: 'setAuthCookies(res, {', text: 'Đặt refresh token mới vào cookie httpOnly, không trả trong body' },
          { at: 'return {', in: 'AuthController.finalizeSession', text: 'Trả access token và csrfToken trong body' },
        ],
        items: [
          // 1) Controller: CSRF + cookie
          {
            tag: 'CONTROLLER',
            file: AC,
            dedent: true,
            ranges: [fn("@Post('refresh')")],
            inline: [
              {
                at: '@UseGuards(CsrfGuard)',
                text: ['CSRF double-submit: so cookie csrf_token với header X-CSRF-Token (giá trị client nhận qua body lúc đăng nhập), lệch hoặc thiếu thì 401. Cần vì cookie refresh tự gắn theo request.'],
                src: 'docs/adr/0007-httponly-cookie-refresh-token.md mục 3',
              },
            ],
          },

          // 2) Service: xoay token rồi kiểm lại user
          {
            tag: 'SERVICE',
            file: AS,
            dedent: true,
            ranges: [fn('async refresh(')],
            inline: [
              {
                at: 'const user = await this.userService.getByIdOrThrow(userId);',
                text: ['Xác minh lại trạng thái ĐÚNG THỜI ĐIỂM hành động: user bị khóa giữa 2 lần refresh thì không được cấp phiên mới.'],
                src: 'comment gốc auth.service.ts L126-127',
              },
              {
                at: 'await this.tokenService.revoke(tokens.refreshToken);',
                text: ['Thu hồi luôn token mới vừa cấp, vì bước xoay đã lưu nó vào DB.'],
                src: 'suy ra từ code (rotate đã ghi token mới trước khi kiểm user)',
              },
            ],
          },
          {
            tag: 'SERVICE',
            file: TS,
            dedent: true,
            ranges: [fn('async rotate('), fn('private async issueTokens('), fn('private hash(')],
            inline: [
              {
                at: 'const tokens = await this.issueTokens(user.id, user.isGuest, user.role);',
                text: ['Chỉ sinh token (chưa lưu): việc lưu token mới nằm TRONG transaction xoay của adapter, cùng với đánh dấu token cũ.'],
                src: 'suy ra từ code (issueTokens không gọi refreshSessions.issue; replacement truyền vào refreshSessions.rotate)',
              },
              {
                at: "if (result === 'reused') {",
                text: ['Token đã xoay mà bị dùng lại: adapter đã thu hồi cả family (mọi token cùng lần đăng nhập), nên cả bên dùng lại lẫn người thật phải đăng nhập lại.'],
                src: 'doc entity refresh-token.entity.ts L10-12 + message DomainException token.service.ts',
              },
              {
                at: "return createHash('sha256').update(value).digest('hex');",
                text: ['SHA-256 là đủ vì token ngẫu nhiên 48 byte (không phải mật khẩu), không cần bcrypt.'],
                src: 'doc hash token.service.ts L150 + auth.constants.ts L14',
              },
            ],
          },

          // 3) Postgres: xoay token dưới khóa dòng
          {
            tag: 'POSTGRES',
            file: RA,
            dedent: true,
            ranges: [fn('async findByTokenHash('), fn('async rotate(')],
            inline: [
              {
                at: "lock: { mode: 'pessimistic_write' },",
                text: ['Khóa dòng token (FOR UPDATE): 2 request song song cùng 1 token xếp hàng, chỉ 1 request đánh dấu được rotated.'],
                src: 'doc rotate token.service.ts L64-66 + suy ra từ code (khóa dòng rồi UPDATE có điều kiện)',
              },
              {
                at: 'if (session.rotatedAt) {',
                text: ['Token đã xoay mà còn được dùng lại: thu hồi cả family (mọi token chưa revoke cùng familyId).'],
                src: 'doc entity refresh-token.entity.ts L10-12',
              },
              {
                at: 'const marked = await manager.update(',
                text: ['Đánh dấu rotated bằng UPDATE có điều kiện rotated_at IS NULL; 0 dòng bị ảnh hưởng nghĩa là request khác đã xoay trước, coi như dùng lại.'],
                src: 'doc rotate token.service.ts L64-66',
              },
              {
                at: 'await manager.insert(RefreshToken, {',
                text: ['Token mới giữ nguyên familyId và ghi cùng transaction với việc đánh dấu token cũ: không có trạng thái cũ đã xoay mà chưa có token mới.'],
                src: 'suy ra từ code (cùng manager, familyId: session.familyId)',
              },
              {
                at: 'await manager.query(',
                text: [
                  'Dọn cơ hội lúc xoay (chỉ khi RETENTION_MODE=delete VÀ AUTH_REFRESH_ROTATED_RETENTION_DAYS > 0; mặc định 0 = TẮT): xoá token ĐÃ XOAY cũ hơn N ngày của cùng họ, dùng index theo family_id, chi phí tỉ lệ với hoạt động. Ở ≈ 290 triệu hàng/ngày bảng này nếu không dọn thì không bao giờ ổn định.',
                  'FOR UPDATE SKIP LOCKED để việc dọn KHÔNG BAO GIỜ chờ khoá hàng: revokeFamily/revokeForUser cập nhật các hàng của họ theo thứ tự index, nếu xoay cũng chờ thì thành vòng chờ (deadlock). Hàng bị bỏ qua được dọn ở lần xoay sau.',
                  'Đánh đổi bảo mật (cần review trước khi bật): token đã dọn mà bị phát lại chỉ nhận 401 thường, không còn kích hoạt "thu hồi cả họ" — cửa sổ phát hiện token bị đánh cắp co từ ~TTL xuống ~N ngày.',
                ],
                src: 'comment gốc typeorm-refresh-session.adapter.ts + ADR 0014 (mục "Đánh đổi bảo mật của dọn-lúc-xoay") + test lifecycle-retention.integration.spec.ts',
              },
            ],
          },
          { tag: 'POSTGRES', file: MIG, dedent: true, ranges: [sql('CREATE TABLE refresh_tokens (')] },

          // 4) Controller: đặt cookie mới
          FINALIZE_SESSION,
          // setAuthCookies/cookieOptions: dựng cờ cookie (httpOnly, sameSite, path), chỉ còn dòng gọi (xem `skip`)
          { tag: 'CONTROLLER', file: AK, ranges: [top('function cookieOptions('), top('export function setAuthCookies(')] },
        ],
      },
      {
        n: '02',
        slug: 'post-otp-request',
        method: 'POST',
        short: '/auth/otp/request',
        route: '/api/v1/auth/otp/request',
        name: 'Yêu cầu OTP đăng nhập bằng số điện thoại',
        title:
          'Đếm hạn mức theo SỐ ĐIỆN THOẠI ở server, sinh mã và chỉ lưu hash; chế độ sms-http lưu mã mới trước, giao qua cổng SMS rồi mới vô hiệu mã cũ, giao lỗi thì vô hiệu chính mã vừa tạo và trả 503 mà không lộ mã.',
        flow: '[CONTROLLER] → [SERVICE] → [POSTGRES] → [EXTERNAL]',
        roles: [
          ['CONTROLLER', 'Giới hạn 5 lần mỗi phút theo IP; hạn mức theo số điện thoại nằm trong OtpService; chế độ response (dev/e2e) trả mã trong body, chế độ sms-http không bao giờ trả mã.'],
          ['SERVICE', 'Chặn khi OTP tắt, đếm yêu cầu trong 1 giờ theo số điện thoại, sinh mã ngẫu nhiên an toàn mật mã, lưu HMAC của (số, mã), giao mã và vô hiệu mã cũ đúng thứ tự.'],
          ['POSTGRES', 'phone_otps: mỗi yêu cầu một dòng; vô hiệu = đặt consumed_at; verify luôn chọn mã chưa dùng MỚI NHẤT nên thứ tự vô hiệu quyết định mã nào còn sống.'],
          ['EXTERNAL', 'Cổng SMS HTTP trung lập: POST JSON kèm Bearer token, có timeout, không cho chuyển hướng; thông điệp lỗi không chứa URL, số điện thoại, nội dung hay mã.'],
        ],
        tables: [
          ['phone_otps', 'một dòng mỗi lần yêu cầu: code_hash, expires_at, consumed_at (đã dùng hoặc bị vô hiệu), attempt_count; đếm yêu cầu 1 giờ theo số điện thoại dùng created_at.'],
        ],
        related: [
          ['Verify OTP', 'verifyOtp đếm lần thử bằng UPDATE có điều kiện attempt_count < max và chỉ cho dùng một lần bằng UPDATE có điều kiện consumed_at IS NULL (không chép).'],
          ['Chế độ giao', 'AUTH_OTP_DELIVERY = response | sms-http | disabled. Mặc định giữ response (production ghi lỗi mỗi lần khởi động); K8s base đặt disabled. Đóng lỗ hổng ở production = đặt sms-http hoặc disabled (ADR 0013).'],
        ],
        nested: true,
        skip: ['assertPhoneOtpEnabled'],
        steps: [
          { at: 'requestOtp(', text: 'Yêu cầu OTP: 5 lần mỗi phút theo IP' },
          { at: 'this.assertPhoneOtpEnabled();', text: 'Chặn sớm khi đăng nhập bằng số điện thoại đang tắt' },
          { at: 'const recentCount = await this.otpRepo.countBy({', text: 'Hạn mức theo SỐ ĐIỆN THOẠI ở server (không chỉ theo IP)' },
          { at: 'const code = randomInt(0, 10 ** OTP_CODE_DIGITS)', text: 'Sinh mã ngẫu nhiên an toàn mật mã; chỉ lưu hash' },
          { at: "if (delivery === 'response') {", text: 'Chế độ response (dev/e2e): vô hiệu mã cũ rồi trả mã trong body' },
          { at: 'const otp = await this.otpRepo.save(newOtp());', text: 'sms-http: lưu mã mới TRƯỚC, chưa vô hiệu mã cũ' },
          { at: "redirect: 'error',", text: 'Cổng SMS không được chuyển hướng' },
          { at: "this.metrics?.observeOtpDelivery('failed');", text: 'Giao lỗi: vô hiệu CHÍNH mã vừa tạo rồi trả 503' },
          { at: 'createdAt: LessThan(otp.createdAt ?? new Date()),', text: 'Giao OK mới vô hiệu các mã CŨ HƠN' },
        ],
        items: [
          { tag: 'CONTROLLER', file: AC, dedent: true, ranges: [fn('requestOtp(')] },
          { tag: 'SERVICE', file: AS, dedent: true, ranges: [fn('async requestOtp(')] },
          {
            tag: 'SERVICE',
            file: OS,
            dedent: true,
            ranges: [fn('async requestOtp(')],
            inline: [
              {
                at: 'const recentCount = await this.otpRepo.countBy({',
                text: ['Hạn mức theo SỐ ĐIỆN THOẠI ở server vì limit chỉ ở frontend là vô nghĩa; throttler theo IP ở controller là lớp thứ hai.'],
                src: 'doc requestOtp otp.service.ts ("Rate limit theo SỐ ĐIỆN THOẠI ở server ... limit chỉ ở FE là vô nghĩa")',
              },
              {
                at: 'const otp = await this.otpRepo.save(newOtp());',
                text: [
                  'Lưu mã mới TRƯỚC nhưng CHƯA vô hiệu mã cũ: giao lỗi thì người dùng vẫn còn mã cũ dùng được.',
                  'Giao OK mới vô hiệu các mã CŨ HƠN chứ không phải "mọi mã khác": hai request song song vẫn để lại đúng mã mới nhất. Vô hiệu bắt buộc làm SAU khi giao vì verify chọn mã chưa dùng mới nhất, nên mã cũ còn sống sẽ sống lại ngay khi mã mới được dùng.',
                ],
                src: 'comment gốc otp.service.ts (requestOtp, "sms-http: lưu mã mới TRƯỚC nhưng CHƯA vô hiệu mã cũ")',
              },
            ],
          },
          {
            tag: 'SERVICE',
            file: OS,
            dedent: true,
            ranges: [fn('private async deliverBySms(')],
            inline: [
              {
                at: "this.metrics?.observeOtpDelivery('failed');",
                text: [
                  'Giao lỗi thì vô hiệu CHÍNH mã vừa tạo để không để mã hợp lệ "mồ côi"; timeout mơ hồ cũng coi là lỗi nên SMS tới muộn không dùng được và người dùng yêu cầu lại.',
                  'Lượt lỗi vẫn tính vào hạn mức theo số điện thoại: cổng chập chờn có thể đã gửi SMS thật, không đếm sẽ mở đường bơm SMS tốn tiền. Lỗi trả 503 (lỗi phụ thuộc ngoài) vì DomainException chỉ dành cho 4xx.',
                ],
                src: 'doc deliverBySms otp.service.ts ("Giao lỗi thì vô hiệu CHÍNH mã vừa tạo ... Lượt lỗi vẫn tính vào hạn mức theo số điện thoại") + comment gốc ("Không dùng DomainException: nó chỉ cho 4xx")',
              },
            ],
          },
          {
            tag: 'EXTERNAL',
            file: 'apps/core-api/src/modules/auth/services/http-otp-sender.ts',
            dedent: true,
            ranges: [fn('async send(')],
            inline: [
              {
                at: "redirect: 'error',",
                text: ['Cổng SMS không được phép chuyển hướng: tránh gửi Bearer token sang một host khác.'],
                src: 'comment gốc http-otp-sender.ts ("Cổng SMS không được phép chuyển hướng (tránh gửi token sang host khác)")',
              },
              {
                at: 'throw new Error(',
                text: ['Thông điệp lỗi do adapter tự soạn, không chứa URL, số điện thoại, nội dung hay body phản hồi (có thể lặp lại mã OTP), để caller log được mà không rò rỉ; `cause` giữ lỗi gốc để điều tra nhưng không bao giờ ra tới response hay log.'],
                src: 'doc HttpOtpSender http-otp-sender.ts + comment gốc ("OtpService chỉ log message (đã soạn, không chứa URL/số/mã)")',
              },
            ],
          },
        ],
      },
    ],
  },
];
