import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="text-[64px] font-bold text-text-muted leading-none">404</div>
        <h1 className="text-lg font-semibold text-text-primary mt-3">Page not found</h1>
        <p className="text-sm text-text-secondary mt-2">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <div className="mt-6">
          <Link
            href="/inbox"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-brand text-text-inverse hover:bg-brand-hover shadow-sm transition-colors"
          >
            Back to inbox
          </Link>
        </div>
      </div>
    </div>
  );
}
