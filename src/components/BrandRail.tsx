'use client';

interface BrandRailProps {
  activeBrand: 'TBS' | 'RD';
}

export default function BrandRail({ activeBrand }: BrandRailProps) {
  return (
    <div className="w-[52px] bg-inverse flex flex-col items-center py-3 gap-2 h-screen">
      {/* Monogram */}
      <div className="w-9 h-9 bg-brand rounded-full flex items-center justify-center mb-2 flex-shrink-0">
        <span className="text-text-inverse font-bold text-base">A</span>
      </div>

      {/* TBS Brand */}
      <div className="flex flex-col items-center gap-0.5">
        <button
          className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
            activeBrand === 'TBS'
              ? 'bg-elevated text-text-primary shadow-lg'
              : 'text-text-muted hover:bg-white/10'
          }`}
          title="The Bride Side"
        >
          TBS
        </button>
        <span className="text-text-muted text-[9px]">Bride</span>
      </div>

      {/* RD Brand — Phase 2 */}
      <div className="flex flex-col items-center gap-0.5 opacity-40 cursor-not-allowed">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold text-text-muted"
          title="Revaah Decor — Coming Soon"
        >
          RD
        </div>
        <span className="text-text-muted text-[9px]">Revaah</span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Add brand (non-functional) */}
      <button
        className="w-9 h-9 rounded-lg flex items-center justify-center text-text-muted hover:bg-white/10 text-lg"
        title="Add brand"
        disabled
      >
        +
      </button>
    </div>
  );
}
