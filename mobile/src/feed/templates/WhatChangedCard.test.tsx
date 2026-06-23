/**
 * Tests for the native What Changed renderer (ADO #128). Covers the renderer-owned
 * preview→answer transition: options are not interactive during preview, TTI is
 * measured from answer-phase start (EXCLUDING preview), the first committed
 * selection resolves correct/incorrect via the evaluator, and a timeout after the
 * answer phase begins resolves TIMEOUT.
 */
import { fireEvent, render, screen, act } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { WhatChangedCard as WhatChangedCardType } from '../../core/cards/types';
import type { CardResolution, CardStartContext } from '../../core/templates/contract';
import WhatChangedCard from './WhatChangedCard';

const ACTIVE_AT = 1000;
const PREVIEW_MS = 2000;

function makeCard(): WhatChangedCardType {
  return {
    cardId: 'wc-1',
    creatorHandle: '@memory',
    templateType: 'what_changed',
    category: 'working_memory',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 12,
    prompt: 'What changed?',
    puzzleDna: { mechanic: 'recall', inputMode: 'choice', measuredSignals: [] },
    explanation: { title: 'Why', body: 'Because.' },
    config: {
      previewMs: PREVIEW_MS,
      timeLimitMs: 5000,
      beforePattern: ['A', 'B', 'C'],
      afterPattern: ['A', 'X', 'C'],
      options: [
        { id: 'opt-a', label: 'First tile' },
        { id: 'opt-b', label: 'Middle tile' },
        { id: 'opt-c', label: 'Last tile' },
      ],
      correctOptionId: 'opt-b',
    },
  };
}

function context(): CardStartContext {
  return {
    sessionId: 'feed-1',
    cardIndex: 0,
    activeAtMs: ACTIVE_AT,
    interactionEnabledAtMs: ACTIVE_AT,
  };
}

it('shows the preview first (no options) then mounts the answer options after previewMs', () => {
  jest.useFakeTimers();
  try {
    let t = ACTIVE_AT;
    render(
      <WhatChangedCard
        card={makeCard()}
        context={context()}
        onAttempt={jest.fn()}
        onResolve={jest.fn()}
        now={() => t}
      />,
    );

    // Preview phase: before-pattern shown, options NOT mounted yet.
    expect(screen.getByTestId('wc-before-0')).toBeOnTheScreen();
    expect(screen.queryByTestId('wc-option-opt-b')).toBeNull();

    t = ACTIVE_AT + PREVIEW_MS;
    act(() => jest.advanceTimersByTime(PREVIEW_MS));

    // Answer phase: after-pattern + options mounted.
    expect(screen.getByTestId('wc-after-1')).toBeOnTheScreen();
    expect(screen.getByTestId('wc-option-opt-b')).toBeOnTheScreen();
  } finally {
    jest.useRealTimers();
  }
});

it('uses a compact two-column answer grid so the card fits the feed viewport', () => {
  jest.useFakeTimers();
  try {
    render(
      <WhatChangedCard
        card={makeCard()}
        context={context()}
        onAttempt={jest.fn()}
        onResolve={jest.fn()}
      />,
    );

    act(() => jest.advanceTimersByTime(PREVIEW_MS));

    expect(StyleSheet.flatten(screen.getByTestId('wc-options').props.style)).toEqual(
      expect.objectContaining({ flexDirection: 'row', flexWrap: 'wrap' }),
    );
    expect(
      StyleSheet.flatten(screen.getByTestId('wc-option-opt-a').props.style),
    ).toEqual(expect.objectContaining({ flexBasis: '46%', flexGrow: 1 }));
  } finally {
    jest.useRealTimers();
  }
});

it('resolves CORRECT on the right option, with TTI measured from answer start (excluding preview)', () => {
  jest.useFakeTimers();
  try {
    const onAttempt = jest.fn();
    const onResolve = jest.fn<void, [CardResolution]>();
    let t = ACTIVE_AT;
    render(
      <WhatChangedCard
        card={makeCard()}
        context={context()}
        onAttempt={onAttempt}
        onResolve={onResolve}
        now={() => t}
      />,
    );

    // Enter the answer phase at ACTIVE_AT + PREVIEW_MS.
    t = ACTIVE_AT + PREVIEW_MS;
    act(() => jest.advanceTimersByTime(PREVIEW_MS));

    // Select 400ms into the answer phase.
    t = ACTIVE_AT + PREVIEW_MS + 400;
    fireEvent.press(screen.getByTestId('wc-option-opt-b'));

    // TTI excludes the preview window: 400, not 2400.
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith({ time_to_interaction: 400 });

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = onResolve.mock.calls[0][0];
    expect(resolution).toMatchObject({
      resolutionType: 'correct',
      isCorrect: true,
      interactionElapsedMs: 400,
    });
    // elapsedMs runs from card active (includes preview): 2400.
    expect(resolution.elapsedMs).toBe(PREVIEW_MS + 400);
  } finally {
    jest.useRealTimers();
  }
});

it('resolves INCORRECT on a wrong option, recording it as the error type', () => {
  jest.useFakeTimers();
  try {
    const onResolve = jest.fn<void, [CardResolution]>();
    let t = ACTIVE_AT;
    render(
      <WhatChangedCard
        card={makeCard()}
        context={context()}
        onAttempt={jest.fn()}
        onResolve={onResolve}
        now={() => t}
      />,
    );

    t = ACTIVE_AT + PREVIEW_MS;
    act(() => jest.advanceTimersByTime(PREVIEW_MS));
    fireEvent.press(screen.getByTestId('wc-option-opt-a'));

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve.mock.calls[0][0]).toMatchObject({
      resolutionType: 'incorrect',
      isCorrect: false,
      signals: { selected_option_id: 'opt-a', correct: false },
    });

    // A second tap on a finished card is inert.
    fireEvent.press(screen.getByTestId('wc-option-opt-b'));
    expect(onResolve).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

it('holds the preview while INACTIVE (pre-mounted off-screen) and starts it only on activation; TTI still excludes the preview (#128)', () => {
  jest.useFakeTimers();
  try {
    const onAttempt = jest.fn();
    const onResolve = jest.fn<void, [CardResolution]>();
    let t = ACTIVE_AT;
    const props = (isActive: boolean) => (
      <WhatChangedCard
        card={makeCard()}
        context={context()}
        isActive={isActive}
        onAttempt={onAttempt}
        onResolve={onResolve}
        now={() => t}
      />
    );

    // Mounted but NOT active: the slide sits in preview. Advancing the clock well
    // past previewMs must NOT advance to the answer phase — `beforePattern` is still
    // shown and the answer options are never mounted.
    const { rerender } = render(props(false));
    expect(screen.getByTestId('wc-before-0')).toBeOnTheScreen();

    t = ACTIVE_AT + PREVIEW_MS * 3;
    act(() => jest.advanceTimersByTime(PREVIEW_MS * 3));
    expect(screen.getByTestId('wc-before-0')).toBeOnTheScreen();
    expect(screen.queryByTestId('wc-option-opt-b')).toBeNull();

    // Becomes ACTIVE: the preview countdown starts now, from this instant.
    const activatedAt = t;
    rerender(props(true));
    // Immediately after activation we are still in preview (countdown just armed).
    expect(screen.queryByTestId('wc-option-opt-b')).toBeNull();

    // After previewMs FROM ACTIVATION, the answer phase begins.
    const answerStart = activatedAt + PREVIEW_MS;
    t = answerStart;
    act(() => jest.advanceTimersByTime(PREVIEW_MS));
    expect(screen.getByTestId('wc-after-1')).toBeOnTheScreen();
    expect(screen.getByTestId('wc-option-opt-b')).toBeOnTheScreen();

    // Select 350ms into the answer phase: TTI is measured from answer-phase start,
    // excluding BOTH the preview and the long inactive hold before it.
    t = answerStart + 350;
    fireEvent.press(screen.getByTestId('wc-option-opt-b'));
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith({ time_to_interaction: 350 });

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = onResolve.mock.calls[0][0];
    expect(resolution).toMatchObject({
      resolutionType: 'correct',
      isCorrect: true,
      interactionElapsedMs: 350,
    });
  } finally {
    jest.useRealTimers();
  }
});

it('resolves TIMEOUT when the answer-phase time limit elapses with no selection', () => {
  jest.useFakeTimers();
  try {
    const onResolve = jest.fn<void, [CardResolution]>();
    let t = ACTIVE_AT;
    render(
      <WhatChangedCard
        card={makeCard()}
        context={context()}
        onAttempt={jest.fn()}
        onResolve={onResolve}
        now={() => t}
      />,
    );

    // Into the answer phase, then let the 5000ms answer limit elapse.
    t = ACTIVE_AT + PREVIEW_MS;
    act(() => jest.advanceTimersByTime(PREVIEW_MS));
    expect(onResolve).not.toHaveBeenCalled();

    t = ACTIVE_AT + PREVIEW_MS + 5000;
    act(() => jest.advanceTimersByTime(5000));

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = onResolve.mock.calls[0][0];
    expect(resolution.resolutionType).toBe('timeout');
    expect(resolution.signals.timedOut).toBe(true);
    // interactionElapsedMs measures the answer phase only (excludes preview).
    expect(resolution.interactionElapsedMs).toBe(5000);
  } finally {
    jest.useRealTimers();
  }
});
