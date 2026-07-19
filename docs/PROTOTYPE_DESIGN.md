# LumaLoop Prototype Design

## 1. Executive Summary

LumaLoop is not a clinical brain-training product or a general-purpose indie game marketplace. The prototype tests a narrower product thesis:

> People will complete a short, bounded feed of playable puzzle cards during moments when they would otherwise passively scroll.

The product category we are exploring is **short-form cognitive challenges**: active media cards built around memory, logic, attention, flexibility, speed, and pattern recognition. A LumaLoop card should feel as immediately accessible as a TikTok or Instagram post, but every card requires action: solve, tap, remember, compare, predict, reconstruct, or decide.

The prototype must prove the core behavior before any marketplace, creator economy, follower graph, monetization, or recommendation infrastructure is built.

## 2. Product Thesis

Existing platforms optimize for passive consumption and long sessions. Existing brain-training products carry trust baggage because broad cognitive improvement claims are difficult to prove. Existing game-publishing platforms treat games as destinations: users click a thumbnail, open a separate experience, and play outside the feed. LumaLoop should not become another broad game portal.

LumaLoop's core bet is different:

> A cognitive challenge can be a feed-native media object.

The initial format is a 1-3 minute bounded session made of lightweight, instantly playable cognitive challenge cards. Users receive a simple session receipt at the end and are encouraged to leave on time.

LumaLoop should track **challenge performance categories** before claiming stable personal traits. The product can honestly say a user is improving on memory-style cards or logic-style cards inside the platform. It should not claim that a user has globally improved memory, intelligence, or professional capability.

## 3. Market Positioning

LumaLoop should not claim uniqueness merely because creators can publish games or puzzles. That exists in adjacent markets. The platform is explicitly not trying to host arbitrary games.

Closest neighbors:

- TikTok, Instagram Reels, and YouTube Shorts: short-form discovery feeds, but mostly passive media.
- Lumosity, Elevate, Peak, BrainHQ, and similar products: closed brain-game libraries with trust baggage around broad cognitive claims.
- Brilliant, Duolingo, Chess.com puzzles, and NYT Games: active learning or puzzle loops, but not an open short-form creator feed.
- Roblox, itch.io, Game Jolt, Newgrounds, Scratch, and Fortnite UEFN: creator game platforms, but games are usually destinations, are often broad entertainment products, and do not center constrained cognitive challenge templates.
- Opal, one sec, Freedom, Forest, and ScreenZen: reduce passive scrolling, but mostly block or interrupt rather than replace it with an active alternative.

The defensible wedge:

> A bounded short-form cognitive challenge feed where every post is a playable memory, logic, attention, speed, flexibility, or pattern-recognition card, creators publish through structured templates, and quality is rewarded over addictive watch time.

This is the difference between a game marketplace and a cognitive challenge network.

## 4. Initial Audience

The prototype should target people who already feel tension around passive scrolling. Avoid broad consumer claims until one narrow audience shows repeat behavior.

Primary early players:

- Students who use short-form feeds while procrastinating
- Early-career professionals who scroll between tasks or meetings
- Engineers, analysts, designers, founders, and operators who already like problem-solving content
- Puzzle, Wordle, chess puzzle, Brilliant, Duolingo, or NYT Games users
- Productivity app users who have tried blockers but still want a satisfying replacement behavior

Primary user jobs:

- "I have 3 minutes and do not want to disappear into a passive feed."
- "I want a quick reset that feels playful, not like studying."
- "I want to challenge friends without committing to a full game."
- "I want proof I used my spare attention intentionally."

Excluded first audiences:

- Employers using scores for hiring or performance evaluation
- Clinical or medical populations
- Children-focused use cases
- Schools or institutions requiring validated learning outcomes

Those markets create trust, compliance, and evidence burdens that are inappropriate before the core consumer behavior is proven.

## 5. Prototype Goals

The prototype has two validation goals.

1. Validate player behavior.
   - Do users understand playable feed cards without instruction?
   - Do users complete a bounded 1-3 minute session?
   - Do users describe the experience as refreshing, playful, or satisfying rather than homework?
   - Do users return during future passive-scroll moments?

2. Validate creator interest manually.
   - Will creators submit puzzle ideas after seeing their content transformed into playable cards?
   - Do creators care about solve rate, completion rate, difficulty, and replay data?
   - Do creators share playable cards with their existing audience?

## 6. Non-Goals

The prototype must not include:

- Creator upload dashboards
- Public profiles
- Follower graph
- Payments or creator payouts
- Remix royalty logic
- Public leaderboards
- Clinical, medical, IQ, or employment-performance claims
- Full game engine support
- Arbitrary creator code execution
- App-blocking or social-media intercept integrations
- Complex personalization or recommendation models

These features only become relevant after the core behavior is validated.

## 7. Positioning Guardrails

Approved language:

- Active thinking
- Playable challenges
- Cognitive challenge categories
- Short-form active media
- Bounded sessions
- Challenge performance
- Replace passive scrolling
- Track improvement across challenge types
- Memory-style challenge performance
- Logic-style challenge performance

Avoid:

- Brain growth
- Boost IQ
- Improve intelligence
- Cure, prevent, or treat cognitive decline
- Improve job performance
- Become better at a profession
- Scientifically proven brain training

The prototype can measure task performance inside specific challenge templates. It cannot claim broad cognitive transfer.

Use "performance categories" in user-facing language before "traits." "Traits" imply stable underlying ability and require much stronger validation.

## 8. Core Experience

### 8.1 Session Start

The user chooses a small commitment:

- 1-minute rescue
- 3-minute reset

For the prototype, the default path is a 3-minute reset with 5-8 cards.

The start screen must include a short data notice and non-assessment disclaimer before a session starts.

### 8.2 Feed Card

Each card contains:

- Creator attribution
- Challenge category
- One short prompt
- One interaction surface
- Immediate success/failure feedback
- Optional explanation after resolution

The card must be playable directly in the feed. No separate loading screen, page transition, or modal game container.

### 8.3 Session End

After the bounded card count or timer completes, the app shows a session receipt:

- Cards completed
- Accuracy
- Fastest solved card
- Category mix for this session
- Exit badge when the user leaves on time

The primary action is to finish. Continuing is allowed, but it must be intentional.

### 8.4 Session Receipt

The session receipt is a product feature, not decorative UI. It turns bounded completion into the reward.

Prototype receipt fields:

- Session type
- Cards completed
- Accuracy
- Fastest correct card
- Category mix
- Exit badge when the user leaves on time

Avoid making the receipt a claim about intelligence or cognitive ability. It is a record of challenge performance.

## 9. Initial Templates

The initial templates must be constrained cognitive challenges, not arbitrary games. Each template should map to a challenge performance category and a small set of measurable execution signals.

### 9.1 Spot It

Purpose: Fast visual comprehension and first-session accessibility.

Mechanic:

- Show a grid of similar elements.
- One element is different.
- User taps the anomaly before the timer expires.

Why it belongs in the prototype:

- It is instantly understandable.
- It tests feed-native play with minimal instruction.
- It is easy to author manually.

Performance category:

- Visual attention / visual search

Signals:

- Time to first tap
- Correct tap rate
- False tap count
- Time to correct resolution

### 9.2 What Changed

Purpose: Short visual memory and attention.

Mechanic:

- Show a pattern for 2-4 seconds.
- Hide or alter the pattern.
- User identifies what changed.

Why it belongs in the prototype:

- It is simple but more cognitively active than visual search.
- It helps test whether users tolerate short memory load in a scroll context.

Performance category:

- Working memory / visual memory

Signals:

- Correct identification rate
- Delay tolerance
- Error type
- Time to answer

### 9.3 Rule Flip

Purpose: Rule switching and inhibition-like challenge behavior.

Mechanic:

- Start with a simple tap rule.
- Change the rule mid-card through a clear visual cue.
- User must adapt quickly.

Why it belongs in the prototype:

- It tests whether cognitive friction feels playful or stressful.
- It creates a distinctive active-media feel.

Performance category:

- Cognitive flexibility / inhibition-like control

Signals:

- Pre-switch accuracy
- Post-switch accuracy
- Switch latency
- Perseveration errors
- First failed step and failure reason
- Per-step action log for authored stimuli

Implementation note:

- Rule Flip requires per-stimulus timing to compute switch latency and perseveration errors. A card is correct only when every authored step is answered correctly. If the user watches the demo, it must use a separate pattern and communicate that it adds about 5 seconds to the overall solve time. If early testers cannot understand the template without the demo, replace it with Estimate Fast before the 7-day validation run.

### 9.4 Tiny Logic

Purpose: Lightweight reasoning without turning the feed into homework.

Mechanic:

- Present a concise contradiction, missing step, or one-move logic choice.
- User selects the correct answer.

Why it belongs in the prototype:

- It tests whether reasoning cards can work in short-form media.
- It opens the door to creator niches like math, LSAT, programming, and decision puzzles.

Performance category:

- Logical reasoning / pattern reasoning

Signals:

- Accuracy
- Time to answer
- Distractor choice
- Explanation viewed after error

### 9.5 Deferred Templates

These are attractive, but should wait until the first 4 templates prove the format:

- Sequence Recall
- Estimate Fast
- Pattern Complete
- Debug Hunt
- Spatial Rotation
- Confidence Calibration

## 10. Liquid Card Data Model

The prototype should render every card from local structured data. This proves that a puzzle can behave like a lightweight media object rather than a destination game.

```ts
type ChallengeCategory =
  | 'visual_attention'
  | 'working_memory'
  | 'logical_reasoning'
  | 'cognitive_flexibility'
  | 'pattern_recognition'
  | 'processing_speed';

type EvidenceTier =
  | 'entertainment_only'
  | 'mechanic_mapped'
  | 'telemetry_calibrated'
  | 'benchmark_probe';

type TemplateType =
  | 'spot_it'
  | 'what_changed'
  | 'rule_flip'
  | 'tiny_logic';

type Difficulty =
  | 'extremely_easy'
  | 'easy'
  | 'medium'
  | 'hard'
  | 'extremely_hard';

type LiquidCard = {
  cardId: string;
  creatorHandle: string;
  templateType: TemplateType;
  category: ChallengeCategory;
  difficulty: Difficulty;
  evidenceTier: EvidenceTier;
  reviewStatus: 'unreviewed' | 'manual_reviewed';
  estimatedSeconds: number;
  prompt: string;
  puzzleDna: {
    mechanic: string;
    inputMode: 'tap' | 'drag' | 'choice' | 'sequence';
    measuredSignals: string[];
  };
  config: Record<string, unknown>;
  answer: Record<string, unknown>;
  explanation: {
    title: string;
    body: string;
  };
  shareText?: string;
};
```

Example:

```json
{
  "cardId": "spot_it_001",
  "creatorHandle": "LumaLoop",
  "templateType": "spot_it",
  "category": "visual_attention",
  "difficulty": "easy",
  "evidenceTier": "mechanic_mapped",
  "reviewStatus": "manual_reviewed",
  "estimatedSeconds": 12,
  "prompt": "Find the symbol that breaks the pattern.",
  "puzzleDna": {
    "mechanic": "single_anomaly_visual_search",
    "inputMode": "tap",
    "measuredSignals": ["time_to_first_tap", "correct_tap", "elapsed_ms"]
  },
  "config": {
    "grid": {
      "rows": 5,
      "columns": 5,
      "baseElement": "AX7",
      "anomalyElement": "A7X"
    }
  },
  "answer": {
    "row": 3,
    "column": 4
  },
  "explanation": {
    "title": "Pattern Break",
    "body": "The anomaly swapped the final two characters while preserving the same visual density."
  },
  "shareText": "I spotted the anomaly in LumaLoop."
}
```

The Technical Design owns the canonical implementation vocabulary. Product copy may say "memory-style" or "logic-style," but stored categories must use the canonical enum above.

Template to category map:

```ts
const templateCategoryMap: Record<TemplateType, ChallengeCategory[]> = {
  spot_it: ['visual_attention', 'processing_speed'],
  what_changed: ['working_memory', 'visual_attention'],
  rule_flip: ['cognitive_flexibility', 'processing_speed'],
  tiny_logic: ['logical_reasoning', 'pattern_recognition'],
};
```

## 11. Evidence Tiers

Not every creator card should affect a user's performance profile equally. Measurement quality must be explicit.

### 11.1 Entertainment Only

Fun cards that may be shared, liked, and replayed. These do not update performance categories.

Entertainment-only cards may appear in session mix reporting, but they must be excluded from current and future category performance calculations.

Use for:

- Novel creator experiments
- Humor puzzles
- Unreviewed cards
- Cards with ambiguous scoring

### 11.2 Mechanic-Mapped

Cards built on approved templates with clear scoring and a known challenge category. These can contribute to low-confidence category summaries.

Use for:

- Spot It visual-attention cards
- What Changed memory cards
- Rule Flip flexibility cards
- Tiny Logic reasoning cards

### 11.3 Telemetry-Calibrated

Cards with enough user data to estimate difficulty, fairness, solve-rate bands, common errors, and abandonment patterns. These can influence category performance more strongly.

Do not manually label a card as calibrated. It must earn calibration through usage data.

### 11.4 Benchmark Probe

Official controlled tasks used to compare a user's performance over time. These should be created by LumaLoop, not arbitrary creators, until external validation exists.

Use for:

- Baseline sessions
- Monthly progress checks
- Held-out challenge probes

## 12. User Performance Model

The prototype should show only simple session-level performance. The MVP can introduce category profiles.

Initial categories:

- Visual attention
- Working memory
- Logical reasoning
- Cognitive flexibility
- Pattern recognition
- Processing speed

Signals:

- Accuracy
- Solve time
- Time to first action
- Error count
- Error type
- Retry count
- Timeout/abandon behavior
- Improvement curve

Important language rule:

> "Your recent working-memory challenge performance improved" is acceptable.

Avoid:

> "Your memory improved."

Performance categories are observations from in-app tasks. They are not diagnoses, IQ measures, employment assessments, or clinical cognitive scores.

## 13. Minimal Technical Architecture

The prototype should be intentionally simple.

Recommended first implementation:

- Mobile-first web app
- Local hardcoded card array
- One feed controller
- One renderer per template
- One session receipt component
- Lightweight telemetry integration

No product backend is required for the first build, but telemetry must be captured reliably through a hosted analytics tool or simple event endpoint. The `/c/:cardId` share route should be static and backed by the local catalog.

## 14. Telemetry Events

Behavioral validation depends on logs, not compliments.

Required events:

- `Session_Initialized`
- `Card_Rendered`
- `Card_Attempted`
- `Card_Resolved`
- `Card_Explanation_Viewed`
- `Session_Completed`
- `Session_Abandoned`
- `Receipt_Shared`
- `Exit_Clicked`
- `Intentional_Continue_Clicked`
- `Return_Session_Started`

Core event fields:

```ts
type TelemetryEvent = {
  eventName: string;
  anonymousUserId: string;
  sessionId: string;
  cardId?: string;
  templateType?: TemplateType;
  category?: ChallengeCategory;
  timestampMs: number;
  elapsedMs?: number;
  interactionElapsedMs?: number;
  isCorrect?: boolean;
  resolutionType?: 'correct' | 'incorrect' | 'timeout';
  attemptCount?: number;
  evidenceTier?: EvidenceTier;
  measuredSignals?: string[];
  difficulty?: Difficulty;
  routeKind?: 'session' | 'card_deep_link';
  abandonedAtCardIndex?: number;
  source?: 'direct' | 'reminder' | 'share' | 'manual_test';
};
```

Telemetry semantics:

- `Card_Rendered` means the card became active/focused, not merely mounted.
- `Card_Attempted` timing starts when input is enabled. Preview-based templates like `what_changed` should not be penalized for their preview period.
- Timeouts resolve as `resolutionType: 'timeout'`, `isCorrect: false`, and count as resolved incorrect cards, not skipped cards.
- There is no user-facing skip in the prototype.
- `Session_Abandoned` should be captured with best-effort browser lifecycle events and treated as an undercount.

## 15. Validation Metrics

The prototype is promising if it shows:

- 70%+ first-session completion
- Median time to first interaction under 3 seconds on simple cards, measured from interaction-enabled time and interpreted per template
- No single template responsible for disproportionate abandonment
- 35%+ of testers start direct, unprompted sessions on at least 3 days during a 7-day test
- Users voluntarily share receipts or ask for more cards
- Users describe the experience as playful or refreshing, not studious or draining
- Creators submit additional puzzle ideas after seeing their first cards rendered
- Users understand that category scores are task performance, not intelligence labels

These thresholds are directional. The real goal is to identify whether there is a repeatable active-scroll behavior. Prompted returns are useful for debugging, but they should not be treated as proof of organic substitution.

## 16. Prototype Experiment Protocol

The prototype must test behavior in real scroll moments, not only in a scheduled demo.

### 16.1 Player Test

Recruit 50-100 people who already use short-form social media daily.

Ask each tester to choose one danger moment:

- After waking up
- Between meetings or classes
- Lunch break
- Midday slump
- Before bed
- While procrastinating

Instruction:

> When you would normally open a passive feed, try one LumaLoop reset first.

Run the test for 7 days.

Protocol:

- Days 1-3 may include reminders or explicit prompts.
- Days 4-7 should include no reminder from the team.
- The headline return metric uses only `source: 'direct'` sessions.
- `localStorage` identity is best-effort and cannot reliably track private browsing, cache clearing, browser changes, or cross-device behavior.

Collect:

- Telemetry events
- Day-2 and day-7 return behavior, separated by `source`
- One short post-session survey
- 10-15 follow-up interviews after usage

Behavioral data is primary. Interviews are used to explain why behavior happened.

### 16.2 Creator Test

Run this separately from player validation. Creators should not need a full creator tool in the prototype phase.

Show creators 2-3 playable cognitive challenge examples. Then ask for 3-5 short puzzle ideas and convert them manually into approved templates.

Do not ask, "Would you join this platform?" Ask for the next concrete action:

> Send me three puzzle ideas and I will turn them into playable cognitive challenge cards that credit you as a founding creator.

Creator sharing is part of prototype validation only through a static per-card route:

- `/c/:cardId` opens a single creator-attributed card.
- The route renders from the local catalog; it is not a creator profile or public publishing system.
- Share arrivals should log `source: 'share'` and `routeKind: 'card_deep_link'`.

## 17. Creator Validation Plan

Do not ask creators to join a platform. Ask them to contribute intellect.

Target early creators:

- Math puzzle creators
- Chess puzzle creators
- Coding interview creators
- Logic and riddle creators
- LSAT, SAT, GMAT tutors
- Data science educators
- Productivity creators
- Escape-room designers

Outreach framing:

> I like the way you explain hard thinking problems. Send me 3-5 short puzzle ideas and I will turn them into polished playable cognitive challenge cards that credit you as a founding creator.

Creator success signals:

- They submit puzzle ideas.
- They submit a second batch after seeing the playable version.
- They share their cards.
- They ask for analytics.
- They ask about creator profiles, paid packs, or recurring drops.

Creator benefits that must become true over time:

- No-code interactive creation
- Better engagement than static riddles or videos
- Performance analytics beyond views and likes
- Discovery for high-quality challenges
- Reputation and category ownership
- Paid packs, subscription pools, or sponsor drops after demand exists

Early creator program:

- Invite-only founding creator cohort
- Manual conversion of creator ideas into playable cards
- Founding creator badge
- Featured launch placement
- Early analytics dashboard
- Public credit on every card

Do not lead with money before there is player demand. Lead with a new medium, distribution, and status.

## 18. Creator Constraints

Creator freedom should live inside validated structures. LumaLoop should not accept arbitrary creator games in early versions.

Creator submissions should be constrained by:

- Approved templates
- Clear answer keys
- Time limits
- Explanation requirements
- Difficulty previews
- Category labels
- Review status
- No arbitrary code execution

This preserves quality, safety, and measurement integrity while still allowing creative expression through theme, domain, wording, visual style, and puzzle content.

## 19. Session Composition

The prototype should avoid uncontrolled random feeds during validation.

Rules:

- Use a fixed seeded order per tester and test day.
- Balance categories where possible.
- Start with extremely easy/easy cards and ramp toward medium difficulty.
- Avoid more than two cards from the same template in a row.
- Use `estimatedSeconds` to keep session length within the chosen mode.

The "3-minute reset" is an approximate commitment. In practice, the prototype may be card-count bounded if users solve quickly.

## 20. Future Platform Mechanics

These are important for the full product vision, but they are explicitly deferred until after prototype validation.

### 20.1 Puzzle DNA

Every card should eventually expose a visible identity:

- Mechanic
- Duration
- Difficulty
- Solve rate
- Fairness score
- Remix lineage
- Challenge category
- Evidence tier
- Measured signals

This builds trust and makes puzzles feel like a new media object.

### 20.2 Remix Trees

Creators should eventually be able to remix puzzle logic while changing theme, content, or domain. This is the equivalent of using a TikTok sound or remixing a format.

Example:

- Original mechanic: visual anomaly search.
- Remixes: code bug hunt, fraud pattern hunt, grammar trap, chart anomaly, chess tactic.

Attribution must be preserved. Revenue-sharing on remix trees should not be built until creator demand and anti-fraud controls exist.

### 20.3 Challenge Strips

Creators should publish sequences, not only individual cards.

Examples:

- 3-minute founder reset
- Engineer debug warmup
- Morning logic strip
- No-scroll night reset

### 20.4 Feed-Native Duels and Ghost Runs

Users should eventually be able to challenge friends asynchronously and compare solve traces. This creates social energy without requiring real-time multiplayer lobbies.

### 20.5 Quality-Weighted Monetization

Future creator payouts should reward:

- Completion quality
- User rating
- Low frustration
- Low report rate
- Explanation quality
- Saves and follows
- Replay without confusion
- Originality and remix value

Do not pay only for raw plays or time spent.

## 21. Risks

### 21.1 Product Risk

The feed could feel like homework rather than entertainment. The first cards must be visual, immediate, and satisfying.

RuleFlip needs a small comprehension gate before the 7-day test. If early testers cannot understand it without extra explanation, replace it with a simpler template such as Estimate Fast.

### 21.2 Trust Risk

If the app claims cognitive improvement too early, it inherits brain-training skepticism. The prototype must use challenge-performance language and distinguish in-app performance categories from broad cognitive traits.

### 21.3 Marketplace Risk

Open UGC will produce low-quality content, copied puzzles, spam, and unfair challenges. The creator platform should remain curated until quality controls exist.

### 21.4 Incentive Risk

Paying for plays creates clickbait and bots. Future monetization must reward fairness, originality, completion quality, and user satisfaction.

### 21.5 Anti-Doomscroll Risk

If the feed becomes endless, the product loses its moral distinction. Bounded sessions are not a feature; they are part of the brand contract.

### 21.6 Safety and Moderation Risk

If the platform allows creator content, moderation must eventually handle offensive content, copied puzzles, low-effort AI spam, impossible "gotcha" puzzles, minors, harassment, and unsafe external links. The prototype avoids this by using manually selected content.

### 21.7 Cheating and Fraud Risk

Leaderboards, prizes, and payouts create bot and fraud incentives. Public competitive rankings and money should wait until anti-cheat, replay validation, rate limits, and dispute workflows exist.

### 21.8 Privacy Risk

Reaction time, accuracy, and session behavior can feel sensitive if framed as intelligence or professional ability. Telemetry should be anonymized in the prototype, and any future user profile must explain what is collected and what is not inferred. The start screen must include a short data notice and non-assessment disclaimer.

### 21.9 Measurement Integrity Risk

If creator cards directly update user "traits" without calibration, the platform will produce shallow or misleading profiles. Only mechanic-mapped, telemetry-calibrated, or benchmark-probe cards should affect performance summaries, and confidence levels must be visible.

### 21.10 Novelty Risk

A 7-day prompted test can overstate demand because the experience is new and testers know the founder wants feedback. Day-7 direct returns and unprompted sessions are stronger signals than early prompted completions.

## 22. Build Sequence

### Prototype

- Local puzzle data
- 4 templates
- 20-30 cards
- Bounded session
- Session receipt
- Telemetry
- Static `/c/:cardId` route for share testing
- Manual creator conversion
- Session-level category performance only

### MVP

- Accounts
- Creator profiles
- Follow feed
- Simple creator editor
- Moderation queue
- Shareable cards
- Creator analytics
- Curated discovery
- Mechanic-mapped category profiles
- Evidence-tier labels

### Platform

- Monetization
- Remix trees
- Revenue share
- Anti-cheat
- Tournament modes
- Sponsored challenge drops
- Optional social-media intercept
- Telemetry-calibrated challenge scoring
- Benchmark probes

## 23. Decision Rules

After the prototype test, use these decision rules:

- If users complete sessions but do not return directly during the unprompted window, improve card fun, novelty, and danger-moment fit before building platform features.
- If users return but say it feels like homework, reduce text-heavy cards and bias toward visual, playful templates.
- If users want endless play but dislike bounded endings, revisit session design without abandoning the anti-doomscroll contract.
- If creators praise the idea but do not submit puzzle ideas, the creator value proposition is weak.
- If creators submit content but users do not enjoy it, curation and template quality are the bottleneck.
- If users misinterpret category performance as intelligence scoring, rewrite labels and dashboard language before scaling.
- If both users and creators show repeat behavior, proceed to an MVP with profiles, a simple editor, curated discovery, and analytics.

## 24. Principal Engineering Decision

The prototype should optimize for learning speed, not architectural completeness.

Use local card data and a simple render loop. Keep the card schema strict enough to prove feed-native cognitive challenge cards, but avoid general-purpose engine complexity. If the prototype does not create repeat behavior, marketplace infrastructure does not matter.

The first technical milestone is not a scalable platform. It is one convincing moment:

> A user opens LumaLoop instead of passively scrolling, completes a short playable session, feels satisfied, and willingly exits.
