import { judgeWhoIsWu } from '../../utils/judge'
import { enforceFriendGuards } from '../../utils/guard'

function parseDiscordTranscript(transcript: string) {
  const lines = transcript.split('\n')
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

    if (discordTimestampOnly.test(line)) {
      continue
    }

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

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as {
    transcript?: string
    includeReasoning?: boolean
    includeCitations?: boolean
    includeTraceability?: boolean
    includeMoveTrace?: boolean
    debugPromptEcho?: boolean
    includeVerse?: boolean
    persona?: 'dogen' | 'linji' | 'alan-watts' | 'default'
    strictMode?: boolean
  }

  if (!body.transcript) {
    return sendError(
      event,
      createError({ statusCode: 400, statusMessage: 'Missing transcript' })
    )
  }

  try {
    const chat = parseDiscordTranscript(body.transcript)
    const speakerCount = new Set(chat.map((x) => x.speaker).filter(Boolean)).size
    enforceFriendGuards(event, body.transcript, speakerCount)

    const result = await judgeWhoIsWu({
      chat,
      options: {
        includeReasoning: body.includeReasoning ?? true,
        includeCitations: body.includeCitations ?? true,
        includeTraceability: body.includeTraceability ?? false,
        includeMoveTrace: body.includeMoveTrace ?? false,
        debugPromptEcho: body.debugPromptEcho ?? false,
        includeVerse: body.includeVerse ?? false,
        persona: body.persona ?? 'dogen',
        strictMode: body.strictMode ?? false
      }
    })

    return {
      ok: true,
      result,
      discordMessage: `Winner (closest to Emperor Wu): ${result.winner} (confidence ${result.confidence})`
    }
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode || 500
    return sendError(
      event,
      createError({
        statusCode,
        statusMessage: (err as Error)?.message || 'Discord judge failed'
      })
    )
  }
})
