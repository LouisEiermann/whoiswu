import { z } from 'zod'
import { MAHAYANA_CHUNKS } from '../../data/mahayana'
import { readFile } from 'node:fs/promises'

const TurnSchema = z.object({
  speaker: z.string().min(1),
  text: z.string().min(1).max(1200)
})

const MAX_CHAT_TURNS = Number(process.env.WHOISWU_MAX_CHAT_TURNS || 300)

const PersonaSchema = z.enum(['dogen', 'linji', 'alan-watts'])
const METRIC_MAPPING_FILES = [
  'mappings/wu-energy.md',
  'mappings/enlightenment.md',
  'mappings/delusion.md',
  'mappings/three-poisons.md',
  'mappings/samsara-realms.md',
  'mappings/practice-recommendations.md'
]

function normalizePersona(value: unknown): z.infer<typeof PersonaSchema> {
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase().replace(/\s+/g, '-')
    if (v === 'alan' || v === 'alan-watts') return 'alan-watts'
    if (v === 'dogen') return 'dogen'
    if (v === 'linji') return 'linji'
    if (v === 'default' || v === 'default-judge') return 'dogen'
  }

  if (value && typeof value === 'object') {
    const obj = value as { value?: unknown; label?: unknown }
    return normalizePersona(obj.value ?? obj.label)
  }

  return 'dogen'
}

export const JudgeInputSchema = z.object({
  chat: z.array(TurnSchema).min(2).max(MAX_CHAT_TURNS),
  options: z
    .object({
      includeReasoning: z.boolean().default(true),
      includeCitations: z.boolean().default(true),
      includeTraceability: z.boolean().default(false),
      includeMoveTrace: z.boolean().default(false),
      debugPromptEcho: z.boolean().default(false),
      includeVerse: z.boolean().default(false),
      persona: z.preprocess(normalizePersona, PersonaSchema).default('dogen'),
      strictMode: z.boolean().default(false)
    })
    .default({})
})

export type JudgeInput = z.infer<typeof JudgeInputSchema>

const ThreePoisonsSchema = z.object({
  greed: z.number(),
  hate: z.number(),
  ignorance: z.number()
})

const MoveTraceItemSchema = z.object({
  move: z.number().optional(),
  index: z.number().optional(),
  speaker: z.string().optional(),
  quote: z.string().optional(),
  delusionDelta: z.number().optional(),
  wuEnergyDelta: z.number().optional(),
  clarityDelta: z.number().optional(),
  positionScore: z.number().optional(),
  commentary: z.string().optional(),
  verse: z.string().optional()
})

const ParticipantMetricSchema = z.object({
  speaker: z.string().optional(),
  wuEnergy: z.number().optional(),
  chanceOfEnlightenment: z.number().optional(),
  delusionMeter: z.number().optional(),
  samsaraRealm: z.string().optional(),
  samsaraRealmDescription: z.string().optional(),
  samsaraRealmReason: z.string().optional(),
  recommendedPractice: z.string().optional(),
  recommendedPracticeReason: z.string().optional(),
  recommendedPracticeList: z.array(z.string()).optional(),
  threePoisons: ThreePoisonsSchema.optional(),
  poisonProfileActive: z.unknown().optional(),
  wuEnergyReason: z.string().optional(),
  enlightenmentReason: z.string().optional(),
  delusionReason: z.string().optional(),
  threePoisonsReason: z.string().optional(),
  greedReason: z.string().optional(),
  hateReason: z.string().optional(),
  ignoranceReason: z.string().optional(),
  enlightenmentText: z.string().optional()
})

const JudgeOutputSchema = z.object({
  winner: z.string(),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  reasoning: z.string().optional(),
  citations: z
    .array(
      z.union([
        z.string(),
        z.object({
          id: z.string().optional(),
          label: z.string().optional(),
          title: z.string().optional(),
          source: z.string().optional(),
          citation: z.string().optional(),
          text: z.string().optional()
        })
      ])
    )
    .optional(),
  verseChinese: z.string().optional(),
  verseTranslation: z.string().optional(),
  evidenceLinks: z
    .array(
      z.object({
        citation: z.string(),
        chatQuote: z.string(),
        why: z.string(),
        speaker: z.string().optional(),
        appliedRule: z.string().optional()
      })
    )
    .optional(),
  moveTrace: z.array(MoveTraceItemSchema).optional(),
  moveTraceFallbackUsed: z.boolean().optional(),
  participantMetrics: z.array(ParticipantMetricSchema).optional(),
  fallbackUsed: z.boolean().optional(),
  fallbackReason: z.string().optional()
})

const MoveTraceOnlySchema = z.object({
  moveTrace: z.array(MoveTraceItemSchema).min(1)
})

const ParticipantMetricsOnlySchema = z.object({
  participantMetrics: z.array(ParticipantMetricSchema).min(1)
})

type HttpError = Error & { statusCode?: number }

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    finishReason?: string
  }>
  promptFeedback?: {
    blockReason?: string
  }
  error?: {
    code?: number
    message?: string
    status?: string
  }
}

const CITATION_LABEL_BY_ID = new Map(MAHAYANA_CHUNKS.map((c) => [c.id, c.citationLabel]))
const KNOWN_CITATION_LABELS = new Set(MAHAYANA_CHUNKS.map((c) => c.citationLabel))

function buildTranscript(chat: Array<{ speaker: string; text: string }>) {
  return chat.map((t, i) => `${i + 1}. ${t.speaker}: ${t.text}`).join('\n')
}

async function loadAgentPrompt() {
  try {
    return await readFile('AGENTS.md', 'utf8')
  } catch {
    return 'You are a strict JSON-only judge.'
  }
}

async function loadPersonaPrompt(persona: z.infer<typeof PersonaSchema>) {
  const path = `personas/${persona}.md`
  try {
    return await readFile(path, 'utf8')
  } catch {
    return await readFile('personas/dogen.md', 'utf8')
  }
}

async function loadMetricMappingsPrompt() {
  const blocks: string[] = []

  for (const path of METRIC_MAPPING_FILES) {
    try {
      const body = await readFile(path, 'utf8')
      blocks.push(`--- ${path} ---\n${body}`)
    } catch {
      // Ignore missing mapping files, we keep deterministic fallback logic in code.
    }
  }

  return blocks.join('\n\n')
}

function createHttpError(statusCode: number, message: string): HttpError {
  const err = new Error(message) as HttpError
  err.statusCode = statusCode
  return err
}

function extractJsonFromText(text: string) {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1]) return fenced[1]

  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  if (unfenced.startsWith('{') && unfenced.endsWith('}')) return unfenced

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1)
  }

  return trimmed
}

function parseJudgeJson(rawText: string) {
  const candidates = [
    rawText,
    extractJsonFromText(rawText)
  ]

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      // Try next candidate
    }
  }

  const cleaned = extractJsonFromText(rawText)
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(cleaned.slice(start, end + 1))
  }

  throw createHttpError(502, 'Model returned invalid JSON')
}

function shouldRetryStructuredOutput(error: unknown) {
  const message = (error as Error)?.message?.toLowerCase() || ''
  return (
    message.includes('invalid json') ||
    message.includes('unexpected token') ||
    message.includes('json') ||
    message.includes('required') ||
    message.includes('invalid_type') ||
    message.includes('too_small') ||
    message.includes('too_big')
  )
}

async function repairJsonPayload(rawText: string, timeoutMs: number) {
  const repairPrompt = [
    'You are a JSON repair tool.',
    'Fix the following malformed JSON into VALID JSON.',
    'Output JSON only.',
    'Do not add markdown fences, comments, or extra keys.',
    '',
    rawText
  ].join('\n')

  return callGemini(repairPrompt, timeoutMs)
}

function normalizeCitations(
  citations?: Array<
    | string
    | {
      id?: string
      label?: string
      title?: string
      source?: string
      citation?: string
      text?: string
    }
  >
) {
  if (!citations?.length) return undefined

  const normalized = citations.map((c) => {
    const raw = typeof c === 'string'
      ? c
      : c.label || c.title || c.source || c.citation || c.id || c.text || ''
    if (!raw) return ''
    const cleaned = raw.trim()
    if (!cleaned) return ''

    if (KNOWN_CITATION_LABELS.has(cleaned)) return cleaned
    return CITATION_LABEL_BY_ID.get(cleaned) || cleaned
  }).filter(Boolean)

  const deduped = normalized.map((c) => {
    if (KNOWN_CITATION_LABELS.has(c)) return c
    return CITATION_LABEL_BY_ID.get(c) || c
  })

  return [...new Set(deduped)]
}

function normalizeEvidenceLinks(
  links?: Array<{
    citation?: string
    chatQuote?: string
    why?: string
    speaker?: string
    appliedRule?: string
  }>
) {
  if (!links?.length) return undefined

  const normalized = links
    .map((link) => {
      const rawCitation = (link.citation || '').trim()
      const citation = KNOWN_CITATION_LABELS.has(rawCitation)
        ? rawCitation
        : CITATION_LABEL_BY_ID.get(rawCitation) || rawCitation
      const chatQuote = (link.chatQuote || '').trim()
      const why = (link.why || '').trim()
      const speaker = (link.speaker || '').trim()
      const appliedRule = (link.appliedRule || '').trim()
      if (!citation || !chatQuote || !why) return null
      return {
        citation,
        chatQuote,
        why,
        speaker: speaker || undefined,
        appliedRule: appliedRule || undefined
      }
    })
    .filter(Boolean) as Array<{
    citation: string
    chatQuote: string
    why: string
    speaker?: string
    appliedRule?: string
  }>

  if (!normalized.length) return undefined

  return normalized.filter(
    (item, index, arr) =>
      arr.findIndex(
        (x) => x.citation === item.citation && x.chatQuote === item.chatQuote && x.why === item.why
      ) === index
  )
}

function clampSigned(value: number, min = -100, max = 100) {
  if (!Number.isFinite(value)) return 0
  return Math.max(min, Math.min(max, Math.round(value)))
}

function normalizeMoveTrace(
  trace: Array<{
    move?: number
    index?: number
    speaker?: string
    quote?: string
    delusionDelta?: number
    wuEnergyDelta?: number
    clarityDelta?: number
    positionScore?: number
    commentary?: string
    verse?: string
  }> | undefined,
  chat: Array<{ speaker: string; text: string }>
) {
  if (!trace?.length) return undefined

  const speakerOrder = [...new Set(chat.map((t) => (t.speaker || '').trim()).filter(Boolean))]
  const firstSpeaker = speakerOrder[0] || ''
  const secondSpeaker = speakerOrder[1] || ''
  const speakerScores = new Map<string, number>()
  let runningPosition = 0
  const normalized = trace
    .slice(0, chat.length)
    .map((item, idx) => {
      const turn = chat[idx]
      const move = Number.isFinite(item.move) ? Number(item.move) : Number.isFinite(item.index) ? Number(item.index) + 1 : idx + 1
      const quote = (item.quote || turn?.text || '').trim()
      const speaker = (item.speaker || turn?.speaker || '').trim() || `Speaker ${idx + 1}`
      const delusionDelta = clampSigned(Number(item.delusionDelta ?? 0), -30, 30)
      const wuEnergyDelta = clampSigned(Number(item.wuEnergyDelta ?? 0), -30, 30)
      const clarityDelta = clampSigned(Number(item.clarityDelta ?? 0), -30, 30)
      const rawSignal = wuEnergyDelta + delusionDelta - clarityDelta
      const moveSignal = clampSigned(Math.round(rawSignal / 3), -15, 15)
      const currentSpeakerScore = speakerScores.get(speaker) || 0
      speakerScores.set(speaker, currentSpeakerScore + moveSignal)

      if (firstSpeaker && secondSpeaker) {
        const firstScore = speakerScores.get(firstSpeaker) || 0
        const secondScore = speakerScores.get(secondSpeaker) || 0
        runningPosition = clampSigned(firstScore - secondScore, -100, 100)
      } else {
        runningPosition = clampSigned(runningPosition + moveSignal, -100, 100)
      }

      return {
        move: clampSigned(move, 1, 999),
        speaker,
        quote: quote || '(empty move)',
        delusionDelta,
        wuEnergyDelta,
        clarityDelta,
        positionScore: runningPosition,
        commentary: (item.commentary || '').trim() || undefined,
        verse: (item.verse || '').trim() || undefined
      }
    })
    .filter((x) => x.quote)

  if (!normalized.length) return undefined
  return normalized
}

function hasUsefulParticipantMetrics(
  metrics: Array<z.infer<typeof ParticipantMetricSchema>> | undefined,
  speakers: string[]
) {
  if (!metrics?.length || !speakers.length) return false
  const bySpeaker = new Map((metrics || []).map((m) => [(m.speaker || '').trim(), m]))
  const aligned = speakers.map((s) => bySpeaker.get(s)).filter(Boolean) as Array<z.infer<typeof ParticipantMetricSchema>>
  if (!aligned.length) return false

  const hasAnySignal = aligned.some((m) =>
    Number.isFinite(m.wuEnergy) ||
    Number.isFinite(m.delusionMeter) ||
    Number.isFinite(m.chanceOfEnlightenment) ||
    !!m.wuEnergyReason ||
    !!m.delusionReason ||
    !!m.enlightenmentReason
  )
  if (!hasAnySignal) return false

  if (aligned.length >= 2) {
    const a = aligned[0]
    const b = aligned[1]
    const sameWu = Number(a.wuEnergy ?? 50) === Number(b.wuEnergy ?? 50)
    const sameDelusion = Number(a.delusionMeter ?? 50) === Number(b.delusionMeter ?? 50)
    const sameEnlightenment = Number(a.chanceOfEnlightenment ?? 50) === Number(b.chanceOfEnlightenment ?? 50)
    if (sameWu && sameDelusion && sameEnlightenment) return false
  }

  return true
}

function alignConfidenceWithMetrics(
  winner: string,
  confidence: number,
  participantMetrics: ReturnType<typeof normalizeParticipantMetrics>
) {
  if (!participantMetrics?.length) return confidence
  const winnerMetric = participantMetrics.find((m) => m.speaker === winner)
  const loserMetric = participantMetrics.find((m) => m.speaker !== winner)
  if (!winnerMetric || !loserMetric) return confidence

  const wuGap = (winnerMetric.wuEnergy || 0) - (loserMetric.wuEnergy || 0)
  const delusionGap = (winnerMetric.delusionMeter || 0) - (loserMetric.delusionMeter || 0)
  const evidenceGap = Math.max(wuGap, delusionGap)
  const bumped = Math.max(confidence, 0.5 + Math.min(0.45, Math.max(0, evidenceGap) / 100))
  return Math.max(0, Math.min(1, Number(bumped.toFixed(2))))
}

function wuClosenessFromMetric(metric: {
  wuEnergy?: number
  delusionMeter?: number
  chanceOfEnlightenment?: number
}) {
  const wuEnergy = clampPercent(metric.wuEnergy ?? 50)
  const delusion = clampPercent(metric.delusionMeter ?? 50)
  const antiEnlightenment = 100 - clampPercent(metric.chanceOfEnlightenment ?? 50)
  return (wuEnergy * 0.5) + (delusion * 0.35) + (antiEnlightenment * 0.15)
}

function winnerFromMetrics(
  participantMetrics: ReturnType<typeof normalizeParticipantMetrics>,
  speakers: string[]
) {
  if (!participantMetrics?.length || speakers.length < 2) return { winner: undefined as string | undefined, gap: 0 }
  const bySpeaker = new Map(participantMetrics.map((m) => [m.speaker, m]))
  const first = bySpeaker.get(speakers[0])
  const second = bySpeaker.get(speakers[1])
  if (!first || !second) return { winner: undefined as string | undefined, gap: 0 }

  const firstScore = wuClosenessFromMetric(first)
  const secondScore = wuClosenessFromMetric(second)
  const gap = Number((firstScore - secondScore).toFixed(2))
  if (Math.abs(gap) < 2) return { winner: undefined as string | undefined, gap }
  return { winner: gap >= 0 ? speakers[0] : speakers[1], gap }
}

function winnerFromMoveTrace(
  moveTrace: ReturnType<typeof normalizeMoveTrace>,
  speakers: string[]
) {
  if (!moveTrace?.length || speakers.length < 2) return { winner: undefined as string | undefined, gap: 0 }
  const last = moveTrace[moveTrace.length - 1]
  const gap = clampSigned(Number(last?.positionScore ?? 0), -100, 100)
  if (!Number.isFinite(gap) || Math.abs(gap) < 2) return { winner: undefined as string | undefined, gap: 0 }
  return { winner: gap >= 0 ? speakers[0] : speakers[1], gap }
}

function resolveConsistentWinner(args: {
  modelWinner: string
  speakers: string[]
  participantMetrics: ReturnType<typeof normalizeParticipantMetrics>
  moveTrace: ReturnType<typeof normalizeMoveTrace>
}) {
  const { modelWinner, speakers, participantMetrics, moveTrace } = args
  const normalizedModelWinner = speakers.includes(modelWinner) ? modelWinner : (speakers[0] || modelWinner)
  if (speakers.length < 2) return normalizedModelWinner

  const metrics = winnerFromMetrics(participantMetrics, speakers)
  const trace = winnerFromMoveTrace(moveTrace, speakers)

  if (metrics.winner && trace.winner) {
    if (metrics.winner === trace.winner) return metrics.winner
    return Math.abs(metrics.gap) >= Math.abs(trace.gap) ? metrics.winner : trace.winner
  }

  if (metrics.winner) return metrics.winner
  if (trace.winner) return trace.winner
  return normalizedModelWinner
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function normalizeThreePoisons(poisons: { greed?: number; hate?: number; ignorance?: number }) {
  const greed = Math.max(0, Number(poisons.greed || 0))
  const hate = Math.max(0, Number(poisons.hate || 0))
  const ignorance = Math.max(0, Number(poisons.ignorance || 0))
  const total = greed + hate + ignorance

  if (total <= 0) {
    return { greed: 0, hate: 0, ignorance: 0 }
  }

  const greedPct = Math.round((greed / total) * 100)
  const hatePct = Math.round((hate / total) * 100)
  const ignorancePct = Math.max(0, 100 - greedPct - hatePct)

  return {
    greed: clampPercent(greedPct),
    hate: clampPercent(hatePct),
    ignorance: clampPercent(ignorancePct)
  }
}

function rebalanceTo100(poisons: { greed: number; hate: number; ignorance: number }) {
  const total = poisons.greed + poisons.hate + poisons.ignorance
  if (total === 100) return poisons
  if (total <= 0) return { greed: 0, hate: 0, ignorance: 0 }
  const greed = Math.round((poisons.greed / total) * 100)
  const hate = Math.round((poisons.hate / total) * 100)
  const ignorance = Math.max(0, 100 - greed - hate)
  return { greed, hate, ignorance }
}

function calibrateThreePoisonsFromAxes(
  poisons: { greed: number; hate: number; ignorance: number },
  chanceOfEnlightenment: number,
  delusionMeter: number,
  wuEnergy: number
) {
  let next = { ...poisons }

  // If the participant is modeled as clear-seeing, very high ignorance is contradictory.
  if (chanceOfEnlightenment >= 70 && delusionMeter <= 35 && next.ignorance > 35) {
    const targetIgnorance = Math.max(8, Math.round((100 - chanceOfEnlightenment) * 0.6))
    const freed = Math.max(0, next.ignorance - targetIgnorance)
    next.ignorance = targetIgnorance
    next.greed += Math.round(freed * 0.5)
    next.hate += freed - Math.round(freed * 0.5)
  }

  // If delusion is high, ignorance should not be near-zero.
  if (delusionMeter >= 70 && next.ignorance < 20) {
    const need = 20 - next.ignorance
    next.ignorance += need
    if (next.greed >= next.hate) next.greed = Math.max(0, next.greed - need)
    else next.hate = Math.max(0, next.hate - need)
  }

  // Wu-coded merit/status clinging usually carries extra greed weighting.
  if (wuEnergy >= 70 && next.greed < 30) {
    const boost = 30 - next.greed
    next.greed += boost
    if (next.hate >= next.ignorance) next.hate = Math.max(0, next.hate - boost)
    else next.ignorance = Math.max(0, next.ignorance - boost)
  }

  return rebalanceTo100(next)
}

function enlightenmentFlavorText(chanceOfEnlightenment: number) {
  if (chanceOfEnlightenment <= 5) {
    return 'You have Buddha-nature, but that is all you are showing. As Master Zhaozhou might tease: stones and grass can ripen too, and right now you are not showing much more than that.'
  }
  if (chanceOfEnlightenment <= 25) {
    return 'A distant glimmer, mostly covered in dust. You are circling the gate while arguing with the signboard.'
  }
  if (chanceOfEnlightenment <= 50) {
    return 'Some real sparks are present, but grasping and performance keep interrupting the view.'
  }
  if (chanceOfEnlightenment <= 75) {
    return 'Solid meditative signal. Insight appears repeatedly, but self-positioning still leaks through.'
  }
  if (chanceOfEnlightenment <= 90) {
    return 'Strongly awake-coded. You are mostly cutting through form without clinging to it.'
  }
  return 'Near Bodhidharma-level composure in this exchange. Very little grasping, mostly direct seeing.'
}

function defaultParticipantMetrics(speaker: string) {
  return {
    speaker,
    wuEnergy: 50,
    chanceOfEnlightenment: 50,
    delusionMeter: 50,
    threePoisons: { greed: 34, hate: 33, ignorance: 33 },
    poisonProfileActive: false,
    wuEnergyReason: '',
    enlightenmentReason: '',
    delusionReason: '',
    threePoisonsReason: '',
    greedReason: '',
    hateReason: '',
    ignoranceReason: '',
    enlightenmentText: enlightenmentFlavorText(50)
  }
}

function quoteFromSpeaker(chat: Array<{ speaker: string; text: string }>, speaker: string) {
  const line = chat.find((t) => t.speaker === speaker)?.text?.trim()
  if (!line) return null
  return line.length > 120 ? `${line.slice(0, 120)}...` : line
}

function enlightenmentBand(chance: number) {
  if (chance <= 5) {
    return {
      label: 'Inanimate Object',
      description:
        'You have Buddha-nature, but that is all you are showing. As old Chan jokes go, stones and grass will ripen eventually too.'
    }
  }
  if (chance <= 20) {
    return {
      label: 'Temple Courtyard Dust',
      description: 'Tiny spark, heavy obscuration. More posturing than seeing.'
    }
  }
  if (chance <= 40) {
    return {
      label: 'Koan Tourist',
      description: 'Some contact with insight, but mostly collecting concepts.'
    }
  }
  if (chance <= 60) {
    return {
      label: 'Meditation Intern',
      description: 'Practice signal is real, but self-making still drives the speech.'
    }
  }
  if (chance <= 80) {
    return {
      label: 'Half-Step Through The Gateless Gate',
      description: 'Good non-attachment moments, with occasional fallback to identity.'
    }
  }
  if (chance <= 95) {
    return {
      label: 'Bodhidharma-Coded',
      description: 'Usually direct and unhooked. Very little merit-clinging.'
    }
  }
  return {
    label: 'Mountain Hermit Final Boss',
    description: 'Almost pure no-abiding response pattern in this exchange.'
  }
}

function delusionBand(delusion: number) {
  if (delusion <= 10) {
    return {
      label: 'Mirror-Clear',
      description: 'Very low fixation. Hardly any ego-theater detected.'
    }
  }
  if (delusion <= 25) {
    return {
      label: 'Light Mist',
      description: 'A little conceptual fog, but mostly grounded.'
    }
  }
  if (delusion <= 45) {
    return {
      label: 'Concept Tangle',
      description: 'Recurring attachment to views and rhetorical wins.'
    }
  }
  if (delusion <= 65) {
    return {
      label: 'Samsara Mid-Ladder',
      description: 'Noticeable grasping and identity-defense in multiple turns.'
    }
  }
  if (delusion <= 85) {
    return {
      label: 'Mara Subscriber',
      description: 'High reactivity and strong attachment to being right.'
    }
  }
  return {
    label: 'Hall Of Mirrors',
    description: 'Extreme confusion loop: status-seeking, projection, and fixation all maxed.'
  }
}

function wuEnergyBand(wu: number) {
  if (wu <= 20) return 'Low Imperial Aura'
  if (wu <= 40) return 'Mild Merit Flex'
  if (wu <= 60) return 'Court Official Mode'
  if (wu <= 80) return 'Imperial Merit Maxxing'
  return 'Gigacringe Emperor Wu Overdrive'
}

function normalizeRealm(value?: string) {
  const v = (value || '').trim().toLowerCase()
  if (!v) return ''
  if (v.includes('nirvana') || v.includes('nibbana') || v.includes('buddha')) return 'nirvana'
  if (v.includes('naraka') || v.includes('hell')) return 'naraka'
  if (v.includes('preta') || v.includes('hungry ghost')) return 'preta'
  if (v.includes('animal') || v.includes('tiryag')) return 'animal'
  if (v.includes('human') || v.includes('manusya')) return 'human'
  if (v.includes('asura') || v.includes('demi')) return 'asura'
  if (v.includes('deva') || v.includes('god realm')) return 'deva'
  return v
}

function realmLabel(realm: string) {
  const r = normalizeRealm(realm)
  if (r === 'nirvana') return 'Nirvana (Buddha Realm)'
  if (r === 'naraka') return 'Naraka (Hell Realm)'
  if (r === 'preta') return 'Preta (Hungry Ghost Realm)'
  if (r === 'animal') return 'Animal Realm'
  if (r === 'human') return 'Human Realm'
  if (r === 'asura') return 'Asura (Demi-God Realm)'
  if (r === 'deva') return 'Deva (God Realm)'
  return 'Human Realm'
}

function inferRealmFromMetrics(args: {
  chanceOfEnlightenment: number
  delusionMeter: number
  wuEnergy: number
  greed: number
  hate: number
  ignorance: number
}) {
  const { chanceOfEnlightenment, delusionMeter, wuEnergy, greed, hate, ignorance } = args

  if (isStrictNirvanaPattern({ chanceOfEnlightenment, delusionMeter, wuEnergy, greed, hate, ignorance })) {
    return 'nirvana'
  }
  if (delusionMeter >= 90 || (hate >= 65 && chanceOfEnlightenment < 20)) return 'naraka'
  if (greed >= 65 && chanceOfEnlightenment < 35) return 'preta'
  if (hate >= 40 || (delusionMeter >= 80 && wuEnergy >= 60)) return 'asura'
  if (ignorance >= 45 || delusionMeter >= 55) return 'animal'
  if (chanceOfEnlightenment >= 78 && delusionMeter <= 28 && hate <= 20) return 'deva'
  return 'human'
}

function realmDescription(realm: string) {
  const r = normalizeRealm(realm)
  if (r === 'nirvana') return 'Beyond six-realm reactivity: non-grasping, clear, and unbound by karmic push-pull.'
  if (r === 'naraka') return 'Extreme harm-and-hatred loop: pain-producing intent dominates.'
  if (r === 'preta') return 'Craving-heavy mode: always hungry for status, control, or validation.'
  if (r === 'animal') return 'Habitual and reactive mode: confusion and instinct run the show.'
  if (r === 'asura') return 'Competitive rage mode: power and victory dominate over clarity.'
  if (r === 'deva') return 'Calm, compassionate, and spacious mode with low grasping.'
  return 'Mixed human mode: both confusion and insight are present.'
}

function practiceRecommendation(args: {
  realm: string
  chanceOfEnlightenment: number
  delusionMeter: number
  greed: number
  hate: number
  ignorance: number
}) {
  const { realm, chanceOfEnlightenment, delusionMeter, greed, hate, ignorance } = args
  const r = normalizeRealm(realm)

  if (r === 'nirvana') {
    return {
      headline: 'Stabilize Non-Abiding Compassion',
      reason: 'Clarity is already very high; focus on effortless compassionate functioning without attaching to attainment.',
      list: [
        'Silent sitting with no gain idea (shikantaza style)',
        'Compassion practice in ordinary interactions',
        'Short daily recitation of the Heart Sutra'
      ]
    }
  }

  if (r === 'deva' || chanceOfEnlightenment >= 80) {
    return {
      headline: 'Guard Against Subtle Spiritual Pride',
      reason: 'Strong clarity is present; avoid turning insight into identity.',
      list: [
        'Daily zazen 20-40 minutes',
        'Diamond Sutra reading with anti-reification focus',
        'One concrete act of generosity per day'
      ]
    }
  }

  if (hate >= 45 || r === 'asura' || r === 'naraka') {
    return {
      headline: 'Cool The Fire First',
      reason: 'Reactivity and adversarial tone are dominating; regulation and compassion are the first medicine.',
      list: [
        'Mindful breathing (counting breath) 10-15 minutes',
        'Loving-kindness (metta) phrases for self and opponent',
        'Pause-before-reply rule in conflict-heavy chats'
      ]
    }
  }

  if (greed >= 45 || r === 'preta') {
    return {
      headline: 'Train Contentment And Letting Go',
      reason: 'Craving/status-seeking appears strong; practice non-grasping through generosity and simplicity.',
      list: [
        'Generosity practice (dana): give anonymously',
        'Read one short passage from Dhammapada or Shobogenzo daily',
        'Name one attachment each day and release one small part of it'
      ]
    }
  }

  if (ignorance >= 45 || r === 'animal' || delusionMeter >= 55) {
    return {
      headline: 'Increase Clarity Through Study + Sitting',
      reason: 'Confusion/habit loops are strong; combine textual orientation with direct observation.',
      list: [
        'Zazen 15-30 minutes daily',
        'Heart Sutra + short commentary reading',
        'Label thoughts as "thinking" and return to breath/body'
      ]
    }
  }

  return {
    headline: 'Balanced Path: Sit, Study, Serve',
    reason: 'Mixed profile: steady practice beats dramatic interventions.',
    list: [
      'Regular sitting routine',
      'Scripture reading in small daily doses',
      'Compassionate action in one real relationship'
    ]
  }
}

function isStrictNirvanaPattern(args: {
  chanceOfEnlightenment: number
  delusionMeter: number
  wuEnergy: number
  greed: number
  hate: number
  ignorance: number
}) {
  const { chanceOfEnlightenment, delusionMeter, wuEnergy, greed, hate, ignorance } = args
  return (
    chanceOfEnlightenment >= 97 &&
    delusionMeter <= 8 &&
    wuEnergy <= 15 &&
    greed <= 6 &&
    hate <= 4 &&
    ignorance <= 6
  )
}

function constrainRealmByMetrics(
  proposedRealm: string,
  args: {
    chanceOfEnlightenment: number
    delusionMeter: number
    wuEnergy: number
    greed: number
    hate: number
    ignorance: number
  }
) {
  const r = normalizeRealm(proposedRealm)
  if (r !== 'nirvana') return r

  // Nirvana is ultra-rare: if pattern is not exceptionally clear, downgrade.
  if (isStrictNirvanaPattern(args)) return 'nirvana'
  if (args.chanceOfEnlightenment >= 85 && args.delusionMeter <= 25 && args.hate <= 15) return 'deva'
  return 'human'
}

function normalizeParticipantMetrics(
  metrics: Array<z.infer<typeof ParticipantMetricSchema>> | undefined,
  speakers: string[],
  chat: Array<{ speaker: string; text: string }>
) {
  const bySpeaker = new Map((metrics || []).map((m) => [(m.speaker || '').trim(), m]))

  return speakers.map((speaker) => {
    const item = bySpeaker.get(speaker)
    const quote = quoteFromSpeaker(chat, speaker)
    if (!item) {
      const fallback = defaultParticipantMetrics(speaker)
      const eBand = enlightenmentBand(fallback.chanceOfEnlightenment)
      const dBand = delusionBand(fallback.delusionMeter)
      return {
        ...fallback,
        wuEnergyBand: wuEnergyBand(fallback.wuEnergy),
        wuEnergyReason:
          fallback.wuEnergyReason ||
          (quote
            ? `Because "${quote}" carries mild merit-clinging energy, the Wu meter stays in the middle.`
            : 'No clear quote available; Wu Energy estimated from overall tone.'),
        enlightenmentBand: eBand.label,
        enlightenmentDescription: eBand.description,
        enlightenmentReason:
          fallback.enlightenmentReason || 'Enlightenment chance inferred from attachment vs non-attachment patterns.',
        delusionBand: dBand.label,
        delusionDescription: dBand.description,
        delusionReason:
          fallback.delusionReason || 'Delusion level inferred from fixation, certainty-posing, and reactivity.',
        threePoisonsReason: 'Poison profile is hidden while delusion stays below threshold.',
        greedReason: 'Greed at 0%: no sustained craving/merit-grasping signal above threshold.',
        hateReason: 'Hate at 0%: no stable hostility pattern above threshold.',
        ignoranceReason: 'Ignorance at 0%: confusion signal below poison-profile threshold.',
        samsaraRealm: 'human',
        samsaraRealmLabel: realmLabel('human'),
        samsaraRealmDescription: realmDescription('human'),
        samsaraRealmReason:
          quote
            ? `Based on "${quote}", this reads as a mixed human pattern: neither deeply hellish nor stably deva-like.`
            : 'Mixed pattern places this speaker in the human realm by default.',
        recommendedPractice: 'Balanced Path: Sit, Study, Serve',
        recommendedPracticeReason: 'Default mixed profile recommendation.',
        recommendedPracticeList: [
          'Regular sitting routine',
          'Small daily scripture reading',
          'One concrete compassionate action'
        ]
      }
    }

    const chanceOfEnlightenment = clampPercent(item.chanceOfEnlightenment)
    const delusionMeter = clampPercent(item.delusionMeter)
    const wuEnergy = clampPercent(item.wuEnergy)
    const poisonProfileActive = delusionMeter > 50
    const normalizedPoisons = poisonProfileActive
      ? normalizeThreePoisons(item.threePoisons || { greed: 0, hate: 0, ignorance: 0 })
      : { greed: 0, hate: 0, ignorance: 0 }
    const calibratedPoisons = poisonProfileActive
      ? calibrateThreePoisonsFromAxes(normalizedPoisons, chanceOfEnlightenment, delusionMeter, wuEnergy)
      : { greed: 0, hate: 0, ignorance: 0 }
    const eBand = enlightenmentBand(chanceOfEnlightenment)
    const dBand = delusionBand(delusionMeter)
    const inferredRealm = inferRealmFromMetrics({
      chanceOfEnlightenment,
      delusionMeter,
      wuEnergy,
      greed: calibratedPoisons.greed,
      hate: calibratedPoisons.hate,
      ignorance: calibratedPoisons.ignorance
    })
    const modelRealm = normalizeRealm(item.samsaraRealm)
    const finalRealm = constrainRealmByMetrics(modelRealm || inferredRealm, {
      chanceOfEnlightenment,
      delusionMeter,
      wuEnergy,
      greed: calibratedPoisons.greed,
      hate: calibratedPoisons.hate,
      ignorance: calibratedPoisons.ignorance
    })
    const fallbackPractice = practiceRecommendation({
      realm: finalRealm,
      chanceOfEnlightenment,
      delusionMeter,
      greed: calibratedPoisons.greed,
      hate: calibratedPoisons.hate,
      ignorance: calibratedPoisons.ignorance
    })

    return {
      speaker,
      wuEnergy,
      wuEnergyBand: wuEnergyBand(wuEnergy),
      wuEnergyReason:
        item.wuEnergyReason ||
        (quote
          ? `Because "${quote}" projects status/merit attachment, Wu Energy rises.`
          : 'Wu Energy estimated from the participant’s argument style.'),
      chanceOfEnlightenment,
      enlightenmentBand: eBand.label,
      enlightenmentDescription: eBand.description,
      enlightenmentReason:
        item.enlightenmentReason || 'Chance estimated from directness, non-attachment, and clarity under pressure.',
      delusionMeter,
      delusionBand: dBand.label,
      delusionDescription: dBand.description,
      delusionReason:
        item.delusionReason || 'Delusion estimated from grasping, hostility, and conceptual fixation.',
      threePoisons: calibratedPoisons,
      poisonProfileActive,
      threePoisonsReason:
        item.threePoisonsReason ||
        (poisonProfileActive
          ? 'Greed/hate/ignorance percentages inferred from recurring moves in this speaker’s lines.'
          : 'Poison profile hidden because delusion is at or below 50%.'),
      greedReason:
        item.greedReason ||
        (poisonProfileActive
          ? `Greed at ${calibratedPoisons.greed}%: reflects grasping, status/merit seeking, and possession language.`
          : 'Greed at 0%: below activation threshold (delusion <= 50%).'),
      hateReason:
        item.hateReason ||
        (poisonProfileActive
          ? `Hate at ${calibratedPoisons.hate}%: reflects hostility, contempt, or punitive framing in tone.`
          : 'Hate at 0%: below activation threshold (delusion <= 50%).'),
      ignoranceReason:
        item.ignoranceReason ||
        (poisonProfileActive
          ? `Ignorance at ${calibratedPoisons.ignorance}%: reflects confusion, fixation, and misreading of non-attachment.`
          : 'Ignorance at 0%: below activation threshold (delusion <= 50%).'),
      samsaraRealm: finalRealm,
      samsaraRealmLabel: realmLabel(finalRealm),
      samsaraRealmDescription: item.samsaraRealmDescription || realmDescription(finalRealm),
      samsaraRealmReason:
        item.samsaraRealmReason ||
        (quote
          ? `Because "${quote}" shows this karmic pattern, this speaker is placed in ${realmLabel(finalRealm)}.`
          : `Realm placement derived from delusion/enlightenment/poison balance: ${realmLabel(finalRealm)}.`),
      recommendedPractice: item.recommendedPractice || fallbackPractice.headline,
      recommendedPracticeReason: item.recommendedPracticeReason || fallbackPractice.reason,
      recommendedPracticeList: item.recommendedPracticeList?.length
        ? item.recommendedPracticeList
        : fallbackPractice.list,
      enlightenmentText: item.enlightenmentText || enlightenmentFlavorText(chanceOfEnlightenment)
    }
  })
}

function isQuotaError(statusCode: number, message: string) {
  const m = message.toLowerCase()
  return (
    statusCode === 429 ||
    m.includes('quota') ||
    m.includes('resource_exhausted') ||
    m.includes('rate limit') ||
    m.includes('billing')
  )
}

function getGeminiModelChain() {
  const fromList = (process.env.GEMINI_MODELS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

  if (fromList.length) return [...new Set(fromList)]
  return [process.env.GEMINI_MODEL || 'gemini-2.0-flash']
}

async function callGeminiOnce(prompt: string, timeoutMs: number, model: string) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw createHttpError(500, 'Missing GEMINI_API_KEY')
  }

  const maxOutputTokens = Number(process.env.WHOISWU_MAX_OUTPUT_TOKENS || 4096)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens,
          responseMimeType: 'application/json'
        }
      }),
      signal: controller.signal
    })

    const body = (await res.json().catch(() => ({}))) as GeminiGenerateResponse

    if (!res.ok) {
      const message = body?.error?.message || `Gemini HTTP ${res.status}`
      if (isQuotaError(res.status, message)) {
        throw createHttpError(429, `Gemini quota exceeded: ${message}`)
      }
      throw createHttpError(res.status || 500, `Gemini request failed: ${message}`)
    }

    if (body.promptFeedback?.blockReason) {
      throw createHttpError(400, `Gemini blocked prompt: ${body.promptFeedback.blockReason}`)
    }

    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
    if (!text.trim()) {
      const reason = body.candidates?.[0]?.finishReason || 'No text returned'
      throw createHttpError(502, `Gemini returned empty output (${reason})`)
    }

    return text
  } catch (err: unknown) {
    if ((err as Error)?.name === 'AbortError') {
      throw createHttpError(504, 'Gemini request timed out')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function callGemini(prompt: string, timeoutMs: number) {
  const models = getGeminiModelChain()
  const failures: string[] = []

  for (const model of models) {
    try {
      return await callGeminiOnce(prompt, timeoutMs, model)
    } catch (err: unknown) {
      const statusCode = (err as HttpError)?.statusCode || 500
      const message = (err as Error)?.message || 'Gemini call failed'
      failures.push(`${model}: ${message}`)

      // If quota is truly exhausted, trying other models just burns requests and delay.
      if (statusCode === 429 && message.toLowerCase().includes('quota exceeded')) {
        throw err
      }

      // Fail fast on non-retryable classes for this request.
      if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
        throw err
      }
      // Otherwise try next model.
    }
  }

  throw createHttpError(429, `All configured Gemini models failed. Tried: ${failures.join(' | ')}`)
}

type PromptParts = {
  input: JudgeInput
  agentPrompt: string
  personaPrompt: string
  metricMappingsPrompt: string
  transcript: string
  speakers: string[]
}

export function buildJudgeUserPrompt(parts: PromptParts) {
  const { input, agentPrompt, personaPrompt, metricMappingsPrompt, transcript, speakers } = parts
  return [
    agentPrompt,
    '',
    'Persona instructions:',
    personaPrompt,
    '',
    'Participants:',
    speakers.join(', '),
    '',
    'Transcript:',
    transcript,
    '',
    'Mahayana scripture chunks:',
    JSON.stringify(MAHAYANA_CHUNKS, null, 2),
    '',
    'Citation policy:',
    '- For citations, return only human-readable citation labels from the provided chunks.',
    '- Do not return internal IDs like wu-bodhidharma-1.',
    '',
    'Metric rubric mappings (debuggable markdown):',
    metricMappingsPrompt || '(No mapping markdown files found; use in-prompt definitions.)',
    '',
    'Task: Decide which participant is closest to Emperor Wu in this argument.',
    `Active persona: ${input.options.persona}`,
    `Include reasoning: ${input.options.includeReasoning}`,
    `Include citations: ${input.options.includeCitations}`,
    `Include traceability links (quote -> citation -> why): ${input.options.includeTraceability}`,
    `Include move-by-move trace with deltas and position score: ${input.options.includeMoveTrace}`,
    `Include a Mumonkan-style capping verse in classical Chinese plus English translation: ${input.options.includeVerse}`,
    `Strict mode: ${input.options.strictMode}`,
    '',
    'Also score each participant with meme metrics:',
    '- wuEnergy: 0-100 ("giga NPC like Emperor Wu" vibe, higher = more Wu-coded attachment)',
    '- chanceOfEnlightenment: 0-100',
    '- delusionMeter: 0-100',
    '- samsaraRealm: one of nirvana, naraka, preta, animal, human, asura, deva',
    '- samsaraRealmDescription: one short description for the selected realm',
    '- samsaraRealmReason: one sentence with evidence for why this realm fits',
    '- recommendedPractice: short headline practice recommendation',
    '- recommendedPracticeReason: one sentence why this practice fits current metrics',
    '- recommendedPracticeList: 2-4 concrete practice actions (sutra study, zazen, ethics, etc.)',
    '- threePoisons: greed/hate/ignorance percentages that sum to 100',
    '- enlightenmentText: one short roast or praise line based on chanceOfEnlightenment',
    '- wuEnergyReason: one sentence with a short quoted snippet from that speaker',
    '- enlightenmentReason: one sentence explaining score logic',
    '- delusionReason: one sentence explaining score logic',
    '- threePoisonsReason: one sentence explaining poison profile activation/split',
    '- greedReason: one sentence for greed percentage',
    '- hateReason: one sentence for hate percentage',
    '- ignoranceReason: one sentence for ignorance percentage',
    '- Keep output concise to avoid truncation: summary <= 2 sentences; reasoning <= 220 words when included.',
    '- Keep recommendation lists to 2-4 short items and avoid long prose blocks.',
    '- participantMetrics must not be omitted.',
    '- participantMetrics must include both participants and reflect meaningful differences when their moves differ.',
    '- winner consistency rule: winner should align with higher Wu-attachment signal (wuEnergy/delusion) and confidence > 0.5.',
    '- If includeTraceability is true, also return evidenceLinks: 2-8 items that connect transcript evidence to cited texts.',
    '- Each evidenceLinks item must be: { citation, chatQuote, why, speaker?, appliedRule? }',
    '- citation must be one of the citation labels from the provided chunks.',
    '- chatQuote must be a short direct quote from transcript.',
    '- why must explicitly explain how that quote aligns with the cited source in this verdict.',
    '- If includeMoveTrace is true, also return moveTrace with one item per transcript move.',
    '- moveTrace item shape: { move, speaker, quote, delusionDelta, wuEnergyDelta, clarityDelta, positionScore, commentary?, verse? }',
    '- deltas should be approximately in [-30, 30], and positionScore in [-100, 100].',
    '- For each move i, evaluate transcript prefix 1..i (not just move i in isolation).',
    '- positionScore at move i must represent current differential after recalculating that full prefix.',
    '- Later lines can reveal earlier intent; allow prefix-level reinterpretation when assigning deltas and commentary.',
    '- commentary should briefly explain what changed at that move.',
    '- verse (optional) can be short koan-style line commentary for that move.',
    '',
    'Return strict JSON only with keys:',
    '{ winner, confidence, summary, reasoning?, citations?, evidenceLinks?, moveTrace?, verseChinese?, verseTranslation?, participantMetrics: [{ speaker, wuEnergy, chanceOfEnlightenment, delusionMeter, samsaraRealm, samsaraRealmDescription, samsaraRealmReason, recommendedPractice, recommendedPracticeReason, recommendedPracticeList, threePoisons: { greed, hate, ignorance }, poisonProfileActive, wuEnergyReason, enlightenmentReason, delusionReason, threePoisonsReason, greedReason, hateReason, ignoranceReason, enlightenmentText }] }',
    'Do not wrap JSON in markdown fences.'
  ].join('\n')
}

export async function buildAllFlagsExamplePrompt() {
  const input = JudgeInputSchema.parse({
    chat: [
      { speaker: 'Speaker A', text: 'I donated, built temples, and served the sangha. What merit do I now possess?' },
      { speaker: 'Speaker B', text: 'Merit can still be grasping if clung to as status.' },
      { speaker: 'Speaker A', text: 'Then what is the highest holy truth?' },
      { speaker: 'Speaker B', text: 'Vast emptiness, nothing holy.' }
    ],
    options: {
      includeReasoning: true,
      includeCitations: true,
      includeTraceability: true,
      includeMoveTrace: true,
      includeVerse: true,
      strictMode: true,
      persona: 'dogen'
    }
  })

  const agentPrompt = await loadAgentPrompt()
  const personaPrompt = await loadPersonaPrompt(input.options.persona)
  const metricMappingsPrompt = await loadMetricMappingsPrompt()
  const transcript = buildTranscript(input.chat)
  const speakers = [...new Set(input.chat.map((x) => x.speaker))]

  return buildJudgeUserPrompt({
    input,
    agentPrompt,
    personaPrompt,
    metricMappingsPrompt,
    transcript,
    speakers
  })
}

export async function judgeWhoIsWu(raw: unknown) {
  const input = JudgeInputSchema.parse(raw)
  const timeoutMs = Number(process.env.WHOISWU_MODEL_TIMEOUT_MS || 30000)

  const agentPrompt = await loadAgentPrompt()
  const personaPrompt = await loadPersonaPrompt(input.options.persona)
  const metricMappingsPrompt = await loadMetricMappingsPrompt()
  const transcript = buildTranscript(input.chat)
  const speakers = [...new Set(input.chat.map((x) => x.speaker))]

  // Keep the first model pass lean: moveTrace is generated in a dedicated second pass.
  const basePromptInput: JudgeInput = {
    ...input,
    options: {
      ...input.options,
      includeMoveTrace: false
    }
  }

  const userPrompt = buildJudgeUserPrompt({
    input: basePromptInput,
    agentPrompt,
    personaPrompt,
    metricMappingsPrompt,
    transcript,
    speakers
  })

  try {
    let validated: z.infer<typeof JudgeOutputSchema>
    let firstText = ''
    let retryText = ''
    try {
      firstText = await callGemini(userPrompt, timeoutMs)
      const parsed = parseJudgeJson(firstText)
      validated = JudgeOutputSchema.parse(parsed)
    } catch (firstError: unknown) {
      if (!shouldRetryStructuredOutput(firstError)) throw firstError
      const retryPrompt = [
        userPrompt,
        '',
        'Your previous output was invalid.',
        'Return VALID JSON ONLY.',
        'No markdown fences. No comments. No trailing commas. No prose before or after JSON.'
      ].join('\n')
      try {
        retryText = await callGemini(retryPrompt, timeoutMs)
        const retryParsed = parseJudgeJson(retryText)
        validated = JudgeOutputSchema.parse(retryParsed)
      } catch (secondError: unknown) {
        if (!shouldRetryStructuredOutput(secondError)) throw secondError
        const toRepair = retryText || firstText
        try {
          const repairedText = await repairJsonPayload(toRepair, timeoutMs)
          const repairedParsed = parseJudgeJson(repairedText)
          validated = JudgeOutputSchema.parse(repairedParsed)
        } catch (repairError: unknown) {
          if (!shouldRetryStructuredOutput(repairError)) throw repairError
          const compactRetryPrompt = [
            userPrompt,
            '',
            'Your previous outputs were invalid JSON.',
            'Return VALID, COMPACT JSON ONLY.',
            'Keep summary short (max 2 sentences), keep reasoning concise, and avoid long text fields.',
            'No markdown fences. No comments. No trailing commas. No prose before or after JSON.'
          ].join('\n')
          const compactRetryText = await callGemini(compactRetryPrompt, timeoutMs)
          const compactRetryParsed = parseJudgeJson(compactRetryText)
          validated = JudgeOutputSchema.parse(compactRetryParsed)
        }
      }
    }

    // If move trace was requested, fetch it in a dedicated focused pass.
    if (input.options.includeMoveTrace) {
      const moveTraceRetryPrompt = [
        'Return strict JSON only.',
        '',
        'Task:',
        'Generate moveTrace with one item per transcript move.',
        '- Item shape: { move, speaker, quote, delusionDelta, wuEnergyDelta, clarityDelta, positionScore, commentary?, verse? }',
        '- deltas should be approximately in [-30, 30], positionScore in [-100, 100].',
        '- For each move i, recalculate based on transcript prefix 1..i.',
        '- positionScore at move i must reflect that full-prefix recalculation.',
        '- Later lines may reinterpret earlier lines; encode that in deltas/commentary.',
        '- move must start at 1 and increase by 1.',
        '- quote should be a short direct quote from the move.',
        '',
        'Interpretation rule:',
        '- Positive positionScore means the first participant is currently more Wu-like.',
        '- Negative positionScore means the second participant is currently more Wu-like.',
        '',
        `Participants: ${speakers.join(', ')}`,
        '',
        'Transcript:',
        transcript,
        '',
        'Return JSON with exactly this shape:',
        '{ "moveTrace": [ ... ] }'
      ].join('\n')

      try {
        const traceRetryText = await callGemini(moveTraceRetryPrompt, timeoutMs)
        const traceRetryParsed = parseJudgeJson(traceRetryText)
        const traceRetryValidated = MoveTraceOnlySchema.parse(traceRetryParsed)
        validated = {
          ...validated,
          moveTrace: traceRetryValidated.moveTrace
        }
      } catch {
        // Keep original validated payload and allow deterministic fallback below.
      }
    }

    // If participant metrics are missing/flat, do a focused retry for metrics only.
    if (!hasUsefulParticipantMetrics(validated.participantMetrics, speakers)) {
      const metricsRetryPrompt = [
        'Return strict JSON only.',
        '',
        'Task:',
        'Generate participantMetrics for BOTH participants from this transcript.',
        '- Include: speaker, wuEnergy, chanceOfEnlightenment, delusionMeter,',
        '  samsaraRealm, samsaraRealmDescription, samsaraRealmReason,',
        '  recommendedPractice, recommendedPracticeReason, recommendedPracticeList,',
        '  threePoisons { greed, hate, ignorance }, poisonProfileActive,',
        '  wuEnergyReason, enlightenmentReason, delusionReason,',
        '  threePoisonsReason, greedReason, hateReason, ignoranceReason, enlightenmentText.',
        '- If two participants differ in behavior, do NOT return identical 50/50-like metrics.',
        '- winner consistency: participant marked as closest to Emperor Wu should trend higher on wuEnergy/delusion.',
        '',
        `Participants: ${speakers.join(', ')}`,
        '',
        'Transcript:',
        transcript,
        '',
        'Return JSON with exactly this shape:',
        '{ "participantMetrics": [ ... ] }'
      ].join('\n')

      try {
        const metricsRetryText = await callGemini(metricsRetryPrompt, timeoutMs)
        const metricsRetryParsed = parseJudgeJson(metricsRetryText)
        const metricsRetryValidated = ParticipantMetricsOnlySchema.parse(metricsRetryParsed)
        validated = {
          ...validated,
          participantMetrics: metricsRetryValidated.participantMetrics
        }
      } catch {
        // Keep original payload and let normalization guard against missing fields.
      }
    }

    const citations = normalizeCitations(validated.citations)
    const evidenceLinks = normalizeEvidenceLinks(validated.evidenceLinks)
    const moveTraceFallbackUsed = input.options.includeMoveTrace ? !validated.moveTrace?.length : undefined
    const moveTrace = input.options.includeMoveTrace
      ? normalizeMoveTrace(validated.moveTrace, input.chat)
      : undefined
    const participantMetrics = normalizeParticipantMetrics(validated.participantMetrics, speakers, input.chat)
    const consistentWinner = resolveConsistentWinner({
      modelWinner: validated.winner,
      speakers,
      participantMetrics,
      moveTrace
    })
    const adjustedConfidence = alignConfidenceWithMetrics(consistentWinner, validated.confidence, participantMetrics)
    const winnerWasNormalized = !speakers.includes(validated.winner)
    const winnerWasRealigned = consistentWinner !== (speakers.includes(validated.winner) ? validated.winner : speakers[0])

    if (winnerWasNormalized) {
      return {
        ...validated,
        citations,
        evidenceLinks,
        moveTrace,
        moveTraceFallbackUsed,
        participantMetrics,
        metricMappingsUsed: METRIC_MAPPING_FILES,
        debugPrompt: input.options.debugPromptEcho ? userPrompt : undefined,
        winner: consistentWinner,
        confidence: adjustedConfidence,
        summary: `${validated.summary} (winner normalized to known participant)`
      }
    }

    return {
      ...validated,
      citations,
      evidenceLinks,
      moveTrace,
      moveTraceFallbackUsed,
      participantMetrics,
      winner: consistentWinner,
      confidence: adjustedConfidence,
      summary: winnerWasRealigned
        ? `${validated.summary} (winner aligned with computed scoring signals)`
        : validated.summary,
      metricMappingsUsed: METRIC_MAPPING_FILES,
      debugPrompt: input.options.debugPromptEcho ? userPrompt : undefined
    }
  } catch (err: unknown) {
    const statusCode = (err as HttpError)?.statusCode || 500
    const message = (err as Error)?.message || 'Judge failed'

    if (statusCode === 429 || message.toLowerCase().includes('quota')) {
      throw createHttpError(429, message)
    }
    throw createHttpError(statusCode, message)
  }
}
