/**
 * Card "hook" — the punchy one-line promise shown as the bold first-read on a
 * feed slide BEFORE the player engages (engagement strategy §4.1: "every card
 * needs a hook"). It creates a tiny promise so swiping into a card feels like
 * opening a post, not starting a test.
 *
 * A card may carry its own `hook` (per-card override); when it doesn't, the feed
 * falls back to a per-TEMPLATE default here, so EVERY card has a hook with no
 * mass authoring. Copy stays within the positioning guardrails (Design §7) —
 * game framing only, concrete and playful, NEVER IQ/skill/assessment language.
 */
import type { LiquidCard, TemplateType } from './types';

/** One punchy default hook per template (game framing, guardrail-safe). */
export const DEFAULT_HOOK_BY_TEMPLATE: Readonly<Record<TemplateType, string>> =
  Object.freeze({
    spot_it: "One shape doesn't belong — spot it before the timer bites.",
    what_changed: 'Watch closely… only one thing changes.',
    rule_flip: 'Keep up — the rule flips mid-stream.',
    tiny_logic: 'Two facts, one answer. Trust the logic.',
    memory_sequence: 'Watch the lights, then play them back.',
    pattern_chain: 'Crack the pattern, then call the next move.',
    step_logic: 'Follow the thread, one step at a time.',
    code_break: "Crack the secret code — you've got limited guesses.",
    prism_path: 'Bend the beam to the target — mind the blockers.',
    signal_set: 'Find the trio where everything agrees… or nothing does.',
    circuit_flow: 'Rotate the tiles until it all connects.',
    word_unscramble: 'These letters spell something. Unscramble it.',
    quick_math: 'Quick — what does it equal?',
    color_word: 'Tap the COLOR, not the word. Harder than it sounds.',
    n_back: 'Spot the repeat from a few steps back.',
    odd_one_out: 'One of these breaks the rule. Which one?',
    schulte_order: 'Tap them in order, as fast as you can.',
    matrix_reasoning: 'Read the pattern, then complete the grid.',
    gears_rotation: 'Which way does the last gear spin?',
    memory_match: 'Flip two at a time — remember and match the pairs.',
    maze_path: 'Find the way out — tap through the open path.',
  });

/**
 * The hook to show for a card: its own `hook` when authored, else the template
 * default. Always returns a non-empty string.
 */
export function hookForCard(
  card: Pick<LiquidCard, 'templateType' | 'hook'>,
): string {
  const own = card.hook?.trim();
  return own && own.length > 0
    ? own
    : DEFAULT_HOOK_BY_TEMPLATE[card.templateType];
}
