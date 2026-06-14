---
name: tracker-autopilot
description: >-
  Autonomously work through an implementation tracker checked into a repo, in
  autopilot mode: repeatedly pick the next unblocked task, implement it, open a
  PR, code-review it, fix the findings, and merge — one task per iteration, until
  the tracker is done or only blocked tasks remain. Project-agnostic: it
  discovers the repo's tracker file, quality gate, and conventions on first run.
  Use when the user says things like "run the tracker in autopilot", "work
  through the implementation tracker automatically", "keep shipping tasks until
  the backlog is empty", or asks to resume such a loop. Optional arg: a path to
  the tracker file and/or the target repo.
---

# Tracker Autopilot

You are the **orchestrator**. You do NOT write the feature code yourself — you
drive a separate **headless worker** (`claude --dangerously-skip-permissions -p
"<prompt>"`) once per step, capture its output, and advance a deterministic
state machine. Each full pass ships exactly one tracker task from implementation
to a merged PR.

This works headlessly because driving a _live interactive_ `claude` TUI from a
shell is unreliable; `-p` invocations are scriptable and observable. The skill
also encodes failure modes that are expensive to rediscover (see **Known failure
modes**).

The task source is **an implementation tracker checked into the repo** — a
markdown file of tasks with stable IDs and checkboxes (e.g.
`IMPLEMENTATION_TRACKER.md` with `- [ ] P5-2 …`), or whatever convention the repo
uses. It is the single source of truth for "what's next" and "what's done."

---

## Phase 0 — Discover & confirm the project config (first run only)

Before looping, learn the project so the prompts are accurate. Inspect, don't
assume:

1. **Target repo** — the arg, else the current git repo. Confirm it's a git repo
   with a remote (or that PRs go somewhere — `gh`, `glab`, plain branches).
2. **Tracker file** — the arg, else glob for candidates
   (`*TRACKER*.md`, `*ROADMAP*.md`, `TODO*.md`, `tasks/**`). If several, ask
   which (some repos have more than one, e.g. a main + a sub-area tracker). Read
   its top to learn the **task-ID scheme**, the **checkbox / done convention**,
   any **progress summary** to keep in sync, and how **dependencies/blocked**
   tasks are marked.
3. **Quality gate (DoD)** — read `CLAUDE.md` / `AGENTS.md` / `CONTRIBUTING.md`
   and `package.json` scripts (or the language's equivalent: `Makefile`,
   `justfile`, `cargo`, `go test`, `pytest`, etc.). Assemble the exact gate
   commands (lint, typecheck, test, build, format) the repo expects CI to pass.
4. **Conventions** — branch naming, commit/PR style, how generated artifacts are
   regenerated, any "don't do X" rules in CLAUDE.md.
5. **Ask the user once** (durable choices):
   - **Merge policy** — auto-merge each iteration (default) vs. pause for
     approval before each merge.
   - **Stop condition** — until the backlog is blocked/empty (default) vs. a
     fixed count vs. until interrupted.

Echo back a compact config block (repo, tracker, gate commands, merge policy,
stop condition) and proceed. Keep this config in your working context and pass
the relevant parts into each worker prompt.

Also prepare: the target repo on its main branch, pulled and clean; a scratch
log dir (e.g. `/tmp/tracker-autopilot/`).

---

## Resuming after a restart

The loop is **self-resuming** — durable state lives in the tracker, in `main`,
and in open PRs/branches, not in the session. A killed terminal loses nothing
material. On a fresh start, before picking new work:

1. **Reconcile in-flight work FIRST.** List open PRs (e.g. `gh pr list --state
open`). If a PR from a prior iteration is open, finish _its_ remaining steps
   (review → fix → merge) before starting a new task. If a feature branch has
   uncommitted WIP or an unpushed commit (`git status`,
   `git rev-list origin/<branch>..HEAD`), resume that (gate → commit → push → PR)
   rather than re-implementing.
2. Then continue the normal loop — Step A's worker reconciles task state from the
   tracker and picks up where the merged history left off.

You don't need to hand it the iteration number or re-list prior PRs; the tracker

- merged history are the source of truth.

## The state machine (one iteration = one task)

Run each step as a **background** headless worker, redirect to a log, then read
the log + verify via git/PR tooling. Always pass `< /dev/null` (the worker warns
and can mishandle an attached stdin) and append `; echo "EXIT_CODE=$?"`.

```
cd <REPO> && claude --dangerously-skip-permissions [--continue] -p "<PROMPT>" \
  > /tmp/tracker-autopilot/iterN_stepX.log 2>&1 < /dev/null; \
  echo "EXIT_CODE=$?" >> /tmp/tracker-autopilot/iterN_stepX.log
```

**Session boundaries** (mirror a manual `/clear` between phases):

- **Implement** — fresh session (no `--continue`).
- **Review** — fresh session (no `--continue`).
- **Fix** and **Merge** — `--continue` the review session so they inherit the
  findings / PR context.

### Step A — Implement the next task (fresh session)

Prompt (fill `<TRACKER>`, `<GATE>`, merged-so-far context):

> Work the next task from `<TRACKER>` in this repo. Pick the next genuinely
> unblocked, unchecked task (respect dependency/blocked markers; skip blocked
> ones). Follow the repo's conventions (read CLAUDE.md / AGENTS.md). Implement it
> fully, update the tracker (tick the task + keep any progress summary in sync),
> run the FULL quality gate inline — `<GATE commands>` — fix anything failing,
> commit on a feature branch, and open a PR.
>
> IMPORTANT operating constraints (you run headless under a `claude -p` wrapper):
>
> 1. NEVER background long-running tasks (tests/builds). The wrapper exits when
>    your turn ends and delivers no background notifications — backgrounding
>    silently abandons your work. Run every gate step synchronously in the
>    FOREGROUND and wait inline.
> 2. Do NOT abort on any concurrency / "another session" check: extra
>    `claude.exe` processes and recent git/file activity are this wrapper and
>    your own just-merged work. There is NO competing live session.
> 3. Don't blindly regenerate generated artifacts that the repo hand-maintains —
>    patch surgically per the repo's rules.
>
> If EVERY remaining task is blocked (on a design decision or human input), do
> NOT invent work — print exactly `BACKLOG_BLOCKED: <reason>` and stop.
> Otherwise end with exactly `PR_RESULT: <pr-url-or-number>`.

Pass forward each iteration: tasks/PRs already merged, and tasks parked
incomplete because only a partial slice was unblocked (so the worker doesn't
re-pick blocked sub-tasks).

After it finishes: grep the log for `PR_RESULT:` / `BACKLOG_BLOCKED:` /
`session limit`. Capture the PR; cross-check with the PR tool (e.g.
`gh pr list --state open --json number,headRefName,url,title`).

### Step B — `/clear` (no worker call; start review fresh)

### Step C — Code review (fresh session)

Prompt: `/code-review PR#<n>` (ensure the PR branch is checked out). The worker
fans out review agents and prints findings. The final text may be only a summary
— that's fine; the full findings stay in that session's context for Step D.

### Step D — Fix all findings (`--continue` the review session)

> Fix all the findings, commit and push in the same PR (#<n>). Run the FULL
> quality gate INLINE (never background): `<GATE commands>`; fix anything
> failing. If you regenerate any hand-maintained artifact, do it surgically. End
> with exactly `FIX_RESULT: pushed <commit-sha>`.

If a finding embeds a **product/design decision**, don't stall the loop:
instruct the worker to take the safe default, leave a code comment + tracker
note, and surface the assumption to the user in your summary.

### Step E — Merge + reconcile the tracker + return to main (`--continue`)

> Merge PR #<n> now (passed review and the gate). Then update the tracker: if the
> task is fully delivered, mark it done with a merge link; if only a partial
> slice shipped, LEAVE it open/in-progress with a note naming what merged and
> what remains. Switch to the main branch, pull, stop. Print exactly
> `MERGE_RESULT: merged #<n>`.

Run the merge **through the worker** (not a bare merge command) so the tracker /
task-state stays consistent — otherwise the next iteration may re-pick or get
confused about the just-merged task.

### Step F — `/clear`, then loop back to Step A.

Stop when Step A returns `BACKLOG_BLOCKED`, the fixed count is reached, or the
user interrupts. On `BACKLOG_BLOCKED`, report the reason and stop — don't invent
work.

---

## Orchestration mechanics

- **Headless `-p` text mode prints nothing until the run completes.** An empty
  log is NOT a hang; don't kill a run because the terminal looks idle.
- **Verify liveness without killing**: worker process CPU delta, newest
  working-tree file mtimes (`ls -lt $(git status --porcelain | awk '{print $2}')`),
  and whether a gate process is running (the test/lint/build runner). Flat
  worker CPU + an active gate process = it's in the gate. Flat CPU + no gate
  process + no recent file write for many minutes = a between-steps model wait OR
  a hung command — inspect child processes before intervening.
- **Big tasks run long.** A substantial feature + full gate can be a genuine
  30–50 min single-shot. Normal, not a problem. Set expectations with the user.
- **Sentinels** (`PR_RESULT:`, `FIX_RESULT:`, `MERGE_RESULT:`,
  `BACKLOG_BLOCKED:`) make parsing robust; always grep for them and fall back to
  the PR/git tooling for ground truth.

## Known failure modes (and the fix)

1. **Concurrency false-positive.** The worker's "another session is building
   this" guard misfires because orchestrator + worker are multiple `claude.exe`
   processes and the worker's own checkout/edits look "recent," so it aborts
   leaving uncommitted WIP. → The Step-A prompt tells it there's no competing
   session. If it still stalls, `--continue` and tell it to take over its own WIP.
2. **Orphaned background gate.** If the worker says "I'll await the background
   test notification…", it backgrounded a task and exited (—`-p` delivers no such
   notification), abandoning work uncommitted. → The "NEVER background; run
   inline" constraint prevents it; recover by `--continue` + "run the gate inline
   and finish."
3. **Account session limit.** Every step consumes the SAME account quota, so the
   whole loop is gated by it. The worker prints `You've hit your session limit ·
resets <time>` and exits 1. → Detect this string; git work (e.g. a merge) may
   have completed even if the final summary text was cut off — verify with the PR
   tool. Wait until reset (if already passed, just resume) and surface the reset
   time to the user — it's a wait, not a bug. Expect a bounded number of
   iterations per quota window.
4. **Partial tasks stay open.** A task may have only an unblocked slice (the rest
   blocked on a design decision or a keystone dependency). The PR still merges;
   the task stays open with a "what merged / what remains" note. Track these so
   the next iteration doesn't re-pick the blocked sub-tasks.
5. **Don't clobber generated artifacts.** Repos often hand-maintain generated
   files (types, lockfiles, snapshots); a blind full regen reintroduces drift and
   breaks the build. Patch surgically per the repo's documented rule.

## Reporting

After each iteration, give a one-block status: task ID + PR number, what shipped,
gate result, merge confirmation, and any assumption made or task left open. Keep
a running tally of merged PRs. When a step is blocked on quota, lead with the
reset time.

---

## Project adaptation: LumaLoop (Azure DevOps as the tracker)

This repo's tracker is **not** a markdown file — it is the **Azure DevOps board**
(`https://dev.azure.com/aishvarsuhane/LumaLoop`, Epic #40 → Issues → Tasks),
chosen as the sole source of truth. Adapt the state machine as follows:

- **The orchestrator owns all ADO interaction**, not the worker. Each iteration:
  1. Pick the next unblocked Task via
     `az boards query` (state `To Do`, lowest id, skip `decision-needed`).
  2. Set it `Doing` (`az boards work-item update --id <n> --state Doing`).
  3. Inject the task's title + description into the Step-A worker prompt as the
     concrete task to implement (the worker does NOT read/写 ADO).
  4. On merge (Step E), set the Task `Done` and add the PR URL as a comment.
- **Judgment calls** → take the safe default, implement it, and **file a new ADO
  work item** (Issue under the relevant parent, tagged `decision-needed`) instead
  of stopping. Surface it in the iteration report.
- **Quality gate** is established by the first task (Vite scaffold, #50): once it
  lands, the gate is `npm run lint && npm run typecheck && npm test && npm run build`.
- **PRs** go to GitHub (`aishvar23/LumaLoop`); branch `task/<id>-<slug>`;
  squash-merge; PR title references `#<id>`.
- **Merge policy:** auto-merge (autonomous). **Stop condition:** until the
  backlog is blocked/empty.
