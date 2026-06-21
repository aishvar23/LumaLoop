/**
 * `useReducedMotion` — reports whether the OS "reduce motion" accessibility
 * preference is on, so the feed's animations (the feedback result-card fade, any
 * future transitions) can degrade to an instant, non-animated appearance (MP3 #135;
 * Design §7 — respect prefers-reduced-motion).
 *
 * RN analog of the web `prefers-reduced-motion` media query: it reads
 * `AccessibilityInfo.isReduceMotionEnabled()` once on mount and then subscribes to
 * `reduceMotionChanged` so a mid-session toggle is honoured. The initial value is
 * `false` (motion allowed) until the async read resolves — the safe default, and on
 * a device the read settles within a frame.
 *
 * Presentational concern only: this gates HOW things appear, never WHAT the feed
 * does (no game logic, telemetry, or paging depends on it).
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value: boolean) => setReduced(value),
    );
    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);

  return reduced;
}
