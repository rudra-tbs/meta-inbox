'use client';

import { Check } from 'lucide-react';
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
  pipelineError?: string | null;
  onRetry?: () => void;
  onBack: () => void;
  onNext: () => void;
}

export default function BrandsStep({ brands, selected, onChange, pipelineError, onRetry, onBack, onNext }: BrandsStepProps) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((b) => b !== id) : [...selected, id]);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Which brands do you work for?</h2>
        <p className="text-sm text-text-secondary mt-1">
          You&apos;ll see conversations across every channel your admin has connected for these brands. Pick more than one if applicable.
        </p>
      </div>

      {pipelineError && (
        <div className="bg-danger-soft border border-danger/20 text-danger text-sm px-3 py-2 rounded-md flex items-start justify-between gap-3">
          <span>Couldn&apos;t load brands from the CRM: {pipelineError}</span>
          {onRetry && (
            <button onClick={onRetry} className="underline text-danger font-medium flex-shrink-0">
              Retry
            </button>
          )}
        </div>
      )}

      {!pipelineError && brands.length === 0 && (
        <div className="bg-warning-soft border border-warning/20 text-warning text-sm px-3 py-2 rounded-md">
          No active pipelines found in the CRM. Ask your admin to create one before continuing.
        </div>
      )}

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
                {checked && <Check className="w-3 h-3" aria-hidden />}
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
