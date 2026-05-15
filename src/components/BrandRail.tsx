'use client';

interface BrandRailProps {
  activeBrand: 'TBS' | 'RD';
}

export default function BrandRail({ activeBrand }: BrandRailProps) {
  return (
    <div className="w-[52px] bg-slate-900 flex flex-col items-center py-3 gap-2 h-screen">
      {/* Monogram */}
      <div className="w-9 h-9 bg-rose-600 rounded-full flex items-center justify-center mb-2 flex-shrink-0">
        <span className="text-white font-bold text-base">A</span>
      </div>

      {/* TBS Brand */}
      <div className="flex flex-col items-center gap-0.5">
        <button
          className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
            activeBrand === 'TBS'
              ? 'bg-white text-slate-900 shadow-lg'
              : 'text-slate-400 hover:bg-slate-800'
          }`}
          title="The Bride Side"
        >
          TBS
        </button>
        <span className="text-slate-500 text-[9px]">Bride</span>
      </div>

      {/* RD Brand — Phase 2 */}
      <div className="flex flex-col items-center gap-0.5 opacity-40 cursor-not-allowed">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold text-slate-500"
          title="Revaah Decor — Coming Soon"
        >
          RD
        </div>
        <span className="text-slate-500 text-[9px]">Revaah</span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Add brand (non-functional) */}
      <button
        className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-800 text-lg"
        title="Add brand"
        disabled
      >
        +
      </button>
    </div>
  );
}
