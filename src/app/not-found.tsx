import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="max-w-md text-center px-4">
        <h1 className="text-6xl font-black text-primary mb-4">404</h1>
        <h2 className="text-2xl font-bold mb-3">الصفحة غير موجودة</h2>
        <p className="text-muted-foreground mb-6">
          الصفحة التي تبحث عنها غير موجودة أو تم نقلها.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm"
        >
          العودة للرئيسية
        </Link>
      </div>
    </div>
  );
}
