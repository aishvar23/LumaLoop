/**
 * Tests for the native first-run data notice gate (ADO #130, M6).
 *
 * The acknowledgement store is injected over an in-memory async storage so the
 * tests deterministically simulate first-run vs. already-acknowledged, assert the
 * REQUIRED §21.8 non-assessment copy is shown verbatim, that acknowledging hides
 * the notice AND persists it, that a re-mount over the same store never re-shows
 * it, and that storage failures are non-throwing.
 */
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Text } from 'react-native';

import FirstRunNotice, { DATA_NOTICE } from './FirstRunNotice';
import {
  DATA_NOTICE_ACKNOWLEDGED_STORAGE_KEY,
  createDataNoticeStore,
} from './dataNoticeStore';
import type { AsyncReadWriteStorage } from '../telemetry/storage';

/** The exact §21.8 sentence the notice MUST carry verbatim. */
const REQUIRED_NON_ASSESSMENT_SENTENCE =
  'It is not a cognitive, medical, school, or employment assessment.';

function makeStorage(seed: Record<string, string> = {}): AsyncReadWriteStorage & {
  map: Map<string, string>;
} {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    map,
    async getItem(key) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
  };
}

/** A marker for the gated feed content, so we can assert it stays mounted. */
function Feed() {
  return <Text testID="feed-marker">feed</Text>;
}

describe('FirstRunNotice (native)', () => {
  it('first run: shows the notice with the verbatim non-assessment copy', async () => {
    const store = createDataNoticeStore({ storage: makeStorage() });
    render(
      <FirstRunNotice store={store}>
        <Feed />
      </FirstRunNotice>,
    );

    // The notice resolves async from storage, then appears.
    expect(await screen.findByTestId('first-run-acknowledge')).toBeOnTheScreen();
    // The full required copy is present verbatim, including the §21.8 sentence.
    expect(screen.getByTestId('first-run-body')).toHaveTextContent(DATA_NOTICE);
    expect(screen.getByText(DATA_NOTICE)).toBeOnTheScreen();
    expect(DATA_NOTICE).toContain(REQUIRED_NON_ASSESSMENT_SENTENCE);
  });

  it('acknowledging hides the notice and persists the flag', async () => {
    const storage = makeStorage();
    const store = createDataNoticeStore({ storage });
    render(
      <FirstRunNotice store={store}>
        <Feed />
      </FirstRunNotice>,
    );

    fireEvent.press(await screen.findByTestId('first-run-acknowledge'));

    // The notice is gone...
    await waitFor(() =>
      expect(screen.queryByTestId('first-run-acknowledge')).toBeNull(),
    );
    // ...the feed remains mounted...
    expect(screen.getByTestId('feed-marker')).toBeOnTheScreen();
    // ...and the acknowledgement was persisted.
    await waitFor(() =>
      expect(storage.map.get(DATA_NOTICE_ACKNOWLEDGED_STORAGE_KEY)).toBe('1'),
    );
  });

  it('a re-mount with the same store does NOT show the notice again', async () => {
    const store = createDataNoticeStore({ storage: makeStorage() });

    const first = render(
      <FirstRunNotice store={store}>
        <Feed />
      </FirstRunNotice>,
    );
    fireEvent.press(await screen.findByTestId('first-run-acknowledge'));
    await waitFor(() =>
      expect(screen.queryByTestId('first-run-acknowledge')).toBeNull(),
    );
    first.unmount();

    // Re-mount over the SAME (now-acknowledged) store: the notice never shows.
    render(
      <FirstRunNotice store={store}>
        <Feed />
      </FirstRunNotice>,
    );
    // Give the async ack read a chance to resolve, then assert it stays hidden.
    await waitFor(() => expect(screen.getByTestId('feed-marker')).toBeOnTheScreen());
    expect(screen.queryByTestId('first-run-acknowledge')).toBeNull();
  });

  it('pre-acknowledged storage: the notice does not show, the feed is shown', async () => {
    const store = createDataNoticeStore({
      storage: makeStorage({ [DATA_NOTICE_ACKNOWLEDGED_STORAGE_KEY]: '1' }),
    });
    render(
      <FirstRunNotice store={store}>
        <Feed />
      </FirstRunNotice>,
    );

    await waitFor(() => expect(screen.getByTestId('feed-marker')).toBeOnTheScreen());
    expect(screen.queryByTestId('first-run-acknowledge')).toBeNull();
  });

  it('storage failure is non-throwing: the notice still shows and acknowledges', async () => {
    const throwingStorage: AsyncReadWriteStorage = {
      async getItem() {
        throw new Error('read failed');
      },
      async setItem() {
        throw new Error('write failed');
      },
    };
    const store = createDataNoticeStore({ storage: throwingStorage });

    render(
      <FirstRunNotice store={store}>
        <Feed />
      </FirstRunNotice>,
    );

    // An unreadable store reads as first-run, so the notice shows.
    fireEvent.press(await screen.findByTestId('first-run-acknowledge'));
    // Acknowledging despite the failing write does not throw and still dismisses.
    await waitFor(() =>
      expect(screen.queryByTestId('first-run-acknowledge')).toBeNull(),
    );
    expect(screen.getByTestId('feed-marker')).toBeOnTheScreen();
  });
});
