<script setup lang="ts">
const transcript = ref(`Emperor Wu: I have built temples, ordained monks, and supported the Dharma. What merit is there?
Bodhidharma: No merit.
Emperor Wu: What is the highest meaning of the holy truth?
Bodhidharma: Vast emptiness, nothing holy.
Emperor Wu: Who stands before me?
Bodhidharma: I do not know.`)

const includeReasoning = ref(true)
const includeCitations = ref(true)
const includeTraceability = ref(false)
const includeMoveTrace = ref(false)
const debugPromptEcho = ref(false)
const includeVerse = ref(false)
const strictMode = ref(false)
const persona = ref<'dogen' | 'linji' | 'alan-watts'>('dogen')
const analysisMode = ref<'scholar' | 'meme'>('scholar')

const personaItems = [
  { label: 'Dogen Zenji', value: 'dogen' },
  { label: 'Linji', value: 'linji' },
  { label: 'Alan Watts', value: 'alan-watts' }
]

const analysisModeItems = [
  { label: 'Scholar Mode', value: 'scholar' },
  { label: 'Meme Mode', value: 'meme' }
]

const judgeProfiles: Record<
  'dogen' | 'linji' | 'alan-watts',
  { label: string; avatar: string; initials: string }
> = {
  dogen: { label: 'Dogen Zenji', avatar: '/dogen.jpg', initials: 'DZ' },
  linji: { label: 'Linji', avatar: '/linji.jpg', initials: 'LJ' },
  'alan-watts': { label: 'Alan Watts', avatar: '/watts.jpg', initials: 'AW' }
}

const loading = ref(false)
const error = ref('')
const cacheNotice = ref('')
const isHydratingCache = ref(true)

type ParticipantMetrics = {
  speaker: string
  wuEnergy: number
  wuEnergyBand?: string
  wuEnergyReason?: string
  chanceOfEnlightenment: number
  enlightenmentBand?: string
  enlightenmentDescription?: string
  enlightenmentReason?: string
  delusionMeter: number
  delusionBand?: string
  delusionDescription?: string
  delusionReason?: string
  samsaraRealm?: string
  samsaraRealmLabel?: string
  samsaraRealmDescription?: string
  samsaraRealmReason?: string
  recommendedPractice?: string
  recommendedPracticeReason?: string
  recommendedPracticeList?: string[]
  threePoisons: {
    greed: number
    hate: number
    ignorance: number
  }
  poisonProfileActive?: boolean
  threePoisonsReason?: string
  greedReason?: string
  hateReason?: string
  ignoranceReason?: string
  enlightenmentText?: string
}

const result = ref<null | {
  winner: string
  confidence: number
  summary: string
  reasoning?: string
  citations?: string[]
  evidenceLinks?: Array<{
    citation: string
    chatQuote: string
    why: string
    speaker?: string
    appliedRule?: string
  }>
  moveTrace?: Array<{
    move: number
    speaker: string
    quote: string
    delusionDelta: number
    wuEnergyDelta: number
    clarityDelta: number
    positionScore: number
    commentary?: string
    verse?: string
  }>
  moveTraceFallbackUsed?: boolean
  debugPrompt?: string
  verseChinese?: string
  verseTranslation?: string
  participantMetrics?: ParticipantMetrics[]
}>(null)

const SESSION_CACHE_KEY = 'whoiswu:v2:last-session'

type CachedSession = {
  version: 1
  savedAt: string
  transcript: string
  includeReasoning: boolean
  includeCitations: boolean
  includeTraceability: boolean
  includeMoveTrace: boolean
  debugPromptEcho: boolean
  includeVerse: boolean
  strictMode: boolean
  persona: 'dogen' | 'linji' | 'alan-watts'
  analysisMode: 'scholar' | 'meme'
  result: NonNullable<typeof result.value> | null
}

type ComparisonRow = {
  key: string
  label: string
  leftValue: string
  rightValue: string
  why: string
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function normalizeSpeakerName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function formatConfidence(value: number) {
  return `${clampPercent(value * 100)}%`
}

function formatMetric(value: number) {
  return `${clampPercent(value)}%`
}

function formatSigned(value: number) {
  const v = Math.round(value)
  return `${v >= 0 ? '+' : ''}${v}`
}

function moveScoreBarStyle(score: number) {
  const clamped = Math.max(-100, Math.min(100, Math.round(score)))
  const width = Math.abs(clamped)
  const isPositive = clamped >= 0
  return {
    width: `${width}%`,
    marginLeft: isPositive ? '50%' : `${50 - width}%`,
    backgroundColor: isPositive ? '#f59e0b' : '#0ea5e9'
  }
}

function confidenceBand(value: number) {
  const score = clampPercent(value * 100)
  if (score < 55) return 'Low'
  if (score < 75) return 'Medium'
  return 'High'
}

function confidenceToneClass(value: number) {
  const score = clampPercent(value * 100)
  if (score < 55) return 'confidence-low'
  if (score < 75) return 'confidence-medium'
  return 'confidence-high'
}

function summarizeOneLine(text?: string) {
  if (!text) return ''
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  const sentence = normalized.split(/(?<=[.!?])\s+/)[0] || normalized
  return sentence.slice(0, 240)
}

function trimForEvidence(text: string, max = 120) {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1).trim()}...`
}

function meterStyle(value: number, color: string) {
  return {
    width: `${clampPercent(value)}%`,
    backgroundColor: color
  }
}

function poisonsPieStyle(poisons: ParticipantMetrics['threePoisons']) {
  const greed = clampPercent(poisons.greed)
  const hate = clampPercent(poisons.hate)
  const ignorance = clampPercent(poisons.ignorance)
  const stop1 = greed
  const stop2 = greed + hate
  return {
    background: `conic-gradient(#f59e0b 0% ${stop1}%, #ef4444 ${stop1}% ${stop2}%, #64748b ${stop2}% 100%)`
  }
}

function attachmentLabel(score: number) {
  if (analysisMode.value === 'meme') {
    if (score >= 80) return 'Imperial Overdrive'
    if (score >= 60) return 'Palace Grip'
    if (score >= 40) return 'Courtly Lean'
    return 'Detached Wanderer'
  }

  if (score >= 80) return 'High attachment'
  if (score >= 60) return 'Marked attachment'
  if (score >= 40) return 'Mixed'
  return 'Low attachment'
}

function delusionLabel(score: number) {
  if (analysisMode.value === 'meme') {
    if (score >= 80) return 'Hall of Mirrors'
    if (score >= 60) return 'Fogged'
    if (score >= 40) return 'Partly clear'
    return 'Mirror-clear'
  }

  if (score >= 80) return 'Very high fixation'
  if (score >= 60) return 'High fixation'
  if (score >= 40) return 'Moderate fixation'
  return 'Low fixation'
}

function enlightenmentLabel(score: number) {
  if (analysisMode.value === 'meme') {
    if (score >= 80) return 'Bodhidharma-coded'
    if (score >= 60) return 'Strong spark'
    if (score >= 40) return 'Unstable spark'
    return 'Temple courtyard dust'
  }

  if (score >= 80) return 'Strong readiness'
  if (score >= 60) return 'Moderate readiness'
  if (score >= 40) return 'Mixed readiness'
  return 'Low readiness'
}

function primaryWuMetricTitle() {
  return analysisMode.value === 'meme' ? 'Wu Energy' : 'Attachment Index'
}

function primaryDelusionTitle() {
  return analysisMode.value === 'meme' ? 'Delusion Meter' : 'Conceptual Fixation'
}

function parseTranscript(text: string) {
  const lines = text.split('\n')
  const turns: Array<{ speaker: string; text: string }> = []

  let currentSpeaker = 'Unknown'
  let buffer: string[] = []

  const inlineDiscordHeader = /^(.*?)\s+—\s+\d{1,2}\.\d{1,2}\.\d{2,4},\s+\d{1,2}:\d{2}$/
  const discordTimestampOnly = /^—\s+\d{1,2}\.\d{1,2}\.\d{2,4},\s+\d{1,2}:\d{2}$/
  const simpleSpeakerLine = /^([^:]{1,80}):\s*(.+)$/

  function isLikelySpeakerToken(token: string) {
    const t = token.trim()
    if (!t) return false
    if (t.length > 32) return false
    const words = t.split(/\s+/).filter(Boolean)
    if (words.length > 4) return false
    if (/^[a-z].*\s+[a-z].*/.test(t)) return false
    return true
  }

  function flushBuffer() {
    const text = buffer.join('\n').trim()
    if (!text) return
    turns.push({ speaker: currentSpeaker, text })
    buffer = []
  }

  function nextNonEmptyLine(start: number) {
    for (let i = start; i < lines.length; i++) {
      const candidate = lines[i]?.trim()
      if (candidate) return candidate
    }
    return ''
  }

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] || '').trim()
    if (!line) continue

    const inlineHeaderMatch = line.match(inlineDiscordHeader)
    if (inlineHeaderMatch?.[1]) {
      flushBuffer()
      currentSpeaker = inlineHeaderMatch[1].trim() || 'Unknown'
      continue
    }

    if (discordTimestampOnly.test(line)) continue

    const next = nextNonEmptyLine(i + 1)
    if (!line.includes(':') && discordTimestampOnly.test(next)) {
      flushBuffer()
      currentSpeaker = line
      continue
    }

    const simpleMatch = line.match(simpleSpeakerLine)
    if (simpleMatch?.[1] && simpleMatch?.[2] && isLikelySpeakerToken(simpleMatch[1])) {
      flushBuffer()
      currentSpeaker = simpleMatch[1].trim()
      turns.push({ speaker: currentSpeaker || 'Unknown', text: simpleMatch[2].trim() })
      continue
    }

    buffer.push(line)
  }

  flushBuffer()
  return turns
}

const parsedTurns = computed(() => parseTranscript(transcript.value))

const conciseSummary = computed(() => summarizeOneLine(result.value?.summary))
const selectedJudge = computed(() => judgeProfiles[persona.value])

const evidenceLines = computed(() => {
  if (!result.value?.winner) return [] as string[]

  const winnerKey = normalizeSpeakerName(result.value.winner)
  const exact = parsedTurns.value.filter((t) => normalizeSpeakerName(t.speaker) === winnerKey)
  const loose = parsedTurns.value.filter((t) => {
    const key = normalizeSpeakerName(t.speaker)
    return key.includes(winnerKey) || winnerKey.includes(key)
  })

  const source = exact.length ? exact : loose.length ? loose : parsedTurns.value
  const lines = source.map((t) => trimForEvidence(t.text)).filter(Boolean)
  return lines.slice(0, 3)
})

const winnerMetric = computed(() => {
  if (!result.value?.participantMetrics?.length) return null
  const winnerKey = normalizeSpeakerName(result.value.winner)

  const exact = result.value.participantMetrics.find((m) => normalizeSpeakerName(m.speaker) === winnerKey)
  if (exact) return exact

  return (
    result.value.participantMetrics.find((m) => {
      const key = normalizeSpeakerName(m.speaker)
      return key.includes(winnerKey) || winnerKey.includes(key)
    }) || null
  )
})

const comparisonRows = computed(() => {
  const metrics = result.value?.participantMetrics
  if (!metrics || metrics.length < 2) return [] as ComparisonRow[]

  const left = metrics[0]
  const right = metrics[1]

  const wuLeader = left.wuEnergy >= right.wuEnergy ? left.speaker : right.speaker
  const delusionLeader = left.delusionMeter >= right.delusionMeter ? left.speaker : right.speaker

  return [
    {
      key: 'wu-energy',
      label: primaryWuMetricTitle(),
      leftValue: `${formatMetric(left.wuEnergy)} (${attachmentLabel(left.wuEnergy)})`,
      rightValue: `${formatMetric(right.wuEnergy)} (${attachmentLabel(right.wuEnergy)})`,
      why:
        analysisMode.value === 'meme'
          ? `${wuLeader} is carrying more imperial heat and status-grip.`
          : `${wuLeader} shows stronger attachment to merit/status framing.`
    },
    {
      key: 'delusion',
      label: primaryDelusionTitle(),
      leftValue: `${formatMetric(left.delusionMeter)} (${delusionLabel(left.delusionMeter)})`,
      rightValue: `${formatMetric(right.delusionMeter)} (${delusionLabel(right.delusionMeter)})`,
      why:
        analysisMode.value === 'meme'
          ? `${delusionLeader} is looping harder in conceptual theater.`
          : `${delusionLeader} exhibits higher conceptual fixation in this exchange.`
    }
  ]
})

const moveTraceAxisLabel = computed(() => {
  const first = moveTraceParticipants.value[0]
  const second = moveTraceParticipants.value[1]
  if (!first || !second) return ''
  return `How to read this: + means ${first} is currently closer to Emperor Wu. - means ${second} is currently closer. 0 means tied.`
})

const moveTraceParticipants = computed(() => {
  const metricsSpeakers = (result.value?.participantMetrics || [])
    .map((m) => (m.speaker || '').trim())
    .filter(Boolean)
  if (metricsSpeakers.length >= 2) {
    return [metricsSpeakers[0], metricsSpeakers[1]] as [string, string]
  }

  const traceSpeakers = [...new Set((result.value?.moveTrace || []).map((m) => (m.speaker || '').trim()).filter(Boolean))]
  if (traceSpeakers.length >= 2) {
    return [traceSpeakers[0], traceSpeakers[1]] as [string, string]
  }

  return ['', ''] as [string, string]
})

function moveLeanText(score: number) {
  const v = Math.max(-100, Math.min(100, Math.round(score)))
  const [first, second] = moveTraceParticipants.value
  if (v === 0) return 'Current read: even (0)'
  if (v > 0) return `Current read: ${first || 'First speaker'} is more Wu-like (${formatSigned(v)})`
  return `Current read: ${second || 'Second speaker'} is more Wu-like (${formatSigned(v)})`
}

function saveSessionCache() {
  if (!import.meta.client || isHydratingCache.value) return

  const payload: CachedSession = {
    version: 1,
    savedAt: new Date().toISOString(),
    transcript: transcript.value,
    includeReasoning: includeReasoning.value,
    includeCitations: includeCitations.value,
    includeTraceability: includeTraceability.value,
    includeMoveTrace: includeMoveTrace.value,
    debugPromptEcho: debugPromptEcho.value,
    includeVerse: includeVerse.value,
    strictMode: strictMode.value,
    persona: persona.value,
    analysisMode: analysisMode.value,
    result: result.value
  }

  try {
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore cache write failures (private mode/quota/etc.)
  }
}

function restoreSessionCache() {
  if (!import.meta.client) {
    isHydratingCache.value = false
    return
  }

  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY)
    if (!raw) {
      isHydratingCache.value = false
      return
    }

    const parsed = JSON.parse(raw) as Partial<CachedSession>
    if (parsed?.version !== 1) {
      isHydratingCache.value = false
      return
    }

    if (typeof parsed.transcript === 'string') transcript.value = parsed.transcript
    if (typeof parsed.includeReasoning === 'boolean') includeReasoning.value = parsed.includeReasoning
    if (typeof parsed.includeCitations === 'boolean') includeCitations.value = parsed.includeCitations
    if (typeof parsed.includeTraceability === 'boolean') includeTraceability.value = parsed.includeTraceability
    if (typeof parsed.includeMoveTrace === 'boolean') includeMoveTrace.value = parsed.includeMoveTrace
    if (typeof parsed.debugPromptEcho === 'boolean') debugPromptEcho.value = parsed.debugPromptEcho
    if (typeof parsed.includeVerse === 'boolean') includeVerse.value = parsed.includeVerse
    if (typeof parsed.strictMode === 'boolean') strictMode.value = parsed.strictMode
    if (parsed.persona === 'dogen' || parsed.persona === 'linji' || parsed.persona === 'alan-watts') {
      persona.value = parsed.persona
    }
    if (parsed.analysisMode === 'scholar' || parsed.analysisMode === 'meme') {
      analysisMode.value = parsed.analysisMode
    }
    if (parsed.result && typeof parsed.result.winner === 'string') {
      result.value = parsed.result as NonNullable<typeof result.value>
    }

    if (parsed.savedAt) {
      const when = new Date(parsed.savedAt)
      cacheNotice.value = `Restored previous result from ${when.toLocaleString()}.`
    } else {
      cacheNotice.value = 'Restored previous result from local cache.'
    }
  } catch {
    // Ignore malformed cache and continue with defaults.
  } finally {
    isHydratingCache.value = false
  }
}

function clearSessionCache() {
  if (!import.meta.client) return
  localStorage.removeItem(SESSION_CACHE_KEY)
  cacheNotice.value = 'Local cache cleared. Current in-memory result is still visible until refresh.'
}

async function judge() {
  loading.value = true
  error.value = ''
  result.value = null

  try {
    const chat = parseTranscript(transcript.value)
    const res = await $fetch('/api/judge', {
      method: 'POST',
      body: {
        chat,
        options: {
          includeReasoning: includeReasoning.value,
          includeCitations: includeCitations.value,
          includeTraceability: includeTraceability.value,
          includeMoveTrace: includeMoveTrace.value,
          debugPromptEcho: debugPromptEcho.value,
          includeVerse: includeVerse.value,
          persona: persona.value,
          strictMode: strictMode.value
        }
      }
    })

    result.value = (res as { result: typeof result.value }).result as NonNullable<typeof result.value>
    saveSessionCache()
  } catch (e: unknown) {
    const err = e as {
      message?: string
      statusCode?: number
      data?: { statusMessage?: string; message?: string }
    }
    const statusCode = err?.statusCode
    const statusMessage = err?.data?.statusMessage || err?.data?.message || err?.message

    if (statusCode === 429) {
      error.value = statusMessage || 'Gemini free-tier quota exhausted. Try again later.'
    } else {
      error.value = statusMessage || 'Request failed'
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  restoreSessionCache()
})

watch(
  [transcript, includeReasoning, includeCitations, includeTraceability, includeMoveTrace, debugPromptEcho, includeVerse, strictMode, persona, analysisMode, result],
  () => {
    saveSessionCache()
  },
  { deep: true }
)

watch(persona, (next, prev) => {
  if (isHydratingCache.value) return
  if (!prev || next === prev) return
  if (!result.value) return

  result.value = null
  cacheNotice.value = 'Judge changed. Click Judge to generate a new output.'
})

watch(includeTraceability, (next, prev) => {
  if (isHydratingCache.value) return
  if (next === prev) return
  if (!result.value) return

  result.value = null
  cacheNotice.value = 'Evidence-link setting changed. Click Judge to generate a new output.'
})

watch(includeMoveTrace, (next, prev) => {
  if (isHydratingCache.value) return
  if (next === prev) return
  if (!result.value) return

  result.value = null
  cacheNotice.value = 'Move-trace setting changed. Click Judge to generate a new output.'
})

watch(debugPromptEcho, (next, prev) => {
  if (isHydratingCache.value) return
  if (next === prev) return
  if (!result.value) return

  result.value = null
  cacheNotice.value = 'Prompt debug setting changed. Click Judge to generate a new output.'
})
</script>

<template>
  <main class="wrap">
    <section class="intro">
      <h1>Who Is Wu?</h1>
      <p class="sub">
        Paste a two-person argument.
        <USelect
          v-model="persona"
          :items="personaItems"
          value-key="value"
          class="persona-select"
          :ui="{
            content: 'min-w-[280px]',
            value: 'truncate-none',
            itemLabel: 'truncate-none'
          }"
        />
        will decide who is closest to Emperor Wu.
      </p>

      <div class="mode-row">
        <span class="mode-label">Output style</span>
        <USelect v-model="analysisMode" :items="analysisModeItems" value-key="value" class="mode-select" />
      </div>
    </section>

    <section class="form-shell">
      <UTextarea v-model="transcript" :rows="10" autoresize class="transcript-input" />

      <div class="judge-presence">
        <UAvatar :src="selectedJudge.avatar" :alt="selectedJudge.label" :text="selectedJudge.initials" size="lg" />
        <div class="judge-presence-copy">
          <p class="judge-presence-label">Current judge</p>
          <p class="judge-presence-name">{{ selectedJudge.label }}</p>
        </div>
      </div>

      <div class="opts">
        <div class="opt-item">
          <UCheckbox v-model="includeReasoning" label="Reasoning" />
        </div>
        <div class="opt-item">
          <UCheckbox v-model="includeCitations" label="Citations" />
        </div>
        <div class="opt-item">
          <UCheckbox v-model="includeVerse" label="Classical Verse" />
        </div>
        <div class="opt-item">
          <UCheckbox v-model="strictMode" label="Strict Mode" />
        </div>
      </div>

      <details class="advanced-flags">
        <summary>Advanced flags</summary>
        <div class="advanced-flag-list">
          <div class="opt-item">
            <UCheckbox v-model="includeTraceability" label="Explain evidence links (quote -> citation -> why)" />
          </div>
          <div class="opt-item">
            <UCheckbox v-model="includeMoveTrace" label="Move-by-move trace (stockfish style)" />
          </div>
          <div class="opt-item">
            <UCheckbox v-model="debugPromptEcho" label="Return exact prompt sent to Gemini (debug)" />
          </div>
        </div>
      </details>

      <div class="actions">
        <UButton :loading="loading" @click="judge">Judge</UButton>
        <UButton color="neutral" variant="ghost" @click="clearSessionCache">Clear Saved Session</UButton>
      </div>

      <p v-if="cacheNotice" class="cache-note">{{ cacheNotice }}</p>

    </section>

    <p v-if="error" class="err">{{ error }}</p>

    <section v-if="result" class="results-v2">
      <UCard class="summary-card">
        <div class="judge-presence judge-presence-result">
          <UAvatar :src="selectedJudge.avatar" :alt="selectedJudge.label" :text="selectedJudge.initials" size="sm" />
          <p class="judge-presence-inline">
            Judged by <strong>{{ selectedJudge.label }}</strong>
          </p>
        </div>

        <div class="summary-head">
          <div>
            <p class="eyebrow">Verdict</p>
            <h2 class="summary-title">{{ result.winner }} is closest to Emperor Wu</h2>
          </div>
          <UTooltip :text="`Raw confidence: ${formatConfidence(result.confidence)}`">
            <div class="confidence-chip" :class="confidenceToneClass(result.confidence)">
              {{ confidenceBand(result.confidence) }} confidence
            </div>
          </UTooltip>
        </div>

        <p class="summary-line">{{ conciseSummary }}</p>

        <div v-if="evidenceLines.length" class="evidence">
          <p class="block-title">Key evidence</p>
          <ul class="evidence-list">
            <li v-for="(line, idx) in evidenceLines" :key="`ev-${idx}`">"{{ line }}"</li>
          </ul>
        </div>

        <div v-if="result.citations?.length" class="citation-row">
          <UBadge
            v-for="(citation, idx) in result.citations"
            :key="`citation-${idx}`"
            color="neutral"
            variant="soft"
            class="citation-chip"
          >
            {{ citation }}
          </UBadge>
        </div>

        <div v-if="result.evidenceLinks?.length" class="traceability">
          <p class="block-title">Why these citations</p>
          <div class="traceability-list">
            <article
              v-for="(link, idx) in result.evidenceLinks"
              :key="`trace-${idx}`"
              class="traceability-item"
            >
              <p class="traceability-quote">“{{ link.chatQuote }}”</p>
              <p class="traceability-citation">
                <strong>Source:</strong> {{ link.citation }}
              </p>
              <p class="traceability-why">{{ link.why }}</p>
              <p v-if="link.appliedRule" class="traceability-rule">
                <strong>Rule:</strong> {{ link.appliedRule }}
              </p>
            </article>
          </div>
        </div>

        <details v-if="result.debugPrompt" class="prompt-debug">
          <summary>Exact prompt sent to Gemini (debug)</summary>
          <pre class="prompt-debug-text">{{ result.debugPrompt }}</pre>
        </details>
      </UCard>

      <UCard v-if="comparisonRows.length" class="comparison-card">
        <template #header>
          <h3 class="comparison-title">Quick comparison</h3>
        </template>

        <div class="comparison-grid">
          <p class="comparison-cell comparison-head">Metric</p>
          <p class="comparison-cell comparison-head">{{ result.participantMetrics?.[0]?.speaker }}</p>
          <p class="comparison-cell comparison-head">{{ result.participantMetrics?.[1]?.speaker }}</p>
          <p class="comparison-cell comparison-head">Why it differs</p>

          <template v-for="row in comparisonRows" :key="row.key">
            <p class="comparison-cell comparison-metric">{{ row.label }}</p>
            <p class="comparison-cell">{{ row.leftValue }}</p>
            <p class="comparison-cell">{{ row.rightValue }}</p>
            <p class="comparison-cell comparison-why">{{ row.why }}</p>
          </template>
        </div>

        <p class="comparison-foot">Default view shows only the two core axes. Open deep analysis for full diagnostics.</p>
      </UCard>

      <details class="deep-analysis">
        <summary>Deep analysis</summary>
        <div class="deep-content">
          <section class="deep-block" v-if="result.reasoning">
            <h3>Extended reasoning</h3>
            <QuoteText :text="result.reasoning" />
          </section>

          <section class="deep-block" v-if="result.moveTrace?.length">
            <h3>Move-by-move trace</h3>
            <p v-if="moveTraceAxisLabel" class="move-trace-axis">{{ moveTraceAxisLabel }}</p>
            <div class="move-trace-list">
              <article v-for="(move, idx) in result.moveTrace" :key="`move-${idx}`" class="move-trace-item">
                <div class="move-trace-head">
                  <p class="move-trace-title">Move {{ move.move }} - {{ move.speaker }}</p>
                  <p class="move-trace-score">{{ moveLeanText(move.positionScore) }}</p>
                </div>
                <p class="move-trace-quote">“{{ move.quote }}”</p>

                <div class="move-trace-deltas">
                  <span>Wu {{ formatSigned(move.wuEnergyDelta) }}</span>
                  <span>Delusion {{ formatSigned(move.delusionDelta) }}</span>
                  <span>Clarity {{ formatSigned(move.clarityDelta) }}</span>
                </div>

                <div class="move-trace-bar-track">
                  <div class="move-trace-bar-fill" :style="moveScoreBarStyle(move.positionScore)" />
                  <div class="move-trace-center-line" />
                </div>
                <div v-if="moveTraceParticipants[0] && moveTraceParticipants[1]" class="move-trace-bar-labels">
                  <span>{{ moveTraceParticipants[1] }} more Wu-like</span>
                  <span>{{ moveTraceParticipants[0] }} more Wu-like</span>
                </div>

                <p v-if="move.commentary" class="move-trace-commentary">{{ move.commentary }}</p>
                <p v-if="move.verse" class="move-trace-verse">{{ move.verse }}</p>
              </article>
            </div>
          </section>

          <section class="deep-block" v-else-if="result.moveTraceFallbackUsed">
            <h3>Move-by-move trace</h3>
            <p class="move-trace-fallback-note">
              Model did not return moveTrace for this run.
            </p>
          </section>

          <section class="deep-block" v-if="result.participantMetrics?.length">
            <h3>Participant diagnostics</h3>
            <div class="participant-grid">
              <UCard v-for="m in result.participantMetrics" :key="m.speaker" class="participant-card">
                <template #header>
                  <div class="participant-head">
                    <h4>{{ m.speaker }}</h4>
                    <UBadge
                      v-if="winnerMetric?.speaker === m.speaker"
                      color="primary"
                      variant="soft"
                    >
                      Closest to Wu
                    </UBadge>
                  </div>
                </template>

                <div class="core-metrics">
                  <div class="metric-panel">
                    <p class="panel-title">{{ primaryWuMetricTitle() }}</p>
                    <p class="panel-value">{{ formatMetric(m.wuEnergy) }} - {{ attachmentLabel(m.wuEnergy) }}</p>
                    <div class="axis-track"><div class="axis-fill" :style="meterStyle(m.wuEnergy, '#f97316')" /></div>
                    <QuoteText v-if="m.wuEnergyReason" :text="m.wuEnergyReason" note-class="metric-note" />
                  </div>

                  <div class="metric-panel">
                    <p class="panel-title">{{ primaryDelusionTitle() }}</p>
                    <p class="panel-value">{{ formatMetric(m.delusionMeter) }} - {{ delusionLabel(m.delusionMeter) }}</p>
                    <div class="axis-track"><div class="axis-fill" :style="meterStyle(m.delusionMeter, '#ef4444')" /></div>
                    <QuoteText v-if="m.delusionReason" :text="m.delusionReason" note-class="metric-note" />
                  </div>
                </div>

                <details class="participant-details">
                  <summary>More metrics</summary>
                  <div class="secondary-metrics">
                    <div class="metric-panel">
                      <p class="panel-title">{{ analysisMode === 'meme' ? 'Chance Of Enlightenment' : 'Liberation Readiness' }}</p>
                      <p class="panel-value">{{ formatMetric(m.chanceOfEnlightenment) }} - {{ enlightenmentLabel(m.chanceOfEnlightenment) }}</p>
                      <div class="axis-track">
                        <div class="axis-fill" :style="meterStyle(m.chanceOfEnlightenment, '#22c55e')" />
                      </div>
                      <QuoteText v-if="m.enlightenmentDescription" :text="m.enlightenmentDescription" note-class="metric-note" />
                      <QuoteText v-if="m.enlightenmentReason" :text="m.enlightenmentReason" note-class="metric-note" />
                    </div>

                    <div class="metric-panel">
                      <p class="panel-title">{{ analysisMode === 'meme' ? 'Saṃsāra Placement' : 'Realm Mapping' }}</p>
                      <p class="panel-value">{{ m.samsaraRealmLabel || 'Human Realm' }}</p>
                      <QuoteText v-if="m.samsaraRealmDescription" :text="m.samsaraRealmDescription" note-class="metric-note" />
                    </div>

                    <div class="metric-panel">
                      <p class="panel-title">Recommended practice</p>
                      <p class="panel-value">{{ m.recommendedPractice || 'Balanced path' }}</p>
                      <QuoteText v-if="m.recommendedPracticeReason" :text="m.recommendedPracticeReason" note-class="metric-note" />
                      <ul v-if="m.recommendedPracticeList?.length" class="practice-list">
                        <li v-for="(item, i) in m.recommendedPracticeList" :key="`${m.speaker}-practice-${i}`">{{ item }}</li>
                      </ul>
                    </div>

                    <div class="metric-panel">
                      <p class="panel-title">Three poisons</p>
                      <div class="poisons-wrap">
                        <div v-if="m.poisonProfileActive" class="poisons-pie" :style="poisonsPieStyle(m.threePoisons)" />
                        <div v-else class="poisons-off">Profile inactive (Delusion 50% or less)</div>
                        <div class="poisons-legend">
                          <p><span class="swatch greed" /> Greed: {{ formatMetric(m.threePoisons.greed) }}</p>
                          <p><span class="swatch hate" /> Hate: {{ formatMetric(m.threePoisons.hate) }}</p>
                          <p><span class="swatch ignorance" /> Ignorance: {{ formatMetric(m.threePoisons.ignorance) }}</p>
                        </div>
                      </div>
                      <QuoteText v-if="m.threePoisonsReason" :text="m.threePoisonsReason" note-class="metric-note" />
                    </div>
                  </div>
                </details>
              </UCard>
            </div>
          </section>

          <section class="deep-block" v-if="result.verseChinese || result.verseTranslation">
            <h3>Capping verse</h3>
            <pre v-if="result.verseChinese" class="verse">{{ result.verseChinese }}</pre>
            <p v-if="result.verseTranslation"><strong>Translation:</strong> {{ result.verseTranslation }}</p>
          </section>
        </div>
      </details>
    </section>
  </main>
</template>

<style scoped>
.wrap {
  max-width: 940px;
  margin: 1.6rem auto 2.5rem;
  padding: 1rem;
  font-family: ui-sans-serif, system-ui, sans-serif;
}

.intro {
  text-align: center;
  margin-bottom: 0.8rem;
}

.sub {
  opacity: 0.86;
  line-height: 1.5;
}

.persona-select {
  display: inline-flex;
  width: 280px;
  min-width: 280px;
  margin: 0 0.28rem;
  vertical-align: middle;
}

.persona-select :deep(button) {
  width: 100%;
}

.mode-row {
  margin: 0.8rem auto 0;
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
}

.mode-label {
  font-size: 0.9rem;
  opacity: 0.8;
}

.mode-select {
  width: 180px;
}

.form-shell {
  max-width: 760px;
  margin: 0 auto;
}

.transcript-input {
  display: block;
  width: 100%;
  margin: 0.9rem auto;
}

.transcript-input :deep(textarea) {
  min-height: 230px;
  resize: none;
}

.judge-presence {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0 0 0.75rem;
}

.judge-presence-copy {
  display: grid;
  gap: 0.05rem;
  text-align: left;
}

.judge-presence-label {
  margin: 0;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  opacity: 0.72;
}

.judge-presence-name {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}

.judge-presence-result {
  margin-bottom: 0.65rem;
}

.judge-presence-inline {
  margin: 0;
  font-size: 0.86rem;
  opacity: 0.85;
}

.opts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  justify-content: center;
  margin-bottom: 1rem;
}

.advanced-flags {
  margin: -0.35rem auto 0.8rem;
  max-width: 760px;
}

.advanced-flags summary {
  cursor: pointer;
  font-size: 0.84rem;
  opacity: 0.85;
}

.advanced-flag-list {
  margin-top: 0.45rem;
  display: grid;
  gap: 0.25rem;
}

.opt-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.actions {
  display: flex;
  justify-content: center;
  gap: 0.55rem;
  flex-wrap: wrap;
}

.cache-note {
  margin: 0.55rem 0 0;
  font-size: 0.82rem;
  opacity: 0.82;
  text-align: center;
}

.err {
  color: #ef4444;
  text-align: center;
  margin-top: 0.6rem;
}

.results-v2 {
  margin-top: 1.1rem;
  display: grid;
  gap: 0.85rem;
}

.summary-card {
  line-height: 1.42;
}

.summary-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
  opacity: 0.75;
}

.summary-title {
  margin: 0.1rem 0 0;
  font-size: 1.35rem;
  line-height: 1.2;
}

.confidence-chip {
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 0.35rem 0.7rem;
  font-size: 0.83rem;
  font-weight: 700;
}

.confidence-high {
  background: rgba(34, 197, 94, 0.12);
  border-color: rgba(34, 197, 94, 0.35);
}

.confidence-medium {
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.35);
}

.confidence-low {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.35);
}

.summary-line {
  margin: 0.7rem 0 0;
  font-size: 1rem;
  max-width: 68ch;
}

.evidence {
  margin-top: 0.75rem;
}

.block-title {
  margin: 0;
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  opacity: 0.8;
}

.evidence-list {
  margin: 0.32rem 0 0;
  padding-left: 1.1rem;
  max-width: 68ch;
}

.evidence-list li {
  margin: 0.2rem 0;
  line-height: 1.4;
}

.traceability {
  margin-top: 0.78rem;
}

.traceability-list {
  margin-top: 0.35rem;
  display: grid;
  gap: 0.5rem;
}

.traceability-item {
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 8px;
  padding: 0.55rem 0.65rem;
}

.traceability-quote,
.traceability-citation,
.traceability-why,
.traceability-rule {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.35;
}

.traceability-citation,
.traceability-rule {
  margin-top: 0.3rem;
}

.traceability-why {
  margin-top: 0.28rem;
}

.move-trace-list {
  display: grid;
  gap: 0.55rem;
}

.move-trace-axis,
.move-trace-fallback-note {
  margin: 0 0 0.45rem;
  font-size: 0.82rem;
  opacity: 0.84;
}

.move-trace-item {
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 8px;
  padding: 0.58rem 0.65rem;
}

.move-trace-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.move-trace-title,
.move-trace-score,
.move-trace-quote,
.move-trace-commentary,
.move-trace-verse {
  margin: 0;
}

.move-trace-title {
  font-size: 0.84rem;
  font-weight: 700;
}

.move-trace-score {
  font-size: 0.82rem;
  opacity: 0.84;
}

.move-trace-quote {
  margin-top: 0.32rem;
  font-size: 0.88rem;
  line-height: 1.35;
}

.move-trace-deltas {
  margin-top: 0.36rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  font-size: 0.8rem;
  opacity: 0.86;
}

.move-trace-bar-track {
  position: relative;
  margin-top: 0.34rem;
  height: 10px;
  background: rgba(148, 163, 184, 0.2);
  border-radius: 999px;
  overflow: hidden;
}

.move-trace-bar-fill {
  position: absolute;
  top: 0;
  height: 100%;
  border-radius: 999px;
}

.move-trace-center-line {
  position: absolute;
  left: 50%;
  top: 0;
  width: 1px;
  height: 100%;
  background: rgba(148, 163, 184, 0.55);
}

.move-trace-bar-labels {
  margin-top: 0.22rem;
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.74rem;
  opacity: 0.76;
}

.move-trace-commentary {
  margin-top: 0.38rem;
  font-size: 0.82rem;
  line-height: 1.35;
}

.move-trace-verse {
  margin-top: 0.3rem;
  font-size: 0.82rem;
  line-height: 1.35;
  font-style: italic;
  opacity: 0.9;
}

.prompt-debug {
  margin-top: 0.85rem;
}

.prompt-debug summary {
  cursor: pointer;
  font-size: 0.86rem;
  opacity: 0.88;
}

.prompt-debug-text {
  margin: 0.5rem 0 0;
  padding: 0.6rem;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(148, 163, 184, 0.08);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 0.79rem;
  line-height: 1.35;
  max-height: 420px;
  overflow: auto;
}

.citation-row {
  margin-top: 0.78rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.citation-chip {
  max-width: 100%;
}

.comparison-card {
  overflow-x: auto;
}

.comparison-title {
  margin: 0;
}

.comparison-grid {
  display: grid;
  grid-template-columns: 1.05fr 1fr 1fr 1.2fr;
  border-top: 1px solid rgba(148, 163, 184, 0.22);
  border-left: 1px solid rgba(148, 163, 184, 0.22);
}

.comparison-cell {
  margin: 0;
  padding: 0.58rem 0.62rem;
  border-right: 1px solid rgba(148, 163, 184, 0.22);
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
  line-height: 1.35;
  font-size: 0.9rem;
}

.comparison-head {
  font-size: 0.79rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.82;
}

.comparison-metric {
  font-weight: 700;
}

.comparison-why {
  opacity: 0.9;
}

.comparison-foot {
  margin: 0.55rem 0 0;
  font-size: 0.82rem;
  opacity: 0.83;
}

.deep-analysis {
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 10px;
  padding: 0.7rem 0.8rem;
}

.deep-analysis summary {
  cursor: pointer;
  font-weight: 700;
}

.deep-content {
  margin-top: 0.82rem;
  display: grid;
  gap: 0.9rem;
}

.deep-block h3 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
}

.participant-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 0.75rem;
}

.participant-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.45rem;
}

.participant-head h4 {
  margin: 0;
}

.core-metrics,
.secondary-metrics {
  display: grid;
  gap: 0.6rem;
}

.metric-panel {
  border: 1px solid rgba(148, 163, 184, 0.26);
  border-radius: 8px;
  padding: 0.58rem;
}

.panel-title {
  margin: 0;
  font-weight: 700;
  font-size: 0.87rem;
}

.panel-value {
  margin: 0.22rem 0 0.35rem;
  font-size: 0.9rem;
}

.axis-track {
  width: 100%;
  height: 10px;
  border-radius: 999px;
  background: rgba(226, 232, 240, 0.9);
  overflow: hidden;
  margin-bottom: 0.36rem;
}

.axis-fill {
  height: 100%;
  border-radius: 999px;
}

.metric-note {
  margin: 0.25rem 0 0;
  font-size: 0.83rem;
  line-height: 1.36;
}

.participant-details {
  margin-top: 0.65rem;
}

.participant-details summary {
  cursor: pointer;
  font-size: 0.87rem;
  opacity: 0.9;
  margin-bottom: 0.5rem;
}

.practice-list {
  margin: 0.38rem 0 0;
  padding-left: 1.1rem;
  font-size: 0.85rem;
}

.practice-list li {
  margin: 0.2rem 0;
}

.poisons-wrap {
  display: flex;
  gap: 0.7rem;
  align-items: flex-start;
}

.poisons-pie {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  border: 1px solid rgba(148, 163, 184, 0.3);
  flex: 0 0 auto;
}

.poisons-off {
  width: 84px;
  min-height: 84px;
  border: 1px dashed rgba(148, 163, 184, 0.5);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 0.73rem;
  opacity: 0.78;
  padding: 0.35rem;
  flex: 0 0 auto;
}

.poisons-legend p {
  margin: 0.18rem 0;
  font-size: 0.84rem;
}

.swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  margin-right: 0.3rem;
}

.swatch.greed {
  background: #f59e0b;
}

.swatch.hate {
  background: #ef4444;
}

.swatch.ignorance {
  background: #64748b;
}

.verse {
  white-space: pre-wrap;
  margin: 0.45rem 0;
}

@media (max-width: 900px) {
  .comparison-grid {
    grid-template-columns: 1fr;
  }

  .comparison-head {
    display: none;
  }

  .comparison-cell {
    padding: 0.5rem 0;
    border: none;
    border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  }

  .comparison-metric {
    margin-top: 0.6rem;
    font-size: 0.88rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.86;
  }

  .comparison-grid .comparison-cell:nth-of-type(4n + 2)::before {
    content: 'Left:';
    display: block;
    font-size: 0.78rem;
    opacity: 0.7;
    margin-bottom: 0.15rem;
  }

  .comparison-grid .comparison-cell:nth-of-type(4n + 3)::before {
    content: 'Right:';
    display: block;
    font-size: 0.78rem;
    opacity: 0.7;
    margin-bottom: 0.15rem;
  }

  .comparison-grid .comparison-cell:nth-of-type(4n + 4)::before {
    content: 'Difference:';
    display: block;
    font-size: 0.78rem;
    opacity: 0.7;
    margin-bottom: 0.15rem;
  }
}

@media (max-width: 760px) {
  .wrap {
    margin-top: 1rem;
    padding: 0.8rem;
  }

  .persona-select {
    width: 100%;
    min-width: 0;
    margin: 0.45rem 0 0;
  }

  .mode-row {
    display: flex;
    width: 100%;
    justify-content: center;
  }

  .mode-select {
    width: 170px;
  }

  .summary-title {
    font-size: 1.14rem;
  }

  .transcript-input :deep(textarea) {
    min-height: 180px;
  }

  .judge-presence {
    margin-bottom: 0.65rem;
  }

  .participant-grid {
    grid-template-columns: 1fr;
  }

  .poisons-wrap {
    flex-direction: column;
  }
}
</style>
