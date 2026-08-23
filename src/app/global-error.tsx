"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="max-w-md text-center px-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">⚠️</span>
          </div>
          <h1 className="text-2xl font-bold mb-3">حدث خطأ غير متوقع</h1>
          <p className="text-muted-foreground mb-6">
            نعتذر عن هذا الخطأ. يرجى المحاولة مرة أخرى.
          </p>
          <button
            onClick={() => reset()}
            className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm"
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}
