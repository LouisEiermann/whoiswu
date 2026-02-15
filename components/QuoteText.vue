<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    text?: string
    noteClass?: string
  }>(),
  {
    text: '',
    noteClass: ''
  }
)

const parsed = computed(() => {
  const value = (props.text || '').trim()
  if (!value) return { quote: '', remainder: '' }

  const patterns = [
    /"([^"]+)"/,
    /„([^“]+)“/,
    /“([^”]+)”/
  ]

  for (const pattern of patterns) {
    const match = value.match(pattern)
    if (match?.[1]) {
      const quote = match[1].trim()
      const remainder = value.replace(match[0], '').replace(/\s{2,}/g, ' ').trim()
      return { quote, remainder }
    }
  }

  return { quote: '', remainder: value }
})
</script>

<template>
  <div v-if="parsed.quote || parsed.remainder">
    <blockquote v-if="parsed.quote" class="quote-block">{{ parsed.quote }}</blockquote>
    <p v-if="parsed.remainder" :class="noteClass">{{ parsed.remainder }}</p>
  </div>
</template>

<style scoped>
.quote-block {
  border-left: 3px solid var(--ui-border, #d1d5db);
  margin: 0.35rem 0;
  padding: 0.35rem 0.65rem;
  font-size: 0.88rem;
  line-height: 1.45;
  background: transparent;
  color: inherit;
  border-radius: 0 6px 6px 0;
}
</style>
