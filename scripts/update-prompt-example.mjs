import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createJiti } from 'jiti'

const root = resolve(process.cwd())
const jiti = createJiti(import.meta.url)

const { buildAllFlagsExamplePrompt } = await jiti(resolve(root, 'server/utils/judge.ts'))

if (typeof buildAllFlagsExamplePrompt !== 'function') {
  throw new Error('buildAllFlagsExamplePrompt export not found in server/utils/judge.ts')
}

const prompt = await buildAllFlagsExamplePrompt()
const outPath = resolve(root, 'docs/gemini-prompt-all-flags.txt')

const header = [
  '# Gemini Prompt Snapshot (All Flags Active)',
  '',
  'This file is auto-generated from live code in `server/utils/judge.ts`.',
  'Regenerate with `npm run prompt:example` after changing prompt logic or flags.',
  'Everything after `---` is the exact prompt text sent to Gemini for this snapshot scenario.',
  '',
  '---',
  ''
].join('\n')

await writeFile(outPath, `${header}${prompt}\n`, 'utf8')
console.log(`Wrote ${outPath}`)
