# whoiswu

A simple Nuxt fullstack meme project that judges a two-person argument and decides who is "closest to Emperor Wu" in the spirit of dharma combat.

## Stack
- Nuxt 4 (fullstack)
- Server-side Gemini API call
- Optional Discord-bot friendly endpoint
- Debuggable metric rubrics in `mappings/*.md`

## Quick start
1. Install deps:
   - `npm install`
2. Create `.env`:
   - `GEMINI_API_KEY=your_gemini_api_key`
   - `GEMINI_MODEL=gemini-2.0-flash`
   - Optional auto-fallback chain:
     - `GEMINI_MODELS=gemini-2.0-flash,gemini-2.5-flash,gemini-2.5-flash-lite`
   - Optional safety knobs (see `.env.example`):
     - `WHOISWU_MODEL_TIMEOUT_MS`
     - `WHOISWU_MAX_OUTPUT_TOKENS`
     - `WHOISWU_MAX_TRANSCRIPT_CHARS`
     - `WHOISWU_MAX_CHAT_TURNS`
     - `WHOISWU_MAX_SPEAKERS`
     - `WHOISWU_MAX_REQ_PER_MINUTE`
     - `WHOISWU_MAX_REQ_PER_DAY`
     - `WHOISWU_ALLOWLIST`
3. Run dev server:
   - `npm run dev`
4. Open:
   - `http://localhost:3000`

## API
### `POST /api/judge`
Body:
```json
{
  "chat": [
    { "speaker": "A", "text": "You are attached to good deeds." },
    { "speaker": "B", "text": "No merit." }
  ],
  "options": {
    "persona": "dogen",
    "includeReasoning": true,
    "includeCitations": true,
    "includeVerse": true,
    "strictMode": false
  }
}
```

### `POST /api/discord/judge`
Body:
```json
{
  "transcript": "A: ...\nB: ...",
  "persona": "linji",
  "includeReasoning": true,
  "includeCitations": true,
  "includeVerse": true
}
```

Available personas:
- `dogen`
- `linji`
- `alan-watts`

## Prompt Transparency
- Regenerate the exact all-flags Gemini prompt snapshot from live code:
  - `npm run prompt:example`
- Output file:
  - `/Users/louis/projects/whoiswu/docs/gemini-prompt-all-flags.txt`

## Gemini free-tier behavior
- If Gemini credits/quota are exhausted, the API returns HTTP `429` with a quota message.
- The browser can display this directly as a user-facing "out of credits" error.

## Friends-only safety defaults
This project includes lightweight backend guardrails:
- request limits per IP (minute/day)
- transcript length limit
- speaker count limit
- model timeout with fallback response
- optional IP allowlist mode for private usage
