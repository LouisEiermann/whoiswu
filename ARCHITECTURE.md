WhoIsWu — Dharma Combat Engine (Implementation-Aligned)

## 1. Project Vision

WhoIsWu evaluates a two-party exchange and decides who is "closest to Emperor Wu":
the participant showing stronger attachment to merit, status, fixed conceptual certainty, or ego-defense.

The system is not:
- A scripture dumping machine
- A quote search engine
- A doctrinal authority
- A replacement for human teachers

The system is:
- A move-based conversational insight analyzer
- A Zen-style encounter evaluator
- A strict JSON reasoning engine with optional textual grounding

## 2. Current Implementation Snapshot

Current stack and flow in this repo:
- Frontend: Nuxt UI single-page flow (`/Users/louis/projects/whoiswu/pages/index.vue`)
- API endpoints:
  - `/api/judge` (primary)
  - `/api/discord/judge` (Discord transcript adapter)
- Judge core: `/Users/louis/projects/whoiswu/server/utils/judge.ts`
- Grounding corpus: `/Users/louis/projects/whoiswu/data/mahayana.ts`
- Persona prompts: `/Users/louis/projects/whoiswu/personas/*.md`
- Metric mapping docs: `/Users/louis/projects/whoiswu/mappings/*.md`

Current model strategy:
- Gemini call with strict JSON output expectation
- Schema validation via Zod
- Retry path for malformed output
- JSON repair attempt if retries still fail
- Normalization layer fills and calibrates metric fields

Safety rails currently present:
- Request guards and rate limits in backend guard layer
- Transcript length and speaker constraints
- Optional allowlist and timeout controls (env-based)

## 3. Design Philosophy

The architecture follows three principles:
- Move-based analysis over static personality scoring
- Endgame weighting over opening posture
- Scripture supports reasoning but does not replace analysis

Working metaphor:
- Each line is a move
- Positions shift
- Insight can deepen
- Attachment can reappear
- Final position matters most

## 4. System Layers

```text
Frontend
  ↓
Judge API
  ↓
Core Engine (Required, stable)
  ↓
Canon Retrieval (Planned, optional)
  ↓
Commentary Generator (Planned, optional)
```

Hard rule:
- Core Engine must function independently of Canon Retrieval.

## 5. Core Engine (Layer 1 — Required)

This layer must remain stable and deterministic in shape (even if model-generated in content).

### 5.1 Move Parsing

- Parse transcript into ordered turns
- Preserve speaker attribution
- Do not collapse raw turns into pre-summary before judgment

### 5.2 Move Evaluation Dimensions

Each move is evaluated across:
- Merit/status attachment
- Conceptual fixation
- Ego-defense
- Directness
- Non-dual clarity
- Reactivity/aggression
- Compassion

These features may be internal and not always fully surfaced to users.

### 5.3 Turning Point Detection

Detect high-impact events:
- Reversal
- Decisive cut
- Conceptual collapse
- Escalation into status combat
- Retreat into abstraction
- Strategic silence/non-answer

Turning points should be weighted higher than repetitive noise.

### 5.4 Final Position and Tie-Break Rules

Winner selection policy:
1. Final-position attachment signal dominates (latest strong stance carries priority).
2. If close, use turning-point severity and direction.
3. If still close, use aggregate attachment/fixation profile.
4. If still tied, lower confidence band and choose by least non-attachment evidence.

This avoids static personality scoring and rewards actual conversational movement.

### 5.5 Minimal Deterministic Scoring Contract

For internal consistency checks, keep a stable core score contract:
- `wuEnergy` (0-100)
- `delusionMeter` (0-100)
- `chanceOfEnlightenment` (0-100)
- `threePoisons` split with sum=100 when active

Behavioral constraints:
- Confidence always in [0,1]
- Output always schema-valid JSON
- Speaker winner always normalized to known participant list

## 6. Output Contract and Versioning

Current output shape includes:
- `winner`, `confidence`, `summary`
- Optional: `reasoning`, `citations`, `evidenceLinks`, verse fields
- Per-participant metrics bundle

Versioning policy:
- Additive changes only by default
- No silent rename/delete of existing keys
- If breaking changes are unavoidable, add explicit schema version key and migration note in README

## 7. Fallback and Failure Policy

Failure handling should be explicit and boring:
- Invalid model JSON -> retry with stricter instruction
- Still invalid -> repair attempt
- Quota/rate-limited -> clear 429 path
- Timeout -> clear timeout status path
- Any failure path must preserve parseable error response shape

Non-negotiable:
- Never emit unparseable response payload to frontend

## 8. Modes

Modes change presentation/persona intensity, not core verdict logic.

Current implemented mode switches:
- Scholar Mode
- Meme Mode

Current persona options:
- Dogen
- Linji
- Alan Watts

Mode responsibilities:
- Persona prompt flavor
- Output framing density
- Optional advanced explanation toggles

Mode must not bypass core winner logic.

## 9. Canon Module (Layer 2 — Planned)

Optional module; must not break Layer 1 independence.

Responsibilities:
- Canon storage and chunking
- Tagging by tradition/theme/tone
- Retrieval from detected conversational themes

Retrieval constraints:
- Inject small focused sets (target 5-15 chunks)
- Rank by relevance, recency of conversational move, and contradiction-reduction value
- Avoid dumping broad canon blocks into single request

## 10. Commentary and Traceability (Layer 3 — Optional)

Optional explanation mode for deeper auditability.

When enabled:
- Produce extended reasoning
- Return explicit quote -> citation -> why links (`evidenceLinks`)
- Surface rationale without changing winner logic

Advanced debug mode:
- Can echo exact prompt sent to Gemini for the specific request (`debugPrompt`)
- Intended for architecture and prompt audits, not default user flow

## 11. Observability

To keep drift manageable, log or retain (at least in dev):
- Input flags and active persona
- Winner and confidence
- Metrics summary
- Fallback path used (if any)
- Prompt-debug availability when enabled

Goal:
- Make model behavior inspectable without guessing hidden state.

## 12. Non-Goals (Now)

- No custom model training
- No multi-tradition maximal prompt dumps
- No real-time live combat scoring before core stability
- No doctrinal authority claims

## 13. Stability Gate Before Expansion

Before adding major new layers:
- Winner consistency should be acceptable on fixed transcript suites
- Schema should remain stable
- Metric behavior should not drift unpredictably across minor prompt edits
- Error handling should remain deterministic and parseable

Canon and commentary expansion come after these are reliable.

## 14. Guiding Principle

If architecture starts bloating, return to:

1. Parse moves
2. Evaluate attachment and clarity
3. Detect turning points
4. Decide final position

Everything else is optional.
