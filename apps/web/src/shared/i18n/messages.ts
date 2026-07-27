import { useLocale } from './locale-store';

const MESSAGES = {
  'language.choose': { vi: 'Chọn ngôn ngữ', en: 'Choose language' },
  'language.close': { vi: 'Đóng chọn ngôn ngữ', en: 'Close language selector' },
  'language.list': { vi: 'Ngôn ngữ', en: 'Language' },
  'auth.checkingSession': {
    vi: 'Đang kiểm tra phiên đăng nhập…',
    en: 'Checking your sign-in session…',
  },
  'auth.otpCreated': {
    vi: 'Mã OTP của bạn là',
    en: 'Your OTP is',
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
    vi: 'Tham gia Litmatch cùng mình:',
    en: 'Join Litmatch with me:',
  },
  'more.invite.copied': {
    vi: 'Đã copy link mời bạn bè',
    en: 'Invite link copied',
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
} as const;

export type MessageKey = keyof typeof MESSAGES;

export function translate(locale: 'vi' | 'en', key: MessageKey): string {
  return MESSAGES[key][locale];
}

export function useTranslation(): (key: MessageKey) => string {
  const locale = useLocale();
  return (key) => translate(locale, key);
}
