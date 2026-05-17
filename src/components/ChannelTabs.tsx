'use client';

import type { ChannelView } from '@/types';

interface ChannelTabsProps {
  activeChannel: ChannelView;
  onChange: (channel: ChannelView) => void;
  igEnabled?: boolean;
}

export default function ChannelTabs({ activeChannel, onChange, igEnabled = false }: ChannelTabsProps) {
  function tabClass(isActive: boolean, disabled = false) {
    if (disabled) return 'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 rounded-md cursor-not-allowed';
    return `flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
      isActive ? 'text-rose-600 border-b-2 border-rose-600 rounded-none' : 'text-slate-500 hover:text-slate-700'
    }`;
  }

  return (
    <div className="flex gap-1 pb-2">
      <button onClick={() => onChange('ALL')} className={tabClass(activeChannel === 'ALL')}>
        <span>All</span>
      </button>
      <button onClick={() => onChange('WA')} className={tabClass(activeChannel === 'WA')}>
        <svg viewBox="0 0 24 24" width="14" height="14" className="fill-current flex-shrink-0">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.062.525 4.01 1.448 5.709L0 24l6.467-1.414A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.797 9.797 0 0 1-5.028-1.385l-.36-.214-3.736.816.834-3.645-.235-.374A9.791 9.791 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z" />
        </svg>
        WhatsApp
      </button>
      <button
        disabled={!igEnabled}
        onClick={() => igEnabled && onChange('IG')}
        title={igEnabled ? '' : 'Phase 2 — Coming Soon'}
        className={tabClass(activeChannel === 'IG', !igEnabled)}
      >
        Instagram
      </button>
    </div>
  );
}
