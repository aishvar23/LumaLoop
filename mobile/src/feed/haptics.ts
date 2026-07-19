/**
 * Best-effort haptic feedback (engagement: "juice" — make every touch feel
 * alive). Thin wrappers over `expo-haptics` that NEVER throw and no-op where
 * haptics are unavailable (iOS Simulator, unsupported devices), so callers can
 * fire them freely on the hot interaction path.
 *
 * - {@link selectionTick}: a light tick on a meaningful tap (selecting/committing).
 * - {@link successBuzz}: the celebratory notification on a correct resolution.
 * - {@link errorBuzz}: the softer error notification on a miss/timeout.
 */
import * as Haptics from 'expo-haptics';

/** A light selection tick — fire on a meaningful interaction (first tap). */
export function selectionTick(): void {
  try {
    void Haptics.selectionAsync();
  } catch {
    // Haptics unavailable (simulator / unsupported) — silently ignore.
  }
}

/** The success notification — fire on a CORRECT resolution. */
export function successBuzz(): void {
  try {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // no-op
  }
}

/** The error notification — fire on an INCORRECT / TIMEOUT resolution. */
export function errorBuzz(): void {
  try {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {
    // no-op
  }
}
