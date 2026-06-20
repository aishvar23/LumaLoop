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
 * Unlike the web module, this one ships NO `defaultRendererRegistry` of real
 * renderers: the four native game renderers are M4. M3 ships a template-agnostic
 * STUB registry (see `stubRenderer.tsx`) behind this same seam, mirroring how the
 * web feed shell shipped with a stub before the renderers landed. When M4 adds
 * the real renderers it registers them here with no change to the feed.
 *
 * Entries are OPTIONAL on purpose. A partial registry is legal — the feed must
 * fail safe (render a placeholder) when the active card's template has no
 * registered renderer rather than crash (see {@link resolveRenderer}).
 */

import type { ComponentType } from 'react';

import type { LiquidCard, TemplateType } from '../core/cards/types';
import type { TemplateProps } from '../core/templates/contract';

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
