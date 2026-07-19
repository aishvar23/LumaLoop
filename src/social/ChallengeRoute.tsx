/**
 * Challenge arrival surface — the public, no-auth, playable single card behind
 * a shared `<origin>/c/<cardId>?s=<points>` link (engagement strategy §4.6 /
 * Phase 3). This closes the viral "beat my score" loop with NO accounts and NO
 * server: a recipient opens the link, gets a real card with a "Beat <points>!"
 * banner, plays it, sees their score vs the challenger, and can challenge back.
 *
 * It replaces the `/c/:cardId` placeholder and stays PUBLIC (mounted OUTSIDE
 * RequireAuth in `src/app/router.tsx`). It imports NO auth and NO Supabase: it
 * renders the RAW, UNGATED renderer (not the feedback-gated feed registry) and
 * owns its own result UI, computing points exactly as the feed does
 * ({@link applyResolution}). It records no `game_plays` — it is a standalone
 * play.
 *
 * Copy is guardrail-safe (Design §7): game framing only ("beat", "challenge",
 * "puzzle"), no IQ / skill / ability / assessment language, no shame copy.
 */
import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import { getCardById } from '../cards/catalog';
import { applyResolution, INITIAL_SCORE_STATE } from '../feed/scoring';
import { resolveRenderer } from '../session/rendererRegistry';
import { defaultRendererRegistry } from '../session/rendererRegistry';
import type { CardResolution, CardStartContext } from '../templates/contract';
import { ROUTES } from '../app/routes';
import Button from '../ui/Button';
import Screen from '../ui/Screen';
import Stack from '../ui/Stack';
import { resolveCategoryTheme } from '../ui/categoryTheme';
import type { CSSProperties } from 'react';
import {
  buildChallengeUrl,
  challengeShareText,
  parseChallenge,
} from './challengeLink';
import { shareChallengeLink } from './shareChallenge';

type Phase = 'playing' | 'done';

export default function ChallengeRoute() {
  const { cardId } = useParams<'cardId'>();
  const { points: challengerPoints } = parseChallenge(useLocation().search);

  const card = cardId ? getCardById(cardId) : undefined;
  const Renderer = card ? resolveRenderer(defaultRendererRegistry, card) : undefined;

  const [phase, setPhase] = useState<Phase>('playing');
  const [myPoints, setMyPoints] = useState<number | null>(null);
  // Bumped on "Play again" to remount the renderer with a fresh context/state.
  const [runKey, setRunKey] = useState(0);
  const [copied, setCopied] = useState(false);

  // A fresh start context per run — `now` re-reads on each replay (keyed by
  // runKey) so timing starts from when this attempt mounts.
  const context = useMemo<CardStartContext>(() => {
    const now = Date.now();
    return {
      sessionId: 'challenge',
      cardIndex: 0,
      activeAtMs: now,
      interactionEnabledAtMs: now,
    };
    // runKey intentionally re-derives the context for each replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  // No card (bad/expired id) or no renderer for its template → friendly panel.
  if (!card || !Renderer) {
    return (
      <Screen aria-labelledby="challenge-unavailable-heading">
        <Stack gap={3}>
          <h1 id="challenge-unavailable-heading" style={{ margin: 0 }}>
            This challenge isn’t available
          </h1>
          <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
            The puzzle behind this link couldn’t be found. It may have changed
            since it was shared.
          </p>
          <Link to={ROUTES.home}>Get the full feed</Link>
        </Stack>
      </Screen>
    );
  }

  const accentStyle = slideAccentStyle(card.category);

  function handleResolve(resolution: CardResolution) {
    // Same points math the feed uses, from a clean score state (standalone play).
    const { cardScore } = applyResolution(
      INITIAL_SCORE_STATE,
      resolution,
      card!.config.timeLimitMs,
    );
    setMyPoints(cardScore.points);
    setPhase('done');
  }

  function playAgain() {
    setMyPoints(null);
    setCopied(false);
    setRunKey((key) => key + 1);
    setPhase('playing');
  }

  async function challengeBack() {
    try {
      const url = buildChallengeUrl({
        cardId: card!.cardId,
        points: myPoints,
        origin: window.location.origin,
      });
      const result = await shareChallengeLink(url, challengeShareText(myPoints));
      if (result === 'copied') {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Never throw out of a share interaction.
    }
  }

  return (
    <Screen aria-labelledby="challenge-heading" style={accentStyle}>
      <Stack gap={4}>
        <header data-testid="challenge-banner">
          <Stack gap={1}>
            <h1 id="challenge-heading" style={{ margin: 0 }}>
              {challengerPoints != null
                ? `Beat ${challengerPoints} points`
                : 'Take on this challenge'}
            </h1>
            <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
              {challengerPoints != null
                ? 'Solve it to take the lead.'
                : 'Solve it to set the score.'}
            </p>
          </Stack>
        </header>

        {phase === 'playing' ? (
          <Renderer
            key={runKey}
            card={card}
            context={context}
            isActive
            onAttempt={() => {}}
            onResolve={handleResolve}
          />
        ) : (
          <section data-testid="challenge-result">
            <Stack gap={3}>
              <Stack gap={1}>
                <h2 style={{ margin: 0 }}>You scored {myPoints}</h2>
                <p style={{ margin: 0, fontWeight: 'var(--font-weight-bold)' }}>
                  {challengerPoints == null
                    ? 'Score set — challenge a friend to beat it.'
                    : myPoints != null && myPoints > challengerPoints
                      ? 'You beat the challenge!'
                      : `${challengerPoints} still leads — try again`}
                </p>
              </Stack>

              <Stack
                gap={1}
                as="section"
                style={{
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-lg, 12px)',
                  background: 'var(--accent-tint, var(--color-surface))',
                }}
              >
                <strong>{card.explanation.title}</strong>
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {card.explanation.body}
                </span>
              </Stack>

              <Button data-testid="challenge-playagain" variant="ghost" onClick={playAgain}>
                Play again
              </Button>
              <Button data-testid="challenge-share" onClick={challengeBack}>
                {copied ? 'Link copied!' : 'Challenge a friend'}
              </Button>
              <Link to={ROUTES.home}>Get the full feed</Link>
            </Stack>
          </section>
        )}
      </Stack>
    </Screen>
  );
}

/**
 * Seed the local accent aliases from the card's category so the standalone
 * renderer inherits its game's accent (mirrors `FeedScreen`'s slide styling).
 */
function slideAccentStyle(category: string): CSSProperties {
  const t = resolveCategoryTheme(category);
  return {
    '--accent': t.accent,
    '--accent-deep': t.accentDeep,
    '--accent-tint': t.accentTint,
  } as CSSProperties;
}
