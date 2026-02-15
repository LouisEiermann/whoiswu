<template>
  <main class="wrap">
    <h1>What Is This About?</h1>
    <p>
      <strong>Who Is Wu?</strong> is a dharma-combat style judge for argument transcripts.
      You paste a dialogue, and the app predicts which speaker is closer to Emperor Wu in
      the famous Zen exchange between Emperor Wu and Bodhidharma.
    </p>

    <h2>How It Judges</h2>
    <p>
      The model compares both sides against a small Mahayana-oriented reference set and a
      judge prompt. It returns a winner, confidence, summary, and optionally reasoning,
      citations, and a capping verse in classical-style Chinese with translation.
    </p>

    <h2>What “Closer to Wu” Means</h2>
    <p>
      In this project’s framing, “closer to Wu” means relatively more attachment to merit,
      status, fixed concepts, or conceptual certainty in the exchange.
    </p>

    <h2>Limits</h2>
    <p>
      This is an interpretive experiment, not authoritative Buddhist scholarship. Outputs can
      be wrong, overly confident, or stylistically biased by prompt/model behavior.
    </p>

    <h2>Reference</h2>
    <p>
      Background on the Emperor Wu and Bodhidharma exchange:
      <a
        href="https://en.wikipedia.org/wiki/Buddhist_legends_about_Emperor_Wu_of_Liang#The_emperor's_encounter_with_Bodhidharma"
        target="_blank"
        rel="noopener noreferrer"
      >
        Buddhist legends about Emperor Wu of Liang
      </a>
    </p>
  </main>
</template>

<style scoped>
.wrap {
  max-width: 800px;
  margin: 2rem auto;
  padding: 1rem;
  font-family: ui-sans-serif, system-ui, sans-serif;
}
</style>
