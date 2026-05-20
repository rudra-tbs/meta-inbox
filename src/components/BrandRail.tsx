'use client';

import { useRouter } from 'next/navigation';
import type { AppUser } from '@/types';
import AccountMenu from './AccountMenu';

interface Brand {
  id: string;
  name: string;
  color?: string | null;
  logo_url?: string | null;
}

interface BrandRailProps {
  brands: Brand[];
  activeBrand: string;
  onSelectBrand: (brandId: string) => void;
  currentUser: AppUser;
  loading?: boolean;
}

function shortLabel(brand: Brand): string {
  // Initials for multi-word names, else first 3 chars of single-word names.
  const parts = brand.name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return parts
      .map((p) => p[0])
      .join('')
      .slice(0, 3)
      .toUpperCase();
  }
  return brand.name.slice(0, 3).toUpperCase();
}

export default function BrandRail({
  brands,
  activeBrand,
  onSelectBrand,
  currentUser,
  loading,
}: BrandRailProps) {
  const router = useRouter();
  const isAdmin = currentUser.role === 'ADMIN';

  return (
    <div data-tour="brand-rail" className="w-[52px] bg-inverse flex flex-col items-center py-3 gap-2 h-screen">
      {/* Monogram */}
      <div className="w-9 h-9 bg-brand rounded-full flex items-center justify-center mb-2 flex-shrink-0">
        <span className="text-text-inverse font-bold text-base">A</span>
      </div>

      {/* Brand stack — one button per brand the user can access */}
      <div className="flex flex-col items-center gap-1.5 overflow-y-auto scrollbar-none">
        {loading ? (
          <div className="w-10 h-10 rounded-lg bg-white/10 animate-pulse" />
        ) : brands.length === 0 ? (
          <div
            title="No brands assigned — ask an admin"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[10px] font-bold text-white/40 border border-white/10"
          >
            —
          </div>
        ) : (
          brands.map((b) => {
            const isActive = b.id === activeBrand;
            const hasColor = !!b.color;
            const hasLogo = !!b.logo_url;

            // Inline style only kicks in when a custom color is set, so the
            // Tailwind fallback styles stay applied for un-themed brands.
            const style = hasColor
              ? isActive
                ? { backgroundColor: b.color!, color: '#fff' }
                : { backgroundColor: `${b.color}33` /* 20% alpha */, color: '#fff' }
              : undefined;

            return (
              <button
                key={b.id}
                onClick={() => onSelectBrand(b.id)}
                title={b.name}
                aria-label={`Switch to ${b.name}`}
                aria-pressed={isActive}
                style={style}
                className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold transition-all overflow-hidden
                  ${hasColor
                    ? isActive
                      ? 'shadow-lg ring-1 ring-white/30'
                      : 'hover:opacity-90'
                    : isActive
                      ? 'bg-elevated text-text-primary shadow-lg ring-1 ring-white/20'
                      : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-text-inverse'}`}
              >
                {hasLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.logo_url!} alt="" className="w-full h-full object-cover" />
                ) : (
                  shortLabel(b)
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Admin shortcut — visible only to admins */}
      {isAdmin && (
        <button
          onClick={() => router.push('/admin')}
          title="Admin panel"
          aria-label="Admin panel"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-text-inverse/70 hover:text-text-inverse hover:bg-white/10 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2 4 5v6c0 5 3.5 9.3 8 11 4.5-1.7 8-6 8-11V5l-8-3Z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </button>
      )}

      {/* Settings shortcut */}
      <button
        onClick={() => router.push('/settings')}
        title="Settings"
        aria-label="Settings"
        className="w-9 h-9 rounded-lg flex items-center justify-center text-text-inverse/70 hover:text-text-inverse hover:bg-white/10 transition-colors"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {/* Account menu */}
      <AccountMenu user={currentUser} />
    </div>
  );
}
