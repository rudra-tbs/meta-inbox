'use client';

import type { AppUser } from '@/types';
import AccountMenu from './AccountMenu';

interface BrandRailProps {
  activeBrand: string;
  currentUser: AppUser;
}

export default function BrandRail({ activeBrand, currentUser }: BrandRailProps) {
  return (
    <div className="w-[52px] bg-inverse flex flex-col items-center py-3 gap-2 h-screen">
      {/* Monogram */}
      <div className="w-9 h-9 bg-brand rounded-full flex items-center justify-center mb-2 flex-shrink-0">
        <span className="text-text-inverse font-bold text-base">A</span>
      </div>

      {/* Active brand pill — placeholder for now while brands move to CRM pipelines */}
      <div className="flex flex-col items-center gap-0.5">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold bg-elevated text-text-primary shadow-lg"
          title={activeBrand}
        >
          {activeBrand.slice(0, 3).toUpperCase()}
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Account menu */}
      <AccountMenu user={currentUser} />
    </div>
  );
}
