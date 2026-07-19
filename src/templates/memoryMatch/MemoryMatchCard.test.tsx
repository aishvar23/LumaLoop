import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { MemoryMatchCard as MemoryMatchCardType } from '../../cards/types';
import MemoryMatchCard from './MemoryMatchCard';

/** A 2×2 board: tiles a1/a2 share pairKey 'a', b1/b2 share pairKey 'b'. */
function card(timeLimitMs = 20000): MemoryMatchCardType {
  return {
    cardId: 'mm-1',
    creatorHandle: '@memomatch',
    templateType: 'memory_match',
    category: 'working_memory',
    difficulty: 'extremely_easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 12,
    prompt: 'Flip the tiles two at a time to find the matching pairs.',
    puzzleDna: {
      mechanic: 'pair-recall',
      inputMode: 'tap',
      measuredSignals: ['accuracy', 'reaction_time'],
    },
    explanation: { title: 'Pairs', body: 'Two tiles share a shape.' },
    config: {
      rows: 2,
      columns: 2,
      tiles: [
        { id: 'a1', pairKey: 'a', glyph: '●' },
        { id: 'b1', pairKey: 'b', glyph: '■' },
        { id: 'a2', pairKey: 'a', glyph: '●' },
        { id: 'b2', pairKey: 'b', glyph: '■' },
      ],
      timeLimitMs,
    },
  };
}

const context = {
  sessionId: 's',
  cardIndex: 0,
  activeAtMs: 0,
  interactionEnabledAtMs: 0,
};

describe('MemoryMatchCard', () => {
  it('renders all tiles hidden ("?") at the start', () => {
    render(
      <MemoryMatchCard
        card={card()}
        context={context}
        onAttempt={vi.fn()}
        onResolve={vi.fn()}
      />,
    );
    const tile = screen.getByTestId('mm-tile-a1');
    expect(tile).toHaveTextContent('?');
    expect(tile).toHaveAttribute('aria-label', 'Tile 1, hidden');
  });

  it('fires onAttempt once on the first tap', () => {
    const onAttempt = vi.fn();
    render(
      <MemoryMatchCard
        card={card()}
        context={context}
        onAttempt={onAttempt}
        onResolve={vi.fn()}
        now={() => 100}
      />,
    );
    fireEvent.click(screen.getByTestId('mm-tile-a1'));
    fireEvent.click(screen.getByTestId('mm-tile-b1'));
    expect(onAttempt).toHaveBeenCalledTimes(1);
  });

  it('keeps a matching pair shown and resolves CORRECT when the board is cleared', () => {
    const onResolve = vi.fn();
    render(
      <MemoryMatchCard
        card={card()}
        context={context}
        onAttempt={vi.fn()}
        onResolve={onResolve}
        now={() => 1000}
      />,
    );
    // Match pair A.
    fireEvent.click(screen.getByTestId('mm-tile-a1'));
    fireEvent.click(screen.getByTestId('mm-tile-a2'));
    expect(screen.getByTestId('mm-tile-a1')).toHaveTextContent('●');
    expect(screen.getByTestId('mm-tile-a2')).toHaveTextContent('●');
    expect(onResolve).not.toHaveBeenCalled();

    // Match pair B → all pairs matched → CORRECT.
    fireEvent.click(screen.getByTestId('mm-tile-b1'));
    fireEvent.click(screen.getByTestId('mm-tile-b2'));
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve.mock.calls[0][0]).toMatchObject({
      resolutionType: 'correct',
      isCorrect: true,
      signals: { pairs: 2, total_pairs: 2 },
    });
    expect(screen.getByTestId('mm-status')).toHaveTextContent(
      'All pairs matched',
    );
  });

  it('flips a non-matching pair back after 700ms', () => {
    vi.useFakeTimers();
    try {
      render(
        <MemoryMatchCard
          card={card()}
          context={context}
          onAttempt={vi.fn()}
          onResolve={vi.fn()}
          now={() => 1000}
        />,
      );
      fireEvent.click(screen.getByTestId('mm-tile-a1'));
      fireEvent.click(screen.getByTestId('mm-tile-b1'));
      // Both revealed while the mismatch is shown.
      expect(screen.getByTestId('mm-tile-a1')).toHaveTextContent('●');
      expect(screen.getByTestId('mm-tile-b1')).toHaveTextContent('■');
      // After the flip-back delay both are hidden again.
      act(() => vi.advanceTimersByTime(700));
      expect(screen.getByTestId('mm-tile-a1')).toHaveTextContent('?');
      expect(screen.getByTestId('mm-tile-b1')).toHaveTextContent('?');
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves TIMEOUT when the clock runs out before the board is cleared', () => {
    vi.useFakeTimers();
    try {
      const onResolve = vi.fn();
      render(
        <MemoryMatchCard
          card={card(12000)}
          context={context}
          onAttempt={vi.fn()}
          onResolve={onResolve}
        />,
      );
      act(() => vi.advanceTimersByTime(12000));
      expect(onResolve.mock.calls[0][0]).toMatchObject({
        resolutionType: 'timeout',
        isCorrect: false,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
