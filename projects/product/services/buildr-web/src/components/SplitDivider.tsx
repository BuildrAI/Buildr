import type { ButtonHTMLAttributes } from 'react';
import './split-divider.css';

/** Shared divider: the hit area stays wide while the visible line stays quiet. */
export function SplitDivider({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" role="separator" aria-orientation="vertical" {...props} className={`split-divider ${className}`} />;
}
