'use client';

export type StatusFilter = 'all' | 'AI' | 'HUMAN' | 'QUALIFIED' | 'MINE' | 'PENDING';

interface FilterPillsProps {
  value: StatusFilter;
  onChange: (filter: StatusFilter) => void;
}

const PILLS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'AI', value: 'AI' },
  { label: 'Human', value: 'HUMAN' },
  { label: 'Qualified', value: 'QUALIFIED' },
  { label: 'Mine', value: 'MINE' },
  { label: 'Pending', value: 'PENDING' },
];

export default function FilterPills({ value, onChange }: FilterPillsProps) {
  return (
    <div className="flex flex-wrap gap-1 px-3 py-2">
      {PILLS.map((pill) => (
        <button
          key={pill.value}
          onClick={() => onChange(pill.value)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            value === pill.value
              ? pill.value === 'PENDING'
                ? 'bg-amber-500 text-white'
                : 'bg-rose-600 text-white'
              : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          {pill.label}
        </button>
      ))}
    </div>
  );
}
