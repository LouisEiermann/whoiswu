export type ScriptureChunk = {
  id: string
  source: string
  citationLabel: string
  text: string
}

export const MAHAYANA_CHUNKS: ScriptureChunk[] = [
  {
    id: 'platform-sutra-1',
    source: 'The Platform Sutra of the Sixth Patriarch',
    citationLabel: 'Platform Sutra (Sixth Patriarch), Mirror Verse passage',
    text: 'Originally there is not a single thing. Where can dust alight?'
  },
  {
    id: 'diamond-sutra-1',
    source: 'Diamond Sutra (Vajracchedika Prajnaparamita Sutra)',
    citationLabel: 'Diamond Sutra, non-abiding mind passage',
    text: 'Develop a mind that does not abide anywhere.'
  },
  {
    id: 'heart-sutra-1',
    source: 'Heart Sutra (Prajnaparamita Hrdaya)',
    citationLabel: 'Heart Sutra, emptiness formula',
    text: 'Form is emptiness; emptiness is form.'
  },
  {
    id: 'wu-bodhidharma-1',
    source: 'Blue Cliff Record (Biyan Lu), Case 1',
    citationLabel: 'Blue Cliff Record, Case 1: Emperor Wu and Bodhidharma',
    text: 'Emperor Wu asked what merit he earned by supporting Buddhism. Bodhidharma replied: no merit.'
  },
  {
    id: 'vimalakirti-1',
    source: 'Vimalakirti Nirdesa Sutra',
    citationLabel: 'Vimalakirti Sutra, non-duality and beyond-concepts theme',
    text: 'The Dharma is beyond signs and beyond argument fixed in views.'
  }
]
