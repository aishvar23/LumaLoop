/**
 * First-run data notice (docs/FEED_DIRECTION.md §3.6, Technical Design §21.8).
 *
 * The app now opens straight into the endless feed (#107), so the REQUIRED
 * anonymous-data / non-assessment notice no longer lives on a start screen. It
 * is preserved here as a one-time gate: shown ONCE over the feed on the first
 * visit, then dismissed for good. Acknowledgement is persisted via an injectable
 * {@link DataNoticeStore} (best-effort `localStorage`), so a re-render / re-mount
 * on the same device never shows it again.
 *
 * Presentational + local only (CLAUDE.md §4): it owns no feed progression. Copy
 * stays within the positioning guardrails (Design §7 / §21.8) — it makes no
 * ability / IQ / brain-training / clinical / employment claim.
 */
import { useCallback, useState } from 'react';

import Button from '../ui/Button';
import { createDataNoticeStore, type DataNoticeStore } from './dataNoticeStore';

/**
 * The required notice (verbatim, Technical Design §14 / §21.8): records anonymous
 * interaction events and is explicitly NOT a cognitive / medical / school /
 * employment assessment. Kept identical to the retired start-screen copy.
 */
export const DATA_NOTICE =
  'This prototype records anonymous interaction events like card attempts, ' +
  'timing, and completion. It is not a cognitive, medical, school, or ' +
  'employment assessment.';

/** Process-wide default store backed by the real `localStorage`. */
const defaultDataNoticeStore = createDataNoticeStore();

export type FirstRunNoticeProps = {
  /**
   * Acknowledgement store. Defaults to the shared `localStorage`-backed store;
   * tests inject one over a fake storage to simulate first-run vs. already
   * acknowledged.
   */
  store?: DataNoticeStore;
};

export default function FirstRunNotice({
  store = defaultDataNoticeStore,
}: FirstRunNoticeProps = {}) {
  // Read the persisted acknowledgement ONCE on mount: if already acknowledged we
  // never show the notice; otherwise it shows until the player dismisses it.
  const [acknowledged, setAcknowledged] = useState(() => store.isAcknowledged());

  const handleAcknowledge = useCallback(() => {
    store.acknowledge();
    setAcknowledged(true);
  }, [store]);

  if (acknowledged) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-run-heading"
      aria-describedby="first-run-body"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)',
        background: 'rgba(0, 0, 0, 0.6)',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 360,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}
      >
        <h2
          id="first-run-heading"
          style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}
        >
          Before you play
        </h2>
        {/* Default (non-muted) text so the REQUIRED notice (§21.8 / §14) reads as
            required, not as decorative muted copy. */}
        <p
          id="first-run-body"
          style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}
        >
          {DATA_NOTICE}
        </p>
        <Button
          // The acknowledge control receives initial focus implicitly as the
          // only interactive element; it is keyboard-operable (Enter/Space).
          autoFocus
          data-testid="first-run-acknowledge"
          onClick={handleAcknowledge}
        >
          Got it
        </Button>
      </section>
    </div>
  );
}
