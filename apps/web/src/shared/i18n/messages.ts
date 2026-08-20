import { useLocale } from './locale-store';

import type { Locale } from './locale-store';

const MESSAGES = {
  'language.choose': { vi: 'Chọn ngôn ngữ', en: 'Choose language' },
  'language.close': { vi: 'Đóng chọn ngôn ngữ', en: 'Close language selector' },
  'language.list': { vi: 'Ngôn ngữ', en: 'Language' },
  'auth.checkingSession': {
    vi: 'Đang kiểm tra phiên đăng nhập…',
    en: 'Checking your sign-in session…',
  },
  'auth.otpCreated': {
    vi: 'Mã xác thực (OTP) của bạn là',
    en: 'Your one-time password (OTP) is',
  },
  'analytics.consentTitle': {
    vi: 'Cho phép phân tích trải nghiệm?',
    en: 'Allow experience analytics?',
  },
  'analytics.settingsSection': {
    vi: 'Cải thiện trải nghiệm',
    en: 'Experience improvement',
  },
  'analytics.consentDescription': {
    vi: 'Litmatch dùng phân tích thao tác và bản phát lại đã che toàn bộ nội dung chữ/input để tìm lỗi và cải thiện sản phẩm. Bạn có thể từ chối mà vẫn dùng đầy đủ tính năng.',
    en: 'Litmatch uses interaction analytics and replays with all text and inputs masked to diagnose issues and improve the product. You can decline without losing features.',
  },
  'analytics.decline': { vi: 'Từ chối', en: 'Decline' },
  'analytics.accept': { vi: 'Đồng ý', en: 'Accept' },
  'public.features': { vi: 'Tính năng', en: 'Features' },
  'public.howItWorks': { vi: 'Cách hoạt động', en: 'How it works' },
  'public.community': { vi: 'Cộng đồng', en: 'Community' },
  'public.signIn': { vi: 'Đăng nhập', en: 'Sign in' },
  'public.signUp': { vi: 'Đăng ký miễn phí', en: 'Sign up for free' },
  'public.tryNow': { vi: 'Trải nghiệm ngay', en: 'Try it now' },
  'public.tagline': {
    vi: 'Ẩn danh trước, chân thật sau — kết nối đúng người, đúng nhịp.',
    en: 'Anonymous first, genuine later — connect with the right person at the right pace.',
  },
  'public.product': { vi: 'Sản phẩm', en: 'Product' },
  'public.explore': { vi: 'Khám phá', en: 'Explore' },
  'public.feed': { vi: 'Feed', en: 'Feed' },
  'public.company': { vi: 'Công ty', en: 'Company' },
  'public.about': { vi: 'Về chúng tôi', en: 'About us' },
  'public.careers': { vi: 'Tuyển dụng', en: 'Careers' },
  'public.contact': { vi: 'Liên hệ', en: 'Contact' },
  'public.legal': { vi: 'Pháp lý', en: 'Legal' },
  'public.terms': { vi: 'Điều khoản', en: 'Terms' },
  'public.privacy': { vi: 'Quyền riêng tư', en: 'Privacy' },
  'public.safety': { vi: 'An toàn cộng đồng', en: 'Community safety' },
  'user.fallback': { vi: 'Người dùng', en: 'User' },
  'landing.badge': { vi: 'Ra mắt 2026', en: 'Launching 2026' },
  'landing.titleBefore': { vi: 'Ẩn danh trước,', en: 'Anonymous first,' },
  'landing.titleAfter': { vi: 'chân thật sau.', en: 'genuine later.' },
  'landing.intro': {
    vi: 'Trò chuyện, gọi thoại, hay lên mic trong phòng voice cùng người lạ thú vị quanh bạn — không cần ảnh thật, không áp lực ngoại hình. Hợp nhau rồi mới mở khoá kết bạn thật.',
    en: 'Chat, call, or join a voice room with interesting people nearby — no real photo needed and no pressure about appearance. Become friends only when it feels right.',
  },
  'landing.start': { vi: 'Bắt đầu miễn phí', en: 'Get started for free' },
  'landing.viewHow': { vi: 'Xem cách hoạt động', en: 'See how it works' },
  'landing.dailyMatches': {
    vi: 'Hơn 200.000 lượt ghép ẩn danh diễn ra mỗi ngày.',
    en: 'Over 200,000 anonymous matches happen every day.',
  },
  'landing.voiceAvailable': {
    vi: 'Voice Match khả dụng',
    en: 'Voice Match available',
  },
  'landing.active': { vi: 'đang hoạt động', en: 'active now' },
  'landing.profileBio': {
    vi: 'Yêu du lịch, mê cà phê sáng sớm.',
    en: 'Loves travel and early-morning coffee.',
  },
  'landing.featureHeading': {
    vi: 'Nhiều cách để tìm đúng người',
    en: 'More ways to find your people',
  },
  'landing.featureSoul': {
    vi: 'Ghép ngẫu nhiên vào phòng chat ẩn danh 2–3 phút. Cả hai cùng "Thích" mới mở khoá hồ sơ thật.',
    en: 'Meet in an anonymous chat for 2–3 minutes. Profiles unlock only when you both like each other.',
  },
  'landing.featureVoice': {
    vi: 'Nghe giọng nói thật qua cuộc gọi ngắn ~7 phút, trước khi quyết định kết nối tiếp.',
    en: 'Hear each other in a short ~7-minute call before deciding whether to connect.',
  },
  'landing.featureParty': {
    vi: 'Phòng voice nhiều người: lên mic, trò chuyện, tặng quà — cùng lúc với cả một nhóm lạ.',
    en: 'A multi-person voice room to take the mic, chat, and send gifts with a whole new group.',
  },
  'landing.featureFeed': {
    vi: 'Đăng trạng thái, ảnh, cảm xúc — kết nối với cộng đồng qua lượt thích và bình luận.',
    en: 'Share updates, photos, and feelings; connect with the community through likes and comments.',
  },
  'landing.featureVip': {
    vi: 'Nạp Diamond, nâng cấp VIP để ưu tiên ghép nhanh và mở khoá đặc quyền riêng.',
    en: 'Top up Diamonds and upgrade to VIP for faster matching and exclusive perks.',
  },
  'landing.safetyTitle': {
    vi: 'Ẩn danh không có nghĩa là không an toàn.',
    en: 'Anonymous does not mean unsafe.',
  },
  'landing.safetyDescription': {
    vi: 'Báo cáo, chặn, và bộ lọc tuổi/giới tính đi kèm mọi hình thức ghép đôi.',
    en: 'Reporting, blocking, and age/gender filters are available for every kind of match.',
  },
  'landing.howHeading': { vi: 'Ba bước đơn giản', en: 'Three simple steps' },
  'landing.stepOneTitle': { vi: 'Ghép ngẫu nhiên', en: 'Match anonymously' },
  'landing.stepOneDescription': {
    vi: 'Vào hàng chờ, hệ thống ghép bạn với một người lạ ẩn danh theo bộ lọc tuổi/giới tính bạn chọn.',
    en: 'Join the queue and get paired anonymously using the age and gender filters you choose.',
  },
  'landing.stepTwoTitle': { vi: 'Trò chuyện thử', en: 'Try a conversation' },
  'landing.stepTwoDescription': {
    vi: 'Chat hoặc gọi thoại trong thời gian giới hạn — đủ để cảm nhận trước khi quyết định.',
    en: 'Chat or make a time-limited call — enough to get a feel before deciding.',
  },
  'landing.stepThreeTitle': { vi: 'Cả hai cùng thích', en: 'Both choose like' },
  'landing.stepThreeDescription': {
    vi: 'Nếu cả hai chọn "Thích", hồ sơ thật được mở khoá và các bạn chính thức thành bạn bè.',
    en: 'When you both choose like, real profiles unlock and you become friends.',
  },
  'landing.statMatches': { vi: 'lượt ghép mỗi ngày', en: 'matches per day' },
  'landing.statUsers': { vi: 'người dùng', en: 'users' },
  'landing.statRatings': { vi: 'đánh giá người dùng', en: 'user rating' },
  'landing.statLocations': { vi: 'tỉnh thành', en: 'provinces and cities' },
  'landing.ctaTitle': {
    vi: 'Sẵn sàng ẩn danh làm quen?',
    en: 'Ready to meet anonymously?',
  },
  'landing.ctaDescription': {
    vi: 'Miễn phí tạo hồ sơ. Không cần thẻ thanh toán.',
    en: 'Create a profile for free. No credit card needed.',
  },
  'landing.ctaTitleAuthenticated': {
    vi: 'Sẵn sàng khám phá Litmatch?',
    en: 'Ready to explore Litmatch?',
  },
  'landing.ctaDescriptionAuthenticated': {
    vi: 'Mở trang chủ để tiếp tục kết nối và khám phá người mới.',
    en: 'Open Home to continue connecting and discover new people.',
  },
  'nav.home': { vi: 'Trang chủ', en: 'Home' },
  'nav.discovery': { vi: 'Quanh đây', en: 'Nearby' },
  'nav.matching': { vi: 'Ghép đôi', en: 'Matching' },
  'nav.video': { vi: 'Video', en: 'Video' },
  'nav.party': { vi: 'Party', en: 'Party' },
  'nav.feed': { vi: 'Bảng tin', en: 'Feed' },
  'nav.friends': { vi: 'Tin nhắn', en: 'Messages' },
  'nav.profile': { vi: 'Cá nhân', en: 'Profile' },
  'nav.more': { vi: 'Thêm', en: 'More' },
  'nav.primary': { vi: 'Điều hướng chính', en: 'Primary navigation' },
  'nav.mobile': {
    vi: 'Điều hướng chính (di động)',
    en: 'Primary navigation (mobile)',
  },
  'more.profile.description': {
    vi: 'Xem và chỉnh sửa hồ sơ',
    en: 'View and edit your profile',
  },
  'more.premium.title': { vi: 'Nâng cấp Premium', en: 'Upgrade to Premium' },
  'more.premium.description': {
    vi: 'Xem ai đã thích bạn, vuốt không giới hạn',
    en: 'See who likes you and swipe without limits',
  },
  'more.section.explore': { vi: 'Khám phá', en: 'Explore' },
  'more.explore.discovery.label': { vi: 'Quanh đây', en: 'Nearby' },
  'more.explore.discovery.description': {
    vi: 'Tìm người gần bạn',
    en: 'Find people nearby',
  },
  'more.explore.video.label': { vi: 'Video', en: 'Video' },
  'more.explore.video.description': {
    vi: 'Lướt khoảnh khắc ngắn',
    en: 'Browse short moments',
  },
  'more.explore.party.label': { vi: 'Party', en: 'Party' },
  'more.explore.party.description': {
    vi: 'Vào phòng trò chuyện',
    en: 'Enter a voice room',
  },
  'more.explore.feed.label': { vi: 'Bảng tin', en: 'Feed' },
  'more.explore.feed.description': {
    vi: 'Xem câu chuyện mới',
    en: 'See new stories',
  },
  'more.section.account': { vi: 'Tài khoản', en: 'Account' },
  'more.account.theme': {
    vi: 'Giao diện sáng/tối',
    en: 'Light / dark theme',
  },
  'more.account.language': { vi: 'Ngôn ngữ', en: 'Language' },
  'more.account.editProfile': { vi: 'Chỉnh sửa hồ sơ', en: 'Edit profile' },
  'more.account.privacy': {
    vi: 'Cài đặt và quyền riêng tư',
    en: 'Settings and privacy',
  },
  'more.section.support': { vi: 'Hỗ trợ', en: 'Support' },
  'more.support.inviteFriends': { vi: 'Mời bạn bè', en: 'Invite friends' },
  'more.support.helpCenter': {
    vi: 'Trung tâm trợ giúp',
    en: 'Help center',
  },
  'more.logout': { vi: 'Đăng xuất', en: 'Log out' },
  'more.invite.shareTitle': { vi: 'Litmatch', en: 'Litmatch' },
  'more.invite.shareText': {
    vi: 'Tham gia Litmatch cùng mình',
    en: 'Join me on Litmatch',
  },
  'more.invite.sharing': {
    vi: 'Đang mở bảng chia sẻ…',
    en: 'Opening share options…',
  },
  'more.invite.copied': {
    vi: 'Đã sao chép liên kết mời',
    en: 'Invite link copied',
  },
  'more.invite.copyFailed': {
    vi: 'Không thể sao chép liên kết. Vui lòng thử lại.',
    en: 'Could not copy the invite link. Please try again.',
  },
  'theme.toLight': {
    vi: 'Chuyển sang giao diện sáng',
    en: 'Switch to light theme',
  },
  'theme.toDark': {
    vi: 'Chuyển sang giao diện tối',
    en: 'Switch to dark theme',
  },
  'profile.eyebrow': { vi: 'Hồ sơ của bạn', en: 'Your profile' },
  'profile.loading': { vi: 'Đang tải hồ sơ…', en: 'Loading profile…' },
  'profile.error': {
    vi: 'Có lỗi xảy ra, thử lại.',
    en: 'Something went wrong. Please try again.',
  },
  'profile.empty': {
    vi: 'Không có dữ liệu hồ sơ.',
    en: 'No profile data is available.',
  },
  'profile.changeAvatar': { vi: 'Đổi ảnh đại diện', en: 'Change avatar' },
  'profile.guestNotice': {
    vi: 'Tài khoản khách — một số tính năng bị giới hạn.',
    en: 'Guest account — some features are limited.',
  },
  'profile.wallet': {
    vi: 'Ví Diamond & Giao dịch',
    en: 'Diamond wallet & transactions',
  },
  'profile.vip': { vi: 'Nâng cấp VIP', en: 'Upgrade to VIP' },
  'profile.edit': {
    vi: 'Chỉnh sửa Avatar & hồ sơ',
    en: 'Edit avatar & profile',
  },
  'profile.language': { vi: 'Ngôn ngữ', en: 'Language' },
  'profile.privacy': {
    vi: 'Quyền riêng tư, chặn & báo cáo',
    en: 'Privacy, blocks & reports',
  },
  'profile.help': { vi: 'Trợ giúp & phản hồi', en: 'Help & feedback' },
  'profile.logout': { vi: 'Đăng xuất', en: 'Log out' },
  'profile.friends': { vi: 'Bạn bè', en: 'Friends' },
  'profile.posts': { vi: 'Bài viết của bạn', en: 'Your posts' },
  'profile.viewFeed': { vi: 'Xem trên Bảng tin →', en: 'View in Feed →' },
  'profile.postImageAlt': { vi: 'Ảnh bài viết', en: 'Post image' },
  'home.welcome': { vi: 'Rất vui gặp lại 👋', en: 'Good to see you again 👋' },
  'home.heroLineOne': {
    vi: 'Trò chuyện chân thành,',
    en: 'Have genuine conversations,',
  },
  'home.heroLineTwo': {
    vi: 'tìm thấy người đồng hành.',
    en: 'find your kind of person.',
  },
  'home.heroDescription': {
    vi: 'Gặp người ở gần hoặc bắt đầu bằng Voice Match. Cùng tìm hiểu nghiêm túc, tôn trọng ranh giới và hướng tới một mối quan hệ lâu dài.',
    en: 'Meet someone nearby or start with Voice Match. Get to know each other thoughtfully, respect boundaries, and build something lasting.',
  },
  'home.nearbyAction': { vi: 'Tìm người quanh đây', en: 'Find people nearby' },
  'home.voiceAction': { vi: 'Bắt đầu Voice Match', en: 'Start Voice Match' },
  'home.heroFooter': {
    vi: 'Chủ động kết nối · tôn trọng riêng tư · ưu tiên an toàn',
    en: 'Connect with intent · respect privacy · put safety first',
  },
  'home.sampleProfile': { vi: 'Hồ sơ minh hoạ', en: 'Sample profile' },
  'home.voicePriority': {
    vi: 'Ưu tiên kết nối bằng voice',
    en: 'Voice-first connection',
  },
  'home.sampleLocation': {
    vi: 'Đà Nẵng · tìm mối quan hệ lâu dài',
    en: 'Da Nang · looking for a lasting relationship',
  },
  'home.sampleBio': {
    vi: 'Thích những cuộc trò chuyện tử tế và những chuyến đi chậm.',
    en: 'Enjoys thoughtful conversations and slow journeys.',
  },
  'home.sampleTagTravel': { vi: 'Du lịch', en: 'Travel' },
  'home.sampleTagCoffee': { vi: 'Cà phê', en: 'Coffee' },
  'home.sampleTagBooks': { vi: 'Đọc sách', en: 'Books' },
  'home.quickEyebrow': { vi: 'Truy cập nhanh', en: 'Quick access' },
  'home.quickHeading': {
    vi: 'Tiếp tục khám phá Litmatch',
    en: 'Keep exploring Litmatch',
  },
  'home.quickCount': { vi: '4 lựa chọn', en: '4 options' },
  'home.quickPartyDescription': {
    vi: 'Vào phòng trò chuyện',
    en: 'Join a voice room',
  },
  'home.quickFeedDescription': {
    vi: 'Xem câu chuyện mới',
    en: 'See new stories',
  },
  'home.quickMessagesDescription': {
    vi: 'Trò chuyện cùng bạn bè',
    en: 'Chat with friends',
  },
  'home.quickVideoDescription': {
    vi: 'Lướt khoảnh khắc ngắn',
    en: 'Browse short moments',
  },
  'home.matchEyebrow': { vi: 'Bắt đầu một cuộc gặp', en: 'Start a connection' },
  'home.matchHeading': {
    vi: 'Chọn nhịp kết nối phù hợp',
    en: 'Choose a connection that feels right',
  },
  'home.matchAction': { vi: 'Xem ghép đôi', en: 'View matching' },
  'home.modeSoul': {
    vi: 'Trò chuyện trước, hiểu nhau sau',
    en: 'Talk first, understand later',
  },
  'home.modeVoice': {
    vi: 'Nghe giọng thật, nói chuyện chân thành',
    en: 'Hear a real voice, talk genuinely',
  },
  'home.modeMovie': {
    vi: 'Xem chung, chat cùng lúc',
    en: 'Watch together, chat together',
  },
  'home.modePalm': {
    vi: 'Một chút bói vui tình yêu',
    en: 'A little love fortune fun',
  },
  'home.roomsEyebrow': { vi: 'Đang diễn ra', en: 'Happening now' },
  'home.roomsHeading': { vi: 'Phòng được quan tâm', en: 'Popular rooms' },
  'home.viewAll': { vi: 'Xem tất cả', en: 'View all' },
  'home.roomListeners': { vi: 'người trong phòng', en: 'people in the room' },
  'home.roomsLoadError': {
    vi: 'Không tải được danh sách phòng.',
    en: 'Unable to load the room list.',
  },
  'home.retry': { vi: 'Thử lại', en: 'Try again' },
  'home.roomsEmpty': {
    vi: 'Chưa có Party Room nào đang hoạt động.',
    en: 'There are no active Party Rooms yet.',
  },
  'home.discoveryEyebrow': { vi: 'Khám phá', en: 'Discover' },
  'home.discoveryHeading': {
    vi: 'Tìm người ở gần, cùng mong muốn gắn bó.',
    en: 'Find people nearby who want the same kind of connection.',
  },
  'home.discoveryDescription': {
    vi: 'Tìm hiểu hồ sơ theo nhịp riêng, rồi chủ động kết nối khi cả hai có chung điều đang tìm kiếm.',
    en: 'Explore profiles at your own pace, then reach out when you are looking for the same thing.',
  },
  'language.vietnamese': { vi: 'Tiếng Việt', en: 'Vietnamese' },
  'language.english': { vi: 'English', en: 'English' },
  'common.loading': { vi: 'Đang tải…', en: 'Loading…' },
  'common.retry': { vi: 'Thử lại', en: 'Try again' },
  'common.close': { vi: 'Đóng', en: 'Close' },
  'common.cancel': { vi: 'Huỷ', en: 'Cancel' },
  'common.confirm': { vi: 'Xác nhận', en: 'Confirm' },
  'common.back': { vi: 'Quay lại', en: 'Go back' },
  'common.send': { vi: 'Gửi', en: 'Send' },
  'common.search': { vi: 'Tìm kiếm', en: 'Search' },
  'common.viewMore': { vi: 'Xem thêm', en: 'View more' },
  'common.noResults': {
    vi: 'Không có kết quả phù hợp.',
    en: 'No matching results.',
  },
  'common.somethingWentWrong': {
    vi: 'Có lỗi xảy ra, vui lòng thử lại.',
    en: 'Something went wrong. Please try again.',
  },
  'common.unknownError': {
    vi: 'Sự cố không xác định. Vui lòng tải lại.',
    en: 'An unknown issue occurred. Please reload and try again.',
  },
  'common.profileFor': {
    vi: (params: { name: string }) => `Xem hồ sơ ${params.name}`,
    en: (params: { name: string }) => `View ${params.name}'s profile`,
  },
  'common.walletBalance': {
    vi: (params: { balance: number }) =>
      `Mở ví, số dư ${params.balance} Diamond`,
    en: (params: { balance: number }) =>
      `Open wallet, ${params.balance} Diamonds`,
  },
  'common.relative.justNow': { vi: 'Vừa xong', en: 'Just now' },
  'common.relative.minutes': {
    vi: (params: { count: number }) => `${params.count} phút trước`,
    en: (params: { count: number }) => `${params.count}m ago`,
  },
  'common.relative.hours': {
    vi: (params: { count: number }) => `${params.count} giờ trước`,
    en: (params: { count: number }) => `${params.count}h ago`,
  },
  'common.relative.yesterday': { vi: 'Hôm qua', en: 'Yesterday' },
  'common.relative.days': {
    vi: (params: { count: number }) => `${params.count} ngày trước`,
    en: (params: { count: number }) => `${params.count}d ago`,
  },
  'auth.login': { vi: 'Đăng nhập', en: 'Sign in' },
  'auth.welcome': { vi: 'Chào mừng đến Litmatch', en: 'Welcome to Litmatch' },
  'auth.welcomeDescription': {
    vi: 'Ẩn danh, an toàn, chỉ mất 30 giây',
    en: 'Anonymous, safe, and takes only 30 seconds',
  },
  'auth.legalNotice': {
    vi: 'Bằng việc tiếp tục, bạn xác nhận đã đủ 18 tuổi và đồng ý với Điều khoản dịch vụ & Chính sách riêng tư.',
    en: 'By continuing, you confirm that you are 18 or older and agree to the Terms of Service & Privacy Policy.',
  },
  'auth.checkingProviders': {
    vi: 'Đang kiểm tra phương thức đăng nhập…',
    en: 'Checking available sign-in methods…',
  },
  'auth.guestPending': { vi: 'Đang vào…', en: 'Joining…' },
  'auth.guest': {
    vi: 'Dùng thử với tài khoản khách →',
    en: 'Try with a guest account →',
  },
  'auth.phoneLabel': { vi: 'Số điện thoại', en: 'Phone number' },
  'auth.phoneInvalid': {
    vi: 'Số điện thoại không hợp lệ',
    en: 'Invalid phone number',
  },
  'auth.otpInvalid': {
    vi: 'Mã OTP gồm 6 chữ số',
    en: 'The OTP must contain 6 digits',
  },
  'auth.requestOtpPending': { vi: 'Đang gửi…', en: 'Sending…' },
  'auth.requestOtp': { vi: 'Gửi mã OTP', en: 'Send OTP' },
  'auth.continueWith': { vi: 'hoặc tiếp tục với', en: 'or continue with' },
  'auth.signInProvider': {
    vi: (params: { provider: string }) => `Đăng nhập với ${params.provider}`,
    en: (params: { provider: string }) => `Sign in with ${params.provider}`,
  },
  'auth.otpInstruction': {
    vi: (params: { phone: string }) =>
      `Nhập mã gồm 6 số vừa gửi tới ${params.phone}`,
    en: (params: { phone: string }) =>
      `Enter the 6-digit code sent to ${params.phone}`,
  },
  'auth.otpDigit': {
    vi: (params: { index: number; phone: string }) =>
      `Chữ số ${params.index} trên 6 của mã OTP đã gửi tới ${params.phone}`,
    en: (params: { index: number; phone: string }) =>
      `Digit ${params.index} of 6 from the OTP sent to ${params.phone}`,
  },
  'auth.verifyPending': { vi: 'Đang xác minh…', en: 'Verifying…' },
  'auth.verify': { vi: 'Đăng nhập', en: 'Sign in' },
  'auth.resend': { vi: 'Gửi lại mã', en: 'Resend code' },
  'auth.resendWithCooldown': {
    vi: (params: { seconds: number }) => `Gửi lại mã (${params.seconds}s)`,
    en: (params: { seconds: number }) => `Resend code (${params.seconds}s)`,
  },
  'auth.changePhone': {
    vi: '← Đổi số điện thoại',
    en: '← Change phone number',
  },
  'auth.providerDisabled': {
    vi: (params: { provider: string }) =>
      `Đăng nhập ${params.provider} chưa được cấu hình.`,
    en: (params: { provider: string }) =>
      `${params.provider} sign-in is not configured yet.`,
  },
  'auth.phoneDisabled': {
    vi: 'Đăng nhập bằng số điện thoại chưa được bật.',
    en: 'Phone sign-in is not enabled yet.',
  },
  'auth.guestAvailable': {
    vi: 'Có thể dùng tài khoản khách.',
    en: 'Guest accounts are available.',
  },
  'auth.otpUnavailable': {
    vi: 'API chưa trả về mã OTP hợp lệ. Hãy thử lại sau khi máy chủ sẵn sàng.',
    en: 'The API did not return a valid OTP. Please try again when the server is ready.',
  },
  'auth.providerUnavailable': {
    vi: 'Provider chưa sẵn sàng.',
    en: 'This sign-in provider is not ready yet.',
  },
  'auth.sessionChecking': {
    vi: 'Đang kiểm tra phiên đăng nhập…',
    en: 'Checking your sign-in session…',
  },
  'comments.loading': { vi: 'Đang tải bình luận…', en: 'Loading comments…' },
  'comments.empty': { vi: 'Chưa có bình luận nào.', en: 'No comments yet.' },
  'comments.loadMore': { vi: 'Xem thêm bình luận', en: 'Load more comments' },
  'comments.loadMorePending': { vi: 'Đang tải…', en: 'Loading…' },
  'status.notFoundTitle': { vi: 'Không tìm thấy trang', en: 'Page not found' },
  'status.notFoundDescription': {
    vi: 'Đường dẫn không tồn tại hoặc đã bị gỡ.',
    en: 'This page does not exist or has been removed.',
  },
  'status.goHome': { vi: 'Về trang chủ', en: 'Go home' },
  'status.errorTitle': { vi: 'Có lỗi xảy ra', en: 'Something went wrong' },
  'status.retry': { vi: 'Thử lại', en: 'Try again' },
  'status.unknownError': {
    vi: 'Sự cố không xác định. Thử tải lại.',
    en: 'An unknown issue occurred. Try reloading.',
  },
  'privacy.title': {
    vi: 'Quyền riêng tư, chặn & báo cáo',
    en: 'Privacy, blocks & reports',
  },
  'help.title': { vi: 'Trợ giúp & phản hồi', en: 'Help & feedback' },
  'app.back': { vi: 'Quay lại', en: 'Go back' },
  'app.videoShort': { vi: 'Video ngắn', en: 'Short videos' },
  'app.wallet': { vi: 'Ví & VIP', en: 'Wallet & VIP' },
  'app.walletEyebrow': { vi: 'Số dư & gói VIP', en: 'Balance & VIP plans' },
  'app.partyEyebrow': { vi: 'Trò chuyện nhóm', en: 'Group conversations' },
  'app.room': { vi: 'Phòng nhóm', en: 'Group room' },
  'app.feed': { vi: 'Bảng tin', en: 'Feed' },
  'app.post': { vi: 'Bài viết', en: 'Post' },
  'app.profile': { vi: 'Hồ sơ', en: 'Profile' },
  'app.publicProfile': { vi: 'Hồ sơ người dùng', en: 'User profile' },
  'app.messages': { vi: 'Tin nhắn', en: 'Messages' },
  'app.more': { vi: 'Thêm', en: 'More' },
  'app.matching': { vi: 'Ghép đôi', en: 'Matching' },
  'app.conversation': { vi: 'Trò chuyện', en: 'Conversation' },
  'app.conversationLoading': {
    vi: 'Đang tải trò chuyện…',
    en: 'Loading conversation…',
  },
  'app.conversationError': {
    vi: 'Không tải được trò chuyện.',
    en: 'Unable to load conversation.',
  },
  'app.watchTogether': { vi: 'Đang xem chung', en: 'Watching together' },
  'friends.search': { vi: 'Tìm kiếm bạn bè', en: 'Search friends' },
  'friends.searchPlaceholder': { vi: 'Tìm theo tên…', en: 'Search by name…' },
  'friends.loading': {
    vi: 'Đang tải danh sách bạn bè…',
    en: 'Loading your friends…',
  },
  'friends.emptyTitle': {
    vi: 'Bạn chưa có kết nối nào',
    en: 'You have no connections yet',
  },
  'friends.emptyDescription': {
    vi: 'Hãy bắt đầu từ Ghép đôi hoặc Quanh đây.',
    en: 'Start with Matching or Nearby.',
  },
  'friends.matching': { vi: 'Ghép đôi', en: 'Matching' },
  'friends.nearby': { vi: 'Quanh đây', en: 'Nearby' },
  'friends.noResults': {
    vi: 'Không tìm thấy người bạn nào.',
    en: 'No friends found.',
  },
  'friends.sectionFriends': { vi: 'Kết nối', en: 'Connections' },
  'friends.sectionConversations': { vi: 'Tin nhắn', en: 'Messages' },
  'friends.unread': {
    vi: (params: { count: number }) => `${params.count} chưa đọc`,
    en: (params: { count: number }) => `${params.count} unread`,
  },
  'friends.muted': { vi: 'Đã tắt thông báo', en: 'Notifications muted' },
  'friends.photo': { vi: '📷 Ảnh', en: '📷 Photo' },
  'friends.noMessages': { vi: 'Chưa có tin nhắn', en: 'No messages yet' },
  'friends.newConversation': { vi: 'Mới', en: 'New' },
  'friends.unreadMessages': {
    vi: (params: { count: number }) => `${params.count} tin nhắn chưa đọc`,
    en: (params: { count: number }) => `${params.count} unread messages`,
  },
  'notifications.title': { vi: 'Thông báo', en: 'Notifications' },
  'notifications.unread': {
    vi: (params: { count: number }) => `Thông báo, ${params.count} chưa đọc`,
    en: (params: { count: number }) => `Notifications, ${params.count} unread`,
  },
  'notifications.loadingError': {
    vi: 'Không tải được thông báo.',
    en: 'Unable to load notifications.',
  },
  'notifications.empty': {
    vi: 'Chưa có thông báo nào.',
    en: 'No notifications yet.',
  },
  'notifications.close': { vi: 'Đóng thông báo', en: 'Close notifications' },
  'notifications.enableBrowserPush': {
    vi: 'Bật thông báo trên trình duyệt',
    en: 'Enable browser notifications',
  },
  'notifications.browserPushEnabled': {
    vi: 'Thông báo trình duyệt đang bật',
    en: 'Browser notifications are on',
  },
  'notifications.browserPushDenied': {
    vi: 'Thông báo đang bị chặn trong cài đặt trình duyệt',
    en: 'Notifications are blocked in browser settings',
  },
  'wallet.loading': { vi: 'Đang tải ví…', en: 'Loading wallet…' },
  'wallet.noData': {
    vi: 'Không có dữ liệu ví.',
    en: 'No wallet data is available.',
  },
  'wallet.balance': { vi: 'Số dư kim cương', en: 'Diamond balance' },
  'wallet.expires': {
    vi: (params: { tier: string; date: string }) =>
      `VIP ${params.tier} — hết hạn ${params.date}`,
    en: (params: { tier: string; date: string }) =>
      `VIP ${params.tier} — expires ${params.date}`,
  },
  'wallet.topUp': { vi: 'Nạp Diamond', en: 'Top up Diamonds' },
  'wallet.upgradeVip': { vi: 'Nâng cấp VIP', en: 'Upgrade to VIP' },
  'wallet.paymentChecking': {
    vi: 'Đang kiểm tra thanh toán…',
    en: 'Checking payment…',
  },
  'wallet.paymentRetry': { vi: 'Kiểm tra lại', en: 'Check again' },
  'wallet.vipTitle': {
    vi: 'Ưu tiên mọi lúc',
    en: 'Priority, whenever you need it',
  },
  'wallet.vipDescription': {
    vi: 'Ghép nhanh hơn, thấy ai đã thích bạn, và nhiều đặc quyền chỉ dành cho VIP.',
    en: 'Match faster, see who likes you, and unlock perks reserved for VIP members.',
  },
  'wallet.choosePlan': { vi: 'Chọn gói VIP', en: 'Choose a VIP plan' },
  'wallet.loadingPlans': { vi: 'Đang tải bảng giá…', en: 'Loading plans…' },
  'wallet.noPlans': {
    vi: 'Chưa có gói VIP nào đang bán.',
    en: 'No VIP plans are currently available.',
  },
  'wallet.confirmUpgrade': {
    vi: (params: { tier: string }) => `Nâng cấp ${params.tier}?`,
    en: (params: { tier: string }) => `Upgrade to ${params.tier}?`,
  },
  'wallet.confirmPlan': {
    vi: (params: { days: number; price: number }) =>
      `Gói ${params.days} ngày có giá ${params.price} Diamond. Thời hạn sẽ được cộng dồn nếu bạn đang có VIP.`,
    en: (params: { days: number; price: number }) =>
      `The ${params.days}-day plan costs ${params.price} Diamonds. Time will be added to your current VIP period.`,
  },
  'wallet.confirmPurchase': {
    vi: (params: { price: number }) => `Mua với ${params.price} Diamond`,
    en: (params: { price: number }) => `Buy for ${params.price} Diamonds`,
  },
  'wallet.upgradedUntil': {
    vi: (params: { tier: string; date: string }) =>
      `Đã nâng cấp ${params.tier} đến ${params.date}`,
    en: (params: { tier: string; date: string }) =>
      `Upgraded to ${params.tier} until ${params.date}`,
  },
  'wallet.benefit.fastTitle': {
    vi: 'Ưu tiên ghép nhanh',
    en: 'Priority matching',
  },
  'wallet.benefit.fastDescription': {
    vi: 'Vào hàng chờ Soul & Voice Match trước tất cả',
    en: 'Join Soul & Voice Match queues ahead of everyone else',
  },
  'wallet.benefit.likesTitle': {
    vi: 'Xem ai đã thích bạn',
    en: 'See who likes you',
  },
  'wallet.benefit.likesDescription': {
    vi: 'Mở khoá danh sách lượt thích ở Khám phá',
    en: 'Unlock your likes list in Nearby',
  },
  'wallet.benefit.voiceTitle': {
    vi: 'Voice Match không giới hạn',
    en: 'Unlimited Voice Match',
  },
  'wallet.benefit.voiceDescription': {
    vi: 'Bỏ giới hạn thời lượng mỗi cuộc gọi',
    en: 'Remove the time limit from every call',
  },
  'wallet.benefit.badgeTitle': {
    vi: 'Huy hiệu VIP trên hồ sơ',
    en: 'VIP profile badge',
  },
  'wallet.benefit.badgeDescription': {
    vi: 'Nổi bật hơn ở Feed, Khám phá & Party Room',
    en: 'Stand out in Feed, Nearby, and Party Rooms',
  },
  'wallet.planLabel': {
    vi: (params: { tier: string; days: number }) =>
      `${params.tier} · ${params.days} ngày`,
    en: (params: { tier: string; days: number }) =>
      `${params.tier} · ${params.days} days`,
  },
  'wallet.planPrice': {
    vi: (params: { price: number }) => `${params.price} Diamond`,
    en: (params: { price: number }) => `${params.price} Diamonds`,
  },
  'wallet.buyPlan': {
    vi: (params: { tier: string; days: number; price: number }) =>
      `Mua gói ${params.tier} ${params.days} ngày với ${params.price} Diamond`,
    en: (params: { tier: string; days: number; price: number }) =>
      `Buy ${params.tier} for ${params.days} days with ${params.price} Diamonds`,
  },
} as const;

export type MessageKey = keyof typeof MESSAGES;

export type TranslationParams = Record<string, string | number>;
export type Translator = <K extends MessageKey>(
  key: K,
  params?: TranslationParams,
) => string;

export function translate<K extends MessageKey>(
  locale: Locale,
  key: K,
  params?: TranslationParams,
): string {
  const message = MESSAGES[key][locale];
  return typeof message === 'function'
    ? (message as (params: TranslationParams) => string)(params ?? {})
    : message;
}

export function useTranslation(): Translator {
  const locale = useLocale();
  return (key, params) => translate(locale, key, params);
}
