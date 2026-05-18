'use client';

import Button from '@/components/ui/Button';

export interface BrandOption {
  id: string;
  name: string;
  subtitle: string;
}

interface BrandsStepProps {
  brands: BrandOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  onBack: () => void;
  onNext: () => void;
}

export default function BrandsStep({ brands, selected, onChange, onBack, onNext }: BrandsStepProps) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((b) => b !== id) : [...selected, id]);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Which brands do you work for?</h2>
        <p className="text-sm text-text-secondary mt-1">
          You&apos;ll only see conversations for the brands you pick. Pick more than one if applicable.
        </p>
      </div>

      <div className="space-y-2">
        {brands.map((b) => {
          const checked = selected.includes(b.id);
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => toggle(b.id)}
              className={`w-full text-left p-4 rounded-lg border transition-colors flex items-start gap-3
                ${checked
                  ? 'border-brand bg-brand-soft'
                  : 'border-border-default bg-elevated hover:bg-canvas'}`}
            >
              <span
                className={`mt-0.5 flex items-center justify-center w-5 h-5 rounded-md border transition-colors flex-shrink-0
                  ${checked ? 'border-brand bg-brand text-text-inverse' : 'border-border-default bg-elevated'}`}
                aria-hidden
              >
                {checked && <span className="text-[11px] leading-none">✓</span>}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-text-primary">{b.name}</div>
                <div className="text-xs text-text-secondary mt-0.5">{b.subtitle}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="md" onClick={onBack}>
          ← Back
        </Button>
        <Button variant="primary" size="md" onClick={onNext} disabled={selected.length === 0}>
          Continue
        </Button>
      </div>
    </div>
  );
}
