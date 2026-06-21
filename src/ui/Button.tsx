import type { ButtonHTMLAttributes } from 'react';

import './Button.css';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost';
};

/**
 * Base button with large, one-handed-friendly tap targets (Technical Design
 * §14). Phase 3 gives the primary variant an accent gradient + a pressed lift
 * (see Button.css); the gradient draws from the active `--accent` / `--accent-deep`
 * aliases, which each feed slide seeds from its card's category — so a button
 * inside a game inherits that game's accent with no per-template branching.
 * Callers can still override individual style properties via `style`.
 */
export default function Button({
  variant = 'primary',
  className,
  style,
  ...props
}: ButtonProps) {
  const classes = ['btn', variant === 'ghost' ? 'btn--ghost' : 'btn--primary'];
  if (className) classes.push(className);

  return (
    <button
      type="button"
      className={classes.join(' ')}
      style={style}
      {...props}
    />
  );
}
