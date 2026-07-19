/**
 * Code Break renderer — React Native (ADO #143; Design §7, §14; Technical Design
 * §6, §7).
 *
 * Native rebuild of web `src/templates/codeBreak/CodeBreakCard.tsx` — same
 * behaviour and signals, RN primitives instead of DOM. A DEDUCTIVE, MULTI-GUESS
 * template (Mastermind / Bulls-and-Cows): the player builds a guess of
 * `codeLength` symbols from the `palette`, submits it, and reads per-guess peg
 * feedback (exact = right symbol + slot; partial = right symbol, wrong slot)
 * computed by the pure {@link evaluateCodeBreak} family (the single source of
 * truth — peg logic is NEVER re-implemented in the UI). The board grows a row per
 * submitted guess; the player wins by submitting the secret.
 *
 * No timed PRE-phase: the board, builder, and palette mount immediately, so
 * interaction is enabled at card start and the controller sets
 * `interactionEnabledAtMs === activeAtMs`. `elapsedMs` runs from
 * `context.activeAtMs`; `interactionElapsedMs` / TTI runs from the first
 * interaction. The shared `isActive` ACTIVATION signal is accepted and passed
 * through for contract consistency; with no off-screen timed pre-phase, nothing
 * branches on it.
 *
 * Resolution semantics: resolves CORRECT the instant a submitted guess equals the
 * secret, INCORRECT once `maxGuesses` are spent without solving, TIMEOUT on the
 * clock (armed on mount via the shared {@link useCardTimer}). `onResolve` fires
 * EXACTLY ONCE; `onAttempt` once on the first input. Resolution is latched per
 * slide so a late tap on a finished card is inert.
 *
 * Accessibility (Technical Design §14): slots and palette symbols are real
 * buttons, large (≥ {@link TAP_TARGET_MIN}), labelled; peg feedback is shown as
 * text ("2 exact, 1 partial") so it is never conveyed by colour alone, and a
 * polite live region announces the latest result and remaining guesses.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { CodeBreakCard as CodeBreakCardType } from '../../core/cards/types';
import type { CardResolution, TemplateProps } from '../../core/templates/contract';
import { useCardTimer } from '../../core/templates/useCardTimer';
import {
  evaluateCodeBreak,
  isSolved,
  scoreGuess,
  type CodeBreakFeedback,
} from '../../core/templates/codeBreak/codeBreakEvaluator';
import {
  colors,
  elevation,
  fontSize,
  fontWeight,
  lineHeight,
  radius,
  space,
  TAP_TARGET_MIN,
} from './tokens';
import { useGameTheme } from './GameTheme';

/**
 * The renderer accepts the shared {@link TemplateProps} plus an optional
 * injectable `now` clock (defaults to `Date.now`); the optional prop keeps it
 * assignable to the registry slot while staying testable under fake timers.
 *
 * `isActive` is the shared ACTIVATION signal; Code Break has no timed pre-phase,
 * so it accepts the flag for contract consistency but does not gate any behaviour
 * on it. Omitted ≡ active.
 */
export type CodeBreakCardProps = TemplateProps<CodeBreakCardType> & {
  now?: () => number;
};

/** One submitted board row: the guess and its evaluated pegs. */
type BoardRow = { guess: string[]; feedback: CodeBreakFeedback };

export default function CodeBreakCard({
  card,
  context,
  // Accepted for contract consistency; no off-screen timed pre-phase to gate.
  isActive: _isActive = true,
  onAttempt,
  onResolve,
  now = Date.now,
}: CodeBreakCardProps) {
  const { config } = card;
  const { palette, codeLength, secret, maxGuesses } = config;
  const theme = useGameTheme();

  const [rows, setRows] = useState<BoardRow[]>([]);
  const submittedGuessesRef = useRef<string[][]>([]);

  const [draft, setDraft] = useState<(string | null)[]>(() =>
    Array.from({ length: codeLength }, () => null),
  );
  const [activeSlot, setActiveSlot] = useState(0);

  const firstInputElapsedRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);

  // Latch both resolution paths (own completion + the hook's timeout) so any
  // late tap is inert and cannot re-submit or re-announce on a finished card.
  const handleResolve = useCallback(
    (resolution: CardResolution) => {
      resolvedRef.current = true;
      onResolve(resolution);
    },
    [onResolve],
  );

  const timer = useCardTimer({
    card,
    context,
    onResolve: handleResolve,
    now,
    // Read at expiry: report how far the player got before the clock ran out.
    timeoutSignals: () => ({
      guesses_allowed: maxGuesses,
      guesses_used: submittedGuessesRef.current.length,
      code_length: codeLength,
      time_to_interaction: firstInputElapsedRef.current ?? -1,
      correct: false,
      elapsed: now() - context.interactionEnabledAtMs,
    }),
  });

  const markFirstInput = useCallback(() => {
    if (firstInputElapsedRef.current !== null) return;
    const tti = now() - context.interactionEnabledAtMs;
    firstInputElapsedRef.current = tti;
    onAttempt({ time_to_interaction: tti });
    attemptCountRef.current = timer.markAttempt();
  }, [now, context.interactionEnabledAtMs, onAttempt, timer]);

  const handleSlotTap = useCallback(
    (slot: number) => {
      if (resolvedRef.current) return;
      markFirstInput();
      setActiveSlot(slot);
    },
    [markFirstInput],
  );

  const handlePaletteTap = useCallback(
    (symbol: string) => {
      if (resolvedRef.current) return;
      markFirstInput();
      setDraft((prev) => {
        const next = [...prev];
        next[activeSlot] = symbol;
        return next;
      });
      setActiveSlot((slot) => (slot + 1) % codeLength);
    },
    [activeSlot, codeLength, markFirstInput],
  );

  const draftComplete = draft.every((s) => s !== null);

  const handleSubmit = useCallback(() => {
    if (resolvedRef.current || !draftComplete) return;

    const guess = draft.map((s) => s as string);
    const feedback = scoreGuess(secret, guess);

    const nextGuesses = [...submittedGuessesRef.current, guess];
    submittedGuessesRef.current = nextGuesses;
    setRows((prev) => [...prev, { guess, feedback }]);

    setDraft(Array.from({ length: codeLength }, () => null));
    setActiveSlot(0);

    const solved = isSolved(secret, guess);
    const exhausted = nextGuesses.length >= maxGuesses;
    if (!solved && !exhausted) return;

    const result = evaluateCodeBreak({ secret }, nextGuesses, maxGuesses);
    const resolvedAtMs = now();
    timer.resolve({
      cardId: card.cardId,
      resolutionType: result.resolutionType,
      isCorrect: result.isCorrect,
      elapsedMs: resolvedAtMs - context.activeAtMs,
      interactionElapsedMs: resolvedAtMs - context.interactionEnabledAtMs,
      attemptCount: attemptCountRef.current,
      signals: {
        ...result.signals,
        time_to_interaction: firstInputElapsedRef.current ?? -1,
        correct: result.isCorrect,
        elapsed: resolvedAtMs - context.interactionEnabledAtMs,
      },
    });
  }, [
    card.cardId,
    context.activeAtMs,
    context.interactionEnabledAtMs,
    draft,
    draftComplete,
    codeLength,
    maxGuesses,
    secret,
    now,
    timer,
  ]);

  const guessesLeft = maxGuesses - rows.length;
  const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;

  const slotIndices = useMemo(
    () => Array.from({ length: codeLength }, (_, i) => i),
    [codeLength],
  );

  return (
    <View style={styles.section} accessibilityLabel="Code break">
      <Text testID="cb-prompt" style={styles.prompt}>
        {card.prompt}
      </Text>

      {/* Submitted history: each guess + its peg feedback as TEXT. */}
      <ScrollView
        style={[
          styles.history,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
        contentContainerStyle={styles.historyContent}
        accessibilityLabel="Your guesses so far"
      >
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} testID={`cb-row-${rowIndex}`} style={styles.row}>
            <View style={styles.rowSymbols}>
              {row.guess.map((symbol, slot) => (
                <View
                  key={slot}
                  style={[
                    styles.historyChip,
                    {
                      backgroundColor: theme.surfaceRaised,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text style={styles.historyChipText}>{symbol}</Text>
                </View>
              ))}
            </View>
            <Text
              testID={`cb-feedback-${rowIndex}`}
              style={[styles.feedback, { color: theme.accent }]}
            >
              {`${row.feedback.exact} exact, ${row.feedback.partial} partial`}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* The current guess builder. */}
      <View style={styles.draft} accessibilityLabel="Your current guess">
        {slotIndices.map((slot) => {
          const active = slot === activeSlot;
          return (
            <Pressable
              key={slot}
              testID={`cb-slot-${slot}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Slot ${slot + 1}${
                draft[slot] ? `: ${draft[slot]}` : ': empty'
              }${active ? ' (active)' : ''}`}
              onPress={() => handleSlotTap(slot)}
              style={[
                styles.slot,
                {
                  backgroundColor: theme.surfaceRaised,
                  borderColor: active ? theme.accent : theme.border,
                },
              ]}
            >
              <Text style={styles.slotText}>{draft[slot] ?? '·'}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* The palette: fills the active slot. */}
      <View style={styles.palette} accessibilityLabel="Symbol palette">
        {palette.map((symbol) => (
          <Pressable
            key={symbol}
            testID={`cb-palette-${symbol}`}
            accessibilityRole="button"
            accessibilityLabel={`Place ${symbol}`}
            onPress={() => handlePaletteTap(symbol)}
            style={({ pressed }) => [
              styles.paletteButton,
              {
                backgroundColor: theme.surfaceRaised,
                borderColor: theme.border,
              },
              pressed && {
                backgroundColor: theme.surfaceStrong,
                borderColor: theme.accent,
              },
            ]}
          >
            <Text style={styles.paletteButtonText}>{symbol}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        testID="cb-submit"
        accessibilityRole="button"
        accessibilityState={{ disabled: !draftComplete }}
        disabled={!draftComplete}
        onPress={handleSubmit}
        style={[
          styles.submit,
          { backgroundColor: theme.accent },
          !draftComplete && {
            backgroundColor: theme.surfaceRaised,
            borderColor: theme.border,
          },
        ]}
      >
        <Text
          style={[
            styles.submitText,
            !draftComplete && styles.submitTextDisabled,
          ]}
        >
          Submit guess
        </Text>
      </Pressable>

      <Text
        testID="cb-status"
        accessibilityLiveRegion="polite"
        style={styles.status}
      >
        {lastRow
          ? `Last guess: ${lastRow.feedback.exact} exact, ${lastRow.feedback.partial} partial. `
          : ''}
        {`${guessesLeft} ${guessesLeft === 1 ? 'guess' : 'guesses'} left.`}
      </Text>
    </View>
  );
}
CodeBreakCard.displayName = 'CodeBreakCard';

const styles = StyleSheet.create({
  section: {
    gap: space.md,
  },
  prompt: {
    color: colors.text,
    fontSize: fontSize.hero,
    fontWeight: fontWeight.heavy,
    lineHeight: fontSize.hero * lineHeight.tight,
  },
  history: {
    width: '100%',
    maxHeight: 200,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  historyContent: {
    padding: space.md,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    marginBottom: space.sm,
  },
  rowSymbols: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  historyChip: {
    minWidth: TAP_TARGET_MIN * 0.7,
    minHeight: TAP_TARGET_MIN * 0.6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  historyChipText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  feedback: {
    color: colors.accent,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  draft: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    width: '100%',
  },
  slot: {
    minHeight: TAP_TARGET_MIN,
    minWidth: TAP_TARGET_MIN,
    flexGrow: 1,
    flexBasis: TAP_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    ...elevation.tile,
  },
  // The active slot: a solid accent ring (+ the "(active)" label) so the focus
  // target is never conveyed by colour alone.
  slotActive: {
    borderStyle: 'solid',
    borderColor: colors.accent,
  },
  slotText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  palette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    width: '100%',
  },
  paletteButton: {
    minHeight: TAP_TARGET_MIN,
    minWidth: TAP_TARGET_MIN,
    flexGrow: 1,
    flexBasis: TAP_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    ...elevation.tile,
  },
  paletteButtonPressed: {
    backgroundColor: colors.surfacePressed,
    transform: [{ scale: 0.98 }],
  },
  paletteButtonText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  submit: {
    minHeight: TAP_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  submitDisabled: {
    backgroundColor: colors.surfaceRaised,
  },
  submitText: {
    color: colors.accentContrast,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  submitTextDisabled: {
    color: colors.textMuted,
  },
  status: {
    minHeight: fontSize.md,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
