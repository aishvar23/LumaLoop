/**
 * Renderer-registry contract (Technical Design §4, §7; CLAUDE.md §4/§6).
 *
 * This is the dependency-inversion seam between the feed controller and the
 * concrete template renderers. The controller OWNS progression but must never
 * import a concrete renderer (those are separate tasks, #64-67). Instead it
 * receives a {@link RendererRegistry} — a map from each {@link TemplateType} to
 * the component that renders that template's card behind the shared
 * `TemplateProps` / `CardResolution` contract — and looks up the renderer for
 * the active card's `templateType` at runtime.
 *
 * Because the registry is keyed by `TemplateType` (a `Record`-shaped mapped
 * type), adding a new template surfaces here as a single optional slot, not a
 * controller edit: the engine stays template-agnostic (CLAUDE.md §6).
 *
 * Entries are OPTIONAL on purpose. A partial registry is legal — the controller
 * must fail safe (skip/resolve as error) when the active card's template has no
 * registered renderer rather than crash (see {@link resolveRenderer}).
 */

import type { ComponentType, ReactNode } from 'react';

import type { LiquidCard, TemplateType } from '../cards/types';
import type { TemplateProps } from '../templates/contract';
import SpotItCard from '../templates/spotIt/SpotItCard';

/**
 * A template renderer: a component that accepts {@link TemplateProps} for its
 * concrete card type. Defaults to the full {@link LiquidCard} union so callers
 * can refer to "some renderer" without a concrete card type.
 *
 * `ComponentType` (not a bare function) so registries may supply either
 * function or class components; the controller renders it as `<Renderer … />`.
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
 * Every slot is optional so a caller may register only the templates it has
 * built (the prototype, tests, or a phased rollout). The controller treats a
 * missing slot as a fail-safe skip, never a crash.
 */
export type RendererRegistry = {
  readonly [K in TemplateType]?: TemplateRenderer<CardForTemplate<K>>;
};

/**
 * Look up the renderer for a card from the registry, returning `undefined` when
 * none is registered for the card's `templateType`.
 *
 * The cast is the one localized, sound escape hatch for the
 * discriminated-union ↔ registry correlation TypeScript cannot express on its
 * own: at runtime `registry[card.templateType]` is, by construction, the
 * renderer for exactly this card's variant, and `card` is that variant. Keeping
 * the cast here lets the controller stay free of any per-template branching
 * (and therefore free of renderer imports).
 */
export function resolveRenderer(
  registry: RendererRegistry,
  card: LiquidCard,
): TemplateRenderer<LiquidCard> | undefined {
  return registry[card.templateType] as
    | TemplateRenderer<LiquidCard>
    | undefined;
}

/** A rendered card element (or `null` when nothing is in play / renderable). */
export type ActiveCardElement = ReactNode;

/**
 * The concrete registry the app ships with. Each template task (#64-67) wires
 * its own slot here as its renderer lands; the controller stays untouched
 * because adding a template is a single localized entry (CLAUDE.md §6).
 *
 * Partial by design: templates without a shipped renderer yet are simply
 * absent, and the controller fails safe on a missing slot (see
 * {@link resolveRenderer}).
 */
export const defaultRendererRegistry: RendererRegistry = {
  spot_it: SpotItCard,
};
