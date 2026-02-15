import { judgeWhoIsWu } from '../utils/judge'
import { enforceFriendGuards } from '../utils/guard'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  try {
    const turns = Array.isArray(body?.chat) ? body.chat : []
    const transcriptText = turns
      .map((t: { speaker?: string; text?: string }) => `${t?.speaker || ''}: ${t?.text || ''}`)
      .join('\n')
    const speakerCount = new Set(
      turns.map((t: { speaker?: string }) => (t?.speaker || '').trim()).filter(Boolean)
    ).size

    enforceFriendGuards(event, transcriptText, speakerCount)

    const result = await judgeWhoIsWu(body)
    return { ok: true, result }
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode || 500
    return sendError(
      event,
      createError({
        statusCode,
        statusMessage: (err as Error)?.message || 'Judge failed'
      })
    )
  }
})
