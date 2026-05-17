'use client';

import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger' | 'icon';
export type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:   'bg-brand text-text-inverse hover:bg-brand-hover shadow-sm border border-transparent',
  secondary: 'bg-elevated text-text-primary hover:bg-canvas border border-border-default',
  ghost:     'bg-transparent text-text-secondary hover:text-text-primary hover:bg-canvas border border-transparent',
  success:   'bg-success text-text-inverse hover:opacity-90 shadow-sm border border-transparent',
  danger:    'bg-danger text-text-inverse hover:opacity-90 shadow-sm border border-transparent',
  icon:      'bg-transparent text-text-secondary hover:text-text-primary hover:bg-canvas border border-border-default',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'text-xs px-2.5 py-1.5 rounded-md',
  md: 'text-sm px-3.5 py-2 rounded-lg',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'sm', className = '', children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={`
        inline-flex items-center justify-center gap-1.5 font-medium transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
      {...rest}
    >
      {children}
    </button>
  );
});

export default Button;
