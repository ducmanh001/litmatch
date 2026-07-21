export const DEMO_PHONE_LOCAL = '912345678';
export const ADMIN_PHONE_LOCAL = '900222001';
export const HANOI_LAT = 21.0285;
export const HANOI_LON = 105.8542;

const INTERESTS_POOL = [
  'du lịch',
  'âm nhạc',
  'ẩm thực',
  'phim ảnh',
  'thể thao',
  'đọc sách',
  'cà phê',
  'photography',
  'gaming',
  'nuôi pet',
];

export function profileExtras(index, gender) {
  const birthYear = 1993 + (index % 10);
  const birthMonth = (index % 9) + 1;
  const seekingGender =
    gender === 'male' ? 'female' : gender === 'female' ? 'male' : 'any';
  return {
    birthDate: `${birthYear}-0${birthMonth}-15`,
    region: 'VN',
    interests: [
      INTERESTS_POOL[index % INTERESTS_POOL.length],
      INTERESTS_POOL[(index + 3) % INTERESTS_POOL.length],
      INTERESTS_POOL[(index + 6) % INTERESTS_POOL.length],
    ],
    seekingGender,
    seekingAgeMin: 20,
    seekingAgeMax: 40,
  };
}

export function canonicalPair(a, b) {
  return a < b ? [a, b] : [b, a];
}

// deviceId ổn định giúp re-run đăng nhập lại đúng guest thay vì tạo bot mới.
export const BOTS = [
  { key: 'chi', nickname: 'Chi', gender: 'female' },
  { key: 'minh', nickname: 'Minh', gender: 'male' },
  { key: 'linh', nickname: 'Linh', gender: 'female' },
  { key: 'khang', nickname: 'Khang', gender: 'male' },
  { key: 'lan', nickname: 'Lan', gender: 'female' },
  { key: 'khoa', nickname: 'Khoa', gender: 'male' },
  { key: 'vy', nickname: 'Vy', gender: 'female' },
  { key: 'dat', nickname: 'Đạt', gender: 'male' },
  { key: 'tuan', nickname: 'Tuấn', gender: 'male' },
  { key: 'ngoc', nickname: 'Ngọc', gender: 'female' },
  { key: 'spam', nickname: 'SpamBot99', gender: 'other' },
];

export const ROOMS = [
  { bot: 'lan', title: 'Tâm sự đêm khuya 🌙', category: 'talk' },
  { bot: 'khoa', title: 'Hát cho nhau nghe 🎤', category: 'sing' },
  { bot: 'vy', title: 'Làm quen Sài Gòn 👋', category: 'friend' },
  { bot: 'dat', title: 'Học tiếng Anh cùng nhau 📚', category: 'study' },
  { bot: 'tuan', title: 'Góc thư giãn lofi 🎧', category: 'other' },
];

export const ROOM_JOINERS = {
  lan: ['ngoc', 'disc_mai'],
  khoa: ['chi', 'disc_huy'],
  vy: ['minh', 'disc_trang'],
  dat: ['linh', 'disc_quang'],
  tuan: ['khang', 'disc_yen'],
};

export const SAMPLE_VIDEOS = [
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  'https://www.w3schools.com/html/mov_bbb.mp4',
  'https://samplelib.com/mp4/sample-10s.mp4',
];

export const FRIEND_PAIRS = [
  ['chi', 'minh'],
  ['linh', 'khang'],
  ['lan', 'khoa'],
  ['vy', 'dat'],
  ['tuan', 'ngoc'],
  ['chi', 'linh'],
];

export const DISCOVERY_BOTS = [
  {
    key: 'disc_mai',
    phoneLocal: '900111001',
    nickname: 'Mai',
    gender: 'female',
  },
  { key: 'disc_huy', phoneLocal: '900111002', nickname: 'Huy', gender: 'male' },
  {
    key: 'disc_trang',
    phoneLocal: '900111003',
    nickname: 'Trang',
    gender: 'female',
  },
  {
    key: 'disc_quang',
    phoneLocal: '900111004',
    nickname: 'Quang',
    gender: 'male',
  },
  {
    key: 'disc_yen',
    phoneLocal: '900111005',
    nickname: 'Yến',
    gender: 'female',
  },
];

export const STAFF = [
  {
    key: 'admin_an',
    phoneLocal: ADMIN_PHONE_LOCAL,
    nickname: 'Admin An',
    role: 'admin',
  },
  {
    key: 'admin_binh',
    phoneLocal: '900222002',
    nickname: 'Admin Bình',
    role: 'admin',
  },
  {
    key: 'mod_cuong',
    phoneLocal: '900222003',
    nickname: 'Mod Cường',
    role: 'moderator',
  },
  {
    key: 'mod_dung',
    phoneLocal: '900222004',
    nickname: 'Mod Dung',
    role: 'moderator',
  },
];

export const REPORT_REASONS = [
  'harassment',
  'spam',
  'underage',
  'inappropriate_content',
  'other',
];

export const POST_TOPICS = [
  { content: 'Cuối tuần này ai đi cafe acoustic không? ☕🎶', img: 'coffee' },
  { content: 'Hoàng hôn hôm nay ở Hồ Tây đẹp quá trời 🌅', img: 'sunset' },
  { content: 'Vừa nấu xong nồi bún bò, tự tin 9 điểm 🍜', img: 'food' },
  {
    content: 'Sách hay tháng này: "Rừng Na Uy" — ai đọc chưa? 📚',
    img: 'book',
  },
  { content: 'Team mèo hay team chó điểm danh 🐱🐶', img: 'pet' },
  { content: 'Chạy bộ 5km sáng nay, cảm giác thật đã 🏃‍♀️', img: 'run' },
  { content: 'Playlist lofi cho tối thứ 6 chill 🎧', img: 'music' },
  { content: 'Du lịch Đà Lạt tháng sau, xin tips! ⛰️', img: 'dalat' },
];

export const POST_COMMENTS = [
  'Hay quá, cho mình join với! 🙌',
  'Đồng ý luôn 😄',
  'Ảnh đẹp thế!',
  'Mình cũng thích cái này nè 💕',
  'Tuyệt vời, ủng hộ bạn!',
];

export const VIDEO_COMMENTS = [
  'Video xịn quá 🔥',
  'Xem đi xem lại mấy lần luôn 😆',
  'Ủng hộ bạn nha 💪',
  'Đỉnh thật sự!',
];
