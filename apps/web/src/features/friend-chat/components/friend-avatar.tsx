/**
 * v1: avatar layered thật (GET /avatar/users/:id) chưa có seed data + imageUrl là host
 * ngoài chưa biết trước (không cấu hình next/image remotePatterns cố định được) — dùng
 * placeholder chữ cái đầu + màu nền deterministic theo userId. Nâng cấp lên AvatarStack
 * thật khi có feature thứ 2 cần (Party Room, Feed) và có seed data thật để verify.
 */
export function hashToHue(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

export function FriendAvatar({
  userId,
  nickname,
  size = 40,
}: {
  userId: string;
  nickname: string;
  size?: number;
}) {
  const hue = hashToHue(userId);
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        backgroundColor: `hsl(${hue}, 60%, 45%)`,
        width: size,
        height: size,
        fontSize: size * 0.4,
      }}
      aria-hidden="true"
    >
      {nickname.charAt(0).toUpperCase()}
    </div>
  );
}
