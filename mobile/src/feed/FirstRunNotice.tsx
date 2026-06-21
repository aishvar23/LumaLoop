/**
 * First-run data notice for React Native (ADO #130, M6; docs/FEED_DIRECTION.md
 * §3.6, Technical Design §21.8).
 *
 * The RN counterpart of the web `src/feed/FirstRunNotice.tsx`. The app opens
 * straight into the endless feed (M3), so the REQUIRED anonymous-data /
 * non-assessment notice is the one remaining gate: shown ONCE over the first feed
 * view, then dismissed for good. Acknowledgement is persisted via an injectable
 * {@link DataNoticeStore} (best-effort AsyncStorage), so a re-mount / relaunch on
 * the same device never shows it again.
 *
 * Unlike the web component (a sibling overlay relying on `inert`), this is a GATE
 * that wraps the feed: it always mounts {@link FirstRunNoticeProps.children} so
 * the feed lives behind, raises a top-layer absolutely-positioned overlay while
 * the notice is pending (a full-bleed scrim that captures all touches), and
 * additionally marks the feed `pointerEvents="none"` while gated — the RN analog
 * of the web `inert` deferral. (An absolutely-positioned overlay, not `Modal`, so
 * the gate composes inside the existing root view without a second native host.)
 *
 * The persisted flag resolves ASYNCHRONOUSLY, so the gate starts in a `loading`
 * state that shows the feed WITHOUT the notice (no flash of the modal before the
 * ack state is known), then gates only if not acknowledged.
 *
 * Presentational + local only (CLAUDE.md §4): it owns no feed progression. Copy
 * stays within the positioning guardrails (Design §7 / §21.8) — it makes no
 * ability / IQ / brain-training / clinical / employment claim.
 */
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  colors,
  elevation,
  fontSize,
  fontWeight,
  lineHeight,
  radius,
  space,
  TAP_TARGET_MIN,
} from './templates/tokens';
import { createDataNoticeStore, type DataNoticeStore } from './dataNoticeStore';

/**
 * The required notice (verbatim, Technical Design §14 / §21.8): records anonymous
 * interaction events and is explicitly NOT a cognitive / medical / school /
 * employment assessment. Kept identical to the web copy.
 */
export const DATA_NOTICE =
  'This prototype records anonymous interaction events like card attempts, ' +
  'timing, and completion. It is not a cognitive, medical, school, or ' +
  'employment assessment.';

/** Process-wide default store backed by the real AsyncStorage. */
const defaultDataNoticeStore = createDataNoticeStore();

/**
 * Gate lifecycle: `loading` while the async ack read is in flight (feed shown,
 * no modal — no flash), `pending` when first-run and the notice must show,
 * `acknowledged` once dismissed (or already acknowledged on a prior launch).
 */
type GateStatus = 'loading' | 'pending' | 'acknowledged';

export type FirstRunNoticeProps = {
  /**
   * Acknowledgement store. Defaults to the shared AsyncStorage-backed store;
   * tests inject one over a fake storage to simulate first-run vs. already
   * acknowledged.
   */
  store?: DataNoticeStore;
  /** The gated content (the feed). Always mounted; non-interactive while gated. */
  children?: ReactNode;
};

export default function FirstRunNotice({
  store = defaultDataNoticeStore,
  children,
}: FirstRunNoticeProps) {
  const [status, setStatus] = useState<GateStatus>('loading');

  // Read the persisted acknowledgement ONCE on mount. Until it resolves we stay
  // in `loading` (no modal), so the notice never flashes before the ack is known.
  useEffect(() => {
    let active = true;
    store.isAcknowledged().then((ack) => {
      if (active) setStatus(ack ? 'acknowledged' : 'pending');
    });
    return () => {
      active = false;
    };
  }, [store]);

  const handleAcknowledge = useCallback(() => {
    // Persist best-effort (never throws); dismiss immediately regardless.
    void store.acknowledge();
    setStatus('acknowledged');
  }, [store]);

  const gated = status === 'pending';
  // The feed is only interactive once the ack is KNOWN to be acknowledged. During
  // the async `loading` window we keep it non-interactive too, so a first-run user
  // cannot tap/swipe the feed in the few frames before the gate resolves.
  const feedInteractive = status === 'acknowledged';

  return (
    <View style={styles.root}>
      {/* Feed lives behind the gate; non-interactive (and hidden from assistive
          tech) until acknowledged. accessibilityElementsHidden (iOS) +
          importantForAccessibility=no-hide-descendants (Android) mirror the web
          inert/aria-modal isolation on BOTH platforms. */}
      <View
        style={styles.content}
        pointerEvents={feedInteractive ? 'auto' : 'none'}
        accessibilityElementsHidden={!feedInteractive}
        importantForAccessibility={
          feedInteractive ? 'auto' : 'no-hide-descendants'
        }
      >
        {children}
      </View>

      {gated ? (
        // Full-bleed scrim above the feed. A default-pointerEvents View captures
        // every touch so nothing leaks to the (also non-interactive) feed behind.
        <View
          style={styles.scrim}
          accessibilityViewIsModal
          accessibilityLabel="Before you play"
        >
          <View style={styles.dialog}>
            <Text
              accessibilityRole="header"
              style={styles.heading}
              testID="first-run-heading"
            >
              Before you play
            </Text>
            <Text style={styles.body} testID="first-run-body">
              {DATA_NOTICE}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Got it"
              focusable
              testID="first-run-acknowledge"
              onPress={handleAcknowledge}
              style={({ pressed }) => [
                styles.button,
                pressed ? styles.buttonPressed : null,
              ]}
            >
              <Text style={styles.buttonLabel}>Got it</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    gap: space.lg,
    padding: space.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    ...elevation.card,
  },
  heading: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  body: {
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * lineHeight.relaxed,
  },
  button: {
    minHeight: TAP_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  buttonLabel: {
    color: colors.accentContrast,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
});
