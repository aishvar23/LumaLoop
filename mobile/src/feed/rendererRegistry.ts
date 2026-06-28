/**
 * Renderer-registry contract for the native feed (Technical Design §4, §7;
 * CLAUDE.md §4/§6). Adapted from web `src/session/rendererRegistry.ts`.
 *
 * This is the dependency-inversion seam between the feed (which owns progression
 * and presentation) and the concrete per-template renderers. {@link FeedScreen}
 * receives a {@link RendererRegistry} — a map from each {@link TemplateType} to
 * the component that renders that template's card behind the shared
 * `TemplateProps` / `CardResolution` contract — and looks up the renderer for the
 * active card's `templateType` at runtime. There is NO `switch` on `templateType`
 * anywhere in the feed, so adding a new game is a single localized registry slot,
 * never a feed edit (CLAUDE.md §6).
 *
 * M4 (ADO #128) landed the initial native renderers and registers every shipped game here as
 * {@link defaultRendererRegistry} — the feed's new default — with no change to
 * `FeedScreen`. The template-agnostic STUB registry (see `stubRenderer.tsx`)
 * remains for the feed-lifecycle tests, which need a renderer with deterministic,
 * synchronous engage/resolve affordances; it is no longer the app default.
 *
 * Entries are OPTIONAL on purpose. A partial registry is legal — the feed must
 * fail safe (render a placeholder) when the active card's template has no
 * registered renderer rather than crash (see {@link resolveRenderer}).
 */

import type { ComponentType } from 'react';

import type { LiquidCard, TemplateType } from '../core/cards/types';
import type { TemplateProps } from '../core/templates/contract';
import SpotItCard from './templates/SpotItCard';
import WhatChangedCard from './templates/WhatChangedCard';
import RuleFlipCard from './templates/RuleFlipCard';
import TinyLogicCard from './templates/TinyLogicCard';
import MemorySequenceCard from './templates/MemorySequenceCard';
import PatternChainCard from './templates/PatternChainCard';
import StepLogicCard from './templates/StepLogicCard';
import CodeBreakCard from './templates/CodeBreakCard';
import CircuitFlowCard from './templates/CircuitFlowCard';
import PrismPathCard from './templates/PrismPathCard';
import SignalSetCard from './templates/SignalSetCard';
import WordUnscrambleCard from './templates/WordUnscrambleCard';
import QuickMathCard from './templates/QuickMathCard';
import ColorWordCard from './templates/ColorWordCard';
import NBackCard from './templates/NBackCard';
import OddOneOutCard from './templates/OddOneOutCard';
import SchulteOrderCard from './templates/SchulteOrderCard';
import MatrixReasoningCard from './templates/MatrixReasoningCard';
import GearsRotationCard from './templates/GearsRotationCard';
import MemoryMatchCard from './templates/MemoryMatchCard';

/**
 * A template renderer: a component that accepts {@link TemplateProps} for its
 * concrete card type. Defaults to the full {@link LiquidCard} union so callers
 * can refer to "some renderer" without a concrete card type.
 */
export type TemplateRenderer<TCard extends LiquidCard = LiquidCard> =
  ComponentType<TemplateProps<TCard>>;

/** The concrete card variant for a given template discriminant. */
type CardForTemplate<K extends TemplateType> = Extract<
  LiquidCard,
  { templateType: K }
>;

/**
 * Maps each {@link TemplateType} to the renderer for that template's card type.
 * Every slot is optional so a caller may register only the templates it has built
 * (a stub-only M3, tests, or a phased M4 rollout). The feed treats a missing slot
 * as a fail-safe placeholder, never a crash.
 */
export type RendererRegistry = {
  readonly [K in TemplateType]?: TemplateRenderer<CardForTemplate<K>>;
};

/**
 * Look up the renderer for a card from the registry, returning `undefined` when
 * none is registered for the card's `templateType`.
 *
 * The cast is the one localized, sound escape hatch for the discriminated-union ↔
 * registry correlation TypeScript cannot express on its own: at runtime
 * `registry[card.templateType]` is, by construction, the renderer for exactly this
 * card's variant, and `card` is that variant. Keeping the cast here lets the feed
 * stay free of any per-template branching (and therefore free of renderer imports).
 */
export function resolveRenderer(
  registry: RendererRegistry,
  card: LiquidCard,
): TemplateRenderer<LiquidCard> | undefined {
  return registry[card.templateType] as
    | TemplateRenderer<LiquidCard>
    | undefined;
}

/**
 * The app's default feed registry: every template mapped to its real native
 * renderer (ADO #128). This is what {@link FeedScreen} injects by default; the
 * stub registry is now test-only.
 *
 * Adding a future game stays a single localized slot here (CLAUDE.md §6): author a
 * renderer that implements the shared `TemplateProps` contract and add one entry —
 * no feed/controller/telemetry edits. Each renderer is typed at its precise
 * per-template card variant, so the map is fully type-checked with no cast.
 */
export const defaultRendererRegistry: RendererRegistry = {
  spot_it: SpotItCard,
  what_changed: WhatChangedCard,
  rule_flip: RuleFlipCard,
  tiny_logic: TinyLogicCard,
  memory_sequence: MemorySequenceCard,
  pattern_chain: PatternChainCard,
  step_logic: StepLogicCard,
  code_break: CodeBreakCard,
  prism_path: PrismPathCard,
  signal_set: SignalSetCard,
  circuit_flow: CircuitFlowCard,
  word_unscramble: WordUnscrambleCard,
  quick_math: QuickMathCard,
  color_word: ColorWordCard,
  n_back: NBackCard,
  odd_one_out: OddOneOutCard,
  schulte_order: SchulteOrderCard,
  matrix_reasoning: MatrixReasoningCard,
  gears_rotation: GearsRotationCard,
  memory_match: MemoryMatchCard,
};
