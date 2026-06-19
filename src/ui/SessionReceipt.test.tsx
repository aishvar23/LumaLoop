/**
 * Tests for the end-of-session receipt UI (Design §8.4, Technical Design §9;
 * Azure DevOps #71).
 *
 * The receipt is presentational and pure: it renders an already-computed
 * {@link SessionSummary}, never recomputing stats. These tests hand it
 * fixtures directly. They assert the rendered numbers/labels, conditional
 * fields (fastest card, exit badge), the empty/all-zero case, and — critically
 * for this high-risk surface — that the copy stays within the positioning
 * guardrails (Design §7 / CLAUDE.md §7).
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SessionSummary } from '../session/sessionSummary';
import SessionReceipt from './SessionReceipt';

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: 'sess-1',
    mode: 'three_minute_reset',
    completedCards: 7,
    correctCards: 6,
    accuracy: 6 / 7,
    totalElapsedMs: 42_000,
    fastestCorrectCard: { cardId: 'card-3', elapsedMs: 4_200 },
    categoryBreakdown: [
      {
        category: 'visual_attention',
        attempted: 3,
        correct: 3,
        medianElapsedMs: 5_000,
      },
      {
        category: 'working_memory',
        attempted: 4,
        correct: 3,
        medianElapsedMs: 8_500,
      },
    ],
    earnedExitBadge: true,
    ...overrides,
  };
}

describe('SessionReceipt', () => {
  it('renders cards completed, accuracy as a %, and correct/completed', () => {
    render(<SessionReceipt summary={summary()} />);

    expect(screen.getByText('7')).toBeInTheDocument();
    // 6 / 7 ≈ 0.857 → "86%".
    expect(screen.getByText('86%')).toBeInTheDocument();
    expect(screen.getByText('6 of 7')).toBeInTheDocument();
  });

  it('shows the fastest correct card time when present', () => {
    render(<SessionReceipt summary={summary()} />);

    expect(screen.getByText('Fastest correct card')).toBeInTheDocument();
    expect(screen.getByText('4.2s')).toBeInTheDocument();
  });

  it('omits the fastest correct card when absent', () => {
    render(
      <SessionReceipt
        summary={summary({ fastestCorrectCard: undefined })}
      />,
    );

    expect(
      screen.queryByText('Fastest correct card'),
    ).not.toBeInTheDocument();
  });

  it('renders each category row with correct/attempted and the median time', () => {
    render(<SessionReceipt summary={summary()} />);

    const visual = screen.getByTestId('category-row-visual_attention');
    expect(within(visual).getByText('Visual attention')).toBeInTheDocument();
    expect(
      within(visual).getByText(/3 of 3 correct · median 5\.0s/),
    ).toBeInTheDocument();

    const memory = screen.getByTestId('category-row-working_memory');
    expect(within(memory).getByText('Working memory')).toBeInTheDocument();
    expect(
      within(memory).getByText(/3 of 4 correct · median 8\.5s/),
    ).toBeInTheDocument();
  });

  it('shows the exit badge when earned', () => {
    render(<SessionReceipt summary={summary({ earnedExitBadge: true })} />);
    expect(screen.getByTestId('exit-badge')).toBeInTheDocument();
  });

  it('hides the exit badge when not earned', () => {
    render(<SessionReceipt summary={summary({ earnedExitBadge: false })} />);
    expect(screen.queryByTestId('exit-badge')).not.toBeInTheDocument();
  });

  it('renders an all-zero / empty summary without crashing', () => {
    render(
      <SessionReceipt
        summary={summary({
          completedCards: 0,
          correctCards: 0,
          accuracy: 0,
          totalElapsedMs: 0,
          fastestCorrectCard: undefined,
          categoryBreakdown: [],
          earnedExitBadge: false,
        })}
      />,
    );

    expect(screen.getByText('Session complete')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('0 of 0')).toBeInTheDocument();
    // No categories → the category-mix section is omitted entirely.
    expect(
      screen.queryByText('This session included'),
    ).not.toBeInTheDocument();
  });

  it('keeps copy within the positioning guardrails (no trait/ability claims)', () => {
    // Render EVERY performance category so all CATEGORY_LABELS are exercised —
    // a future label/copy regression in any category is caught, not just the two
    // that happen to be in the default fixture.
    const allCategories = summary({
      categoryBreakdown: (
        [
          'visual_attention',
          'working_memory',
          'logical_reasoning',
          'cognitive_flexibility',
          'pattern_recognition',
          'processing_speed',
        ] as const
      ).map((category) => ({
        category,
        attempted: 2,
        correct: 1,
        medianElapsedMs: 5_000,
      })),
    });
    const { container } = render(<SessionReceipt summary={allCategories} />);
    const text = container.textContent ?? '';
    // Widened forbidden-term list: trait/ability/clinical/employment framing.
    expect(text).not.toMatch(
      /\b(IQ|trait|traits|intelligence|smart|genius|ability|abilities|aptitude|brain[- ]?training|clinical|diagnos|disorder|employment|hire|hiring)\b/i,
    );
  });
});
