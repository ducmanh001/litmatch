import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center">
      <h1 className="text-xl font-semibold">Không tìm thấy trang</h1>
      <p className="text-muted-foreground">
        Đường dẫn không tồn tại hoặc đã bị gỡ.
      </p>
      <Link href="/" className="text-primary hover:underline">
        Về trang chủ
      </Link>
    </main>
  );
}
