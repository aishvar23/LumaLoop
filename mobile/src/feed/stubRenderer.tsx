/**
 * Template-agnostic STUB renderer + registry for the native feed (ADO #127).
 *
 * The four real game renderers are M4. This task ships the feed shell, the
 * controller, and the free-scroll lifecycle behind the {@link RendererRegistry}
 * seam — exactly as the web feed first shipped with a stub before its renderers
 * landed. The stub implements the shared `TemplateProps` contract so the feed's
 * engage → resolve → skip/abandon lifecycle (and its tests) work end-to-end with
 * no real games, and so M4 can drop the real renderers into {@link RendererRegistry}
 * with zero feed changes.
 *
 * It honours the feed's ACTIVATION-gated timing by mounting the shared, template-
 * AGNOSTIC {@link useCardTimer}: the feed hands a NON-active (pre-mounted) card a
 * non-finite `timeLimitMs` (see `FeedScreen`'s `timerGatedCard`), so a neighbour's
 * timer stays disarmed; once the slide becomes the focused card the real finite
 * limit flows through and a full-duration countdown arms from the activation
 * instant — i.e. the countdown starts when the game appears, like the real
 * immediate-play renderers. "engage" only records the first interaction now.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { LiquidCard } from '../core/cards/types';
import type { TemplateProps } from '../core/templates/contract';
import { useCardTimer } from '../core/templates/useCardTimer';
import type { RendererRegistry, TemplateRenderer } from './rendererRegistry';

/** A fixed correct resolution the stub emits when the player "resolves" it. */
function correctResolution(cardId: string) {
  return {
    cardId,
    resolutionType: 'correct' as const,
    isCorrect: true,
    elapsedMs: 1,
    interactionElapsedMs: 1,
    attemptCount: 1,
    signals: {},
  };
}

/**
 * The placeholder slide content for M3. Renders the cardId plus an "engage" and a
 * "resolve" affordance so the lifecycle is exercisable. Typed at the
 * {@link LiquidCard} base because the stub is template-agnostic — it reads only the
 * shared fields, never a concrete template config.
 */
export function StubRenderer({
  card,
  context,
  onAttempt,
  onResolve,
}: TemplateProps<LiquidCard>) {
  const timer = useCardTimer({ card, context, onResolve });
  return (
    <View style={styles.stub}>
      <Text style={styles.cardId} testID={`stub-card-${card.cardId}`}>
        {card.cardId}
      </Text>
      <Pressable
        accessibilityRole="button"
        testID={`engage-${card.cardId}`}
        style={styles.button}
        onPress={() => {
          // First interaction ENGAGES the game: notify the feed (arms its timer)
          // and record the attempt on the shared timer.
          onAttempt({ time_to_first_tap: 1 });
          timer.markAttempt();
        }}
      >
        <Text style={styles.buttonText}>engage:{card.cardId}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        testID={`resolve-${card.cardId}`}
        style={styles.button}
        onPress={() => timer.resolve(correctResolution(card.cardId))}
      >
        <Text style={styles.buttonText}>game:{card.cardId}</Text>
      </Pressable>
    </View>
  );
}
StubRenderer.displayName = 'StubRenderer';

/**
 * Build a registry that maps EVERY template type to the stub renderer. The per-key
 * cast mirrors the sound escape hatch documented on {@link resolveRenderer}: the
 * stub reads only shared `LiquidCard` fields, so it is assignable to every precise
 * per-template slot. M4 replaces these entries with the real renderers.
 */
export function createStubRegistry(): RendererRegistry {
  const stub = StubRenderer as TemplateRenderer<LiquidCard>;
  return {
    spot_it: stub,
    what_changed: stub,
    rule_flip: stub,
    tiny_logic: stub,
  } as RendererRegistry;
}

/** The app's M3 feed registry: every template renders the stub. */
export const stubRendererRegistry: RendererRegistry = createStubRegistry();

const styles = StyleSheet.create({
  stub: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  cardId: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 999,
    backgroundColor: '#2a2a35',
  },
  buttonText: {
    color: '#e7e7ee',
    fontSize: 16,
    fontWeight: '600',
  },
});
