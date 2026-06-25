/**
 * Tests for the Word Unscramble renderer (Design §9; Tech §7, §14).
 *
 * Driven through React Testing Library with an INJECTED clock and vitest fake
 * timers, so no assertion depends on the real `Date.now()`. Word Unscramble is a
 * single-phase MCQ template (no preview/stream), so `interactionEnabledAtMs ===
 * activeAtMs` and the two clock origins coincide. The committed-choice semantics
 * are the focus: the FIRST selection resolves the card and the chosen distractor
 * is reported in the signals.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WordUnscrambleCard as WordUnscrambleCardType } from '../../cards/types';
import type { CardResolution, CardStartContext } from '../contract';
import WordUnscrambleCard from './WordUnscrambleCard';

function unscrambleCard(
  overrides: Partial<WordUnscrambleCardType['config']> = {},
): WordUnscrambleCardType {
  return {
    cardId: 'wu-1',
    creatorHandle: '@test',
    templateType: 'word_unscramble',
    category: 'pattern_recognition',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 12,
    prompt: 'Unscramble the word',
    puzzleDna: {
      mechanic: 'word-unscramble',
      inputMode: 'choice',
      measuredSignals: ['time_to_interaction', 'correct', 'elapsed_ms'],
    },
    explanation: { title: 'It spells STARE', body: 'The letters rearrange to STARE.' },
    config: {
      scrambled: 'tsrae',
      answer: 'stare',
      options: [
        { id: 'opt-real', label: 'stare' },
        { id: 'opt-near', label: 'tears' },
        { id: 'opt-bad', label: 'snake' },
      ],
      correctOptionId: 'opt-real',
      timeLimitMs: 12_000,
      ...overrides,
    },
  };
}

function startContext(
  overrides: Partial<CardStartContext> = {},
): CardStartContext {
  return {
    sessionId: 'sess-1',
    cardIndex: 0,
    activeAtMs: 1_000,
    interactionEnabledAtMs: 1_000,
    ...overrides,
  };
}

function renderCard(opts: { now?: () => number } = {}) {
  const onAttempt = vi.fn();
  const onResolve = vi.fn();
  render(
    <WordUnscrambleCard
      card={unscrambleCard()}
      context={startContext()}
      onAttempt={onAttempt}
      onResolve={onResolve}
      now={opts.now}
    />,
  );
  return { onAttempt, onResolve };
}

const selectOption = (id: string) =>
  act(() => void fireEvent.click(screen.getByTestId(`wu-option-${id}`)));

const lastResolution = (onResolve: ReturnType<typeof vi.fn>) =>
  onResolve.mock.calls[onResolve.mock.calls.length - 1][0] as CardResolution;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('initial render', () => {
  it('shows the scrambled letters and all options', () => {
    renderCard({ now: () => 1_000 });
    expect(screen.getByTestId('wu-scrambled')).toHaveTextContent('t s r a e');
    expect(screen.getByTestId('wu-option-opt-real')).toHaveTextContent('stare');
    expect(screen.getByTestId('wu-option-opt-near')).toHaveTextContent('tears');
  });
});

describe('selecting the correct option', () => {
  it('resolves correct with the right signals', () => {
    let clock = 1_000;
    const { onAttempt, onResolve } = renderCard({ now: () => clock });

    clock = 2_500;
    selectOption('opt-real');

    expect(onAttempt).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('correct');
    expect(resolution.isCorrect).toBe(true);
    expect(resolution.elapsedMs).toBe(1_500);
    expect(resolution.interactionElapsedMs).toBe(1_500);
    expect(resolution.signals.selected_option_id).toBe('opt-real');
    expect(resolution.signals.distractor_option_id).toBe('');
  });
});

describe('selecting a wrong option', () => {
  it('resolves incorrect and reports the chosen distractor', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 3_000;
    selectOption('opt-near');

    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('incorrect');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.signals.distractor_option_id).toBe('opt-near');
  });

  it('ignores selections after the card has resolved', () => {
    let clock = 1_000;
    const { onResolve, onAttempt } = renderCard({ now: () => clock });
    clock = 2_000;
    selectOption('opt-near');
    clock = 3_000;
    selectOption('opt-real');
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledTimes(1);
  });
});

describe('timeout', () => {
  it('resolves timeout when no choice is made', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });
    clock = 13_000;
    act(() => void vi.advanceTimersByTime(12_000));
    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('timeout');
    expect(resolution.signals.timedOut).toBe(true);
    expect(resolution.signals.time_to_interaction).toBe(-1);
  });
});
