# CLAUDE.md — LumaLoop Engineering Guide

This file guides Claude (and any headless worker) when working in this repo.
Read it fully before making changes.

## 0. Operating role

- **Act as the Principal Software Engineer of the team.** Own correctness,
  architecture, testability, and long-term maintainability — not just "make it
  pass." Push back on shortcuts that create debt.

## 1. Repository & sources of truth

- **Code repository (PRs go here):** https://github.com/aishvar23/LumaLoop
- **Task tracker (work items):** Azure DevOps —
  https://dev.azure.com/aishvarsuhane/LumaLoop (Epic #40 → Issues → Tasks).
- **Product & technical specs:** `docs/PROTOTYPE_DESIGN.md` and
  `docs/PROTOTYPE_TECHNICAL_DESIGN.md`. These are authoritative for scope,
  schema, telemetry, and guardrails. When code and docs disagree, the docs win
  unless told otherwise.

## 2. Golden rule — do not assume, ask first

- **Never assume.** If a requirement, schema field, naming choice, dependency,
  API contract, or product decision is unclear or missing, **stop and ask a
  specific question before proceeding.** Do not invent behavior to keep moving.
- This applies even under autonomous/headless execution: if the only way forward
  is a guess about intent, surface the question instead of guessing.
- Exception: obvious, reversible, convention-following defaults already
  established in the docs or existing code. When in doubt, ask.

## 3. Testing — required for every change

- **Write unit tests for all changes.** No feature, fix, or refactor merges
  without tests covering the new/changed behavior.
- Cover: card-catalog validation, per-template answer evaluators, session
  reducer transitions, completion/timeout logic, receipt/summary calculations,
  telemetry payload shape, seeded session composition, and the
  template→category map (per Technical Design §17).
- Tests must run in the quality gate (lint + typecheck + unit tests + build) and
  pass before opening/merging a PR.

## 4. Architecture — extensible and scalable by design

- Design for extension, not just the prototype. Prefer clear module boundaries,
  typed contracts, and dependency inversion over ad-hoc coupling.
- Keep the **feed/session controller** independent of template internals:
  controllers own progression; renderers own only card interaction
  (Technical Design §4).
- No general-purpose game engine and no arbitrary creator code — but the
  primitives (typed card schema, template renderer contract, telemetry events)
  must scale cleanly into the MVP/Platform phases without rewrites.
- Avoid premature infrastructure (no backend beyond telemetry capture, cards
  stay local) — extensibility means *easy to grow later*, not *built now*.

## 5. Database — optimized schema and queries

- Schema and queries must be optimized from the start. Choose correct types,
  constraints, and indexes for the actual access patterns.
- Telemetry store (Supabase/Postgres): single `telemetry_events` table with a
  client-generated `eventId` (UUID, UNIQUE) for idempotent retry dedup;
  RLS insert-only, no client `select`; indexes for the real queries
  (`(anonymous_user_id, timestamp_ms)`, `(event_name)`).
- Do not log/persist PII (no names, email, contacts, device IDs); strip IP/UA at
  the ingestion function. Provide analysis as SQL views, not ad-hoc queries.
- Any new table/column must come with: justification of access pattern, indexes,
  and constraints. If unsure about the access pattern, **ask** (see §2).

## 6. Game & card extensibility — add new games with minimal changes

- Adding a new challenge template ("game") must require **minimal, localized
  changes**, not edits scattered across the codebase. Target shape:
  1. Add the template's typed `config` to the discriminated `LiquidCard` union.
  2. Add a `TemplateType` value and its `templateCategoryMap` entry.
  3. Drop in one renderer + one evaluator that implement the shared template
     contract (`TemplateProps`, `CardResolution`, timeout semantics).
  4. Author cards in the local catalog — no changes to session, telemetry, or
     receipt logic.
- The session engine, telemetry client, and receipt must remain
  template-agnostic. If a new game can't be added this way, the abstraction is
  wrong — fix the abstraction, don't special-case the engine.
- Keep card content data-driven (typed config in the catalog), so non-engine
  changes (new puzzles) never touch engine code.

## 7. Conventions

- Stack: Vite + React + TypeScript (mobile-first web). Typed configs over
  `Record<string, unknown>` in implementation.
- Branch per task; small, reviewable PRs; reference the Azure DevOps task ID
  (e.g. `#50`) in the branch/PR title.
- Run the full quality gate inline before opening a PR.
- Keep user-facing copy within the positioning guardrails (Design §7): no IQ /
  brain-training / employment / clinical claims; "performance categories," not
  "traits."
