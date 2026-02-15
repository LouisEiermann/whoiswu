import { createError, getRequestIP, type H3Event } from 'h3'

type Bucket = {
  count: number
  resetAt: number
}

const minuteBuckets = new Map<string, Bucket>()
const dayBuckets = new Map<string, Bucket>()

function nowMs() {
  return Date.now()
}

function ensureBucket(
  map: Map<string, Bucket>,
  key: string,
  windowMs: number
): Bucket {
  const now = nowMs()
  const existing = map.get(key)

  if (!existing || existing.resetAt <= now) {
    const fresh = { count: 0, resetAt: now + windowMs }
    map.set(key, fresh)
    return fresh
  }

  return existing
}

function hitLimit(
  map: Map<string, Bucket>,
  key: string,
  windowMs: number,
  max: number
) {
  const bucket = ensureBucket(map, key, windowMs)
  bucket.count += 1
  return bucket.count > max
}

export function getClientId(event: H3Event) {
  const ip =
    getRequestIP(event, { xForwardedFor: true }) ||
    event.node.req.headers['x-real-ip'] ||
    'unknown'
  return String(ip)
}

export function enforceFriendGuards(
  event: H3Event,
  transcriptText: string,
  speakerCount: number
) {
  const clientId = getClientId(event)

  const allowlistRaw = process.env.WHOISWU_ALLOWLIST || ''
  const allowlist = allowlistRaw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

  if (allowlist.length > 0 && !allowlist.includes(clientId)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Not allowlisted'
    })
  }

  const maxChars = Number(process.env.WHOISWU_MAX_TRANSCRIPT_CHARS || 4000)
  if (transcriptText.length > maxChars) {
    throw createError({
      statusCode: 413,
      statusMessage: `Transcript too long (max ${maxChars} chars)`
    })
  }

  const maxSpeakers = Number(process.env.WHOISWU_MAX_SPEAKERS || 6)
  if (speakerCount > maxSpeakers) {
    throw createError({
      statusCode: 400,
      statusMessage: `Too many speakers (max ${maxSpeakers})`
    })
  }

  const perMinute = Number(process.env.WHOISWU_MAX_REQ_PER_MINUTE || 8)
  const perDay = Number(process.env.WHOISWU_MAX_REQ_PER_DAY || 150)

  if (hitLimit(minuteBuckets, `${clientId}:m`, 60_000, perMinute)) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Rate limit hit (per-minute)'
    })
  }

  if (hitLimit(dayBuckets, `${clientId}:d`, 86_400_000, perDay)) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Rate limit hit (daily)'
    })
  }
}
