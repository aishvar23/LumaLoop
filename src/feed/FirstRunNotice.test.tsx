/**
 * First-run notice tests (docs/FEED_DIRECTION.md §3.6, Technical Design §21.8).
 *
 * The acknowledgement store is injected over a fake storage so first-run vs.
 * already-acknowledged is deterministic. The §21.8 non-assessment guardrail
 * coverage migrated here from the retired StartScreen.test.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  DATA_NOTICE_ACKNOWLEDGED_STORAGE_KEY,
  createDataNoticeStore,
  type ReadWriteStorage,
} from './dataNoticeStore';
import FirstRunNotice from './FirstRunNotice';

function fakeStorage(seed: Record<string, string> = {}): ReadWriteStorage & {
  map: Map<string, string>;
} {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe('FirstRunNotice', () => {
  it('shows the required §21.8 non-assessment notice on first run', () => {
    const store = createDataNoticeStore({ storage: fakeStorage() });
    render(<FirstRunNotice store={store} />);

    // Verbatim non-assessment copy (guardrail moved from StartScreen.test).
    expect(
      screen.getByText(/anonymous interaction events/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not a cognitive, medical, school, or employment/i),
    ).toBeInTheDocument();
    // It is an accessible modal dialog with an acknowledge control.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /got it/i }),
    ).toBeInTheDocument();
  });

  it('makes NO ability / IQ / clinical claim (positioning guardrail)', () => {
    const store = createDataNoticeStore({ storage: fakeStorage() });
    render(<FirstRunNotice store={store} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent ?? '').not.toMatch(
      /\b(iq|brain[- ]?training|cognitive ability|smarter|clinical)\b/i,
    );
  });

  it('hides and persists acknowledgement when dismissed', () => {
    const storage = fakeStorage();
    const store = createDataNoticeStore({ storage });
    render(<FirstRunNotice store={store} />);

    fireEvent.click(screen.getByRole('button', { name: /got it/i }));

    // Dismissed immediately…
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // …and the acknowledgement is persisted to the backing storage.
    expect(storage.map.get(DATA_NOTICE_ACKNOWLEDGED_STORAGE_KEY)).toBe('1');
  });

  it('does not reappear on a re-mount over the same (acknowledged) storage', () => {
    const storage = fakeStorage();

    const first = render(<FirstRunNotice store={createDataNoticeStore({ storage })} />);
    fireEvent.click(screen.getByRole('button', { name: /got it/i }));
    first.unmount();

    // A fresh store + fresh mount reading the same storage stays dismissed.
    render(<FirstRunNotice store={createDataNoticeStore({ storage })} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not show when storage is already acknowledged on mount', () => {
    const store = createDataNoticeStore({
      storage: fakeStorage({ [DATA_NOTICE_ACKNOWLEDGED_STORAGE_KEY]: '1' }),
    });
    render(<FirstRunNotice store={store} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/anonymous interaction events/i),
    ).not.toBeInTheDocument();
  });
});
