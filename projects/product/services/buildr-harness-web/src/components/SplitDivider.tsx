import type { ButtonHTMLAttributes } from 'react';
import './split-divider.css';

/** Shared divider: the hit area stays wide while the visible line stays quiet. */
export function SplitDivider({ className = '', orientation = 'vertical', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { orientation?: 'vertical' | 'horizontal' }) {
  return <button type="button" role="separator" aria-orientation={orientation} {...props} className={`split-divider${orientation === 'horizontal' ? ' is-horizontal' : ''} ${className}`} />;
}
