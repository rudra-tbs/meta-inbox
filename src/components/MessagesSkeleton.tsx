'use client';

// Skeleton rendered in ChatWindow while we fetch messages for a newly
// selected conversation. Three placeholder bubbles alternating sides
// so the layout looks intentional during the (usually <300ms) load.

export default function MessagesSkeleton() {
  return (
    <div className="space-y-3 py-2" aria-busy="true" aria-live="polite">
      <div className="flex justify-start">
        <div className="w-[55%] h-10 bg-muted/60 rounded-lg rounded-tl-sm animate-pulse" />
      </div>
      <div className="flex justify-end">
        <div className="w-[40%] h-9 bg-muted/40 rounded-lg rounded-tr-sm animate-pulse" />
      </div>
      <div className="flex justify-start">
        <div className="w-[60%] h-14 bg-muted/60 rounded-lg rounded-tl-sm animate-pulse" />
      </div>
    </div>
  );
}
