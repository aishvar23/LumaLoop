# `mobile/src/core` — ported framework-agnostic core (Phase M, M2 · ADO #126)

This directory holds the **pure, DOM-free TypeScript** the native feed needs:
the card domain, the template contract + evaluators, seeded session composition,
the endless feed deck, and the telemetry event contract. It contains **no React
/ React Native components and no DOM access** — only typed logic and data.

## Source of truth & sync strategy

The web app under the repo-root **`src/`** is the **single source of truth** for
this logic. The files here are **hand-synced ports**: each one carries a header
comment naming the web path it was ported from. When the web module changes,
update its mobile counterpart to match (behaviour stays byte-faithful; only
import paths differ, and the layout here mirrors `src/` so even those rarely do).

A shared workspace package (so web + mobile import one copy instead of two) is a
sensible **future** option, but is intentionally **out of scope** for the
prototype: `mobile/` is its own self-contained Expo sub-project with its own
toolchain, and introducing a monorepo/workspace package now would be premature
infrastructure (CLAUDE.md §4). Until then, keep the two trees in sync by hand and
rely on the ported unit tests below to catch behavioural drift.

## What was ported (and what was deliberately not)

| Area | Ported here | NOT ported (rebuilt later) |
| --- | --- | --- |
| Cards | `cards/types.ts` (incl. `templateCategoryMap`), `cards/catalog.ts` (the full authored catalog + `getCardById`), `cards/validation.ts` | — |
| Templates | `templates/contract.ts` (types), all 11 pure evaluators (including `signalSet` and `circuitFlow`), `templates/timeoutResolution.ts`, `templates/useCardTimer.ts` | React renderers (rebuilt natively under `mobile/src/feed/templates/`) |
| Session | `session/sessionTypes.ts` (dependency of the composer) | session reducer / controller / summary |
| Composition | `session/composeSession.ts`, `feed/feedDeck.ts` | `useFeedController` (RN feed → M3) |
| Scoring (Phase 4) | `feed/scoring.ts` (pure game-points + streak/combo core) | `useFeedScore` hook + `scoreStore` (RN, in `mobile/src/feed/`) |
| Telemetry | `telemetry/telemetryEvents.ts` (names + payload types) | telemetry client, `anonymousUser` (RN client → M5) |
| Accounts (pivot) | `auth/types.ts` (profiles/game_plays/`user_game_scores` row models), `auth/gamePlayFromResolution.ts` (resolution→row mapper), `profile/computeStats.ts` (pure /you stats), `profile/yourGames.ts` (pure per-game "Your games" shaping, D3) | Supabase client, AuthProvider, screens, data helpers incl. `feed/playedCardsApi.ts`+`feed/usePlayedCardIds.ts` (D2 already-played skip) and `profile/gameScoresApi.ts` (D3) (RN, in `mobile/src/auth/`, `mobile/src/feed/`, `mobile/src/profile/`) |

The layout mirrors the web `src/` so internal relative imports are unchanged.

## Tests

Every ported module has a jest test under the same folder (`jest-expo` preset).
Run them from `mobile/`:

```sh
cd mobile && npx tsc --noEmit && npm test
```
