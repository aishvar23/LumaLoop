import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost';
};

/**
 * Base button with large, one-handed-friendly tap targets (Technical Design
 * §14). Styling is intentionally minimal in the scaffold.
 */
export default function Button({
  variant = 'primary',
  style,
  ...props
}: ButtonProps) {
  const base = {
    minHeight: 48,
    padding: '12px 20px',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-md)',
    fontWeight: 600,
    cursor: 'pointer',
    border:
      variant === 'ghost'
        ? '1px solid var(--color-border)'
        : '1px solid transparent',
    background: variant === 'ghost' ? 'transparent' : 'var(--color-accent)',
    color:
      variant === 'ghost'
        ? 'var(--color-text)'
        : 'var(--color-accent-contrast)',
  } as const;

  return <button type="button" style={{ ...base, ...style }} {...props} />;
}
