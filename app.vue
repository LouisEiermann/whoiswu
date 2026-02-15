<template>
  <UApp>
    <div>
      <header class="site-header">
        <NuxtLink to="/" class="brand">Who Is Wu?</NuxtLink>
        <nav>
          <NuxtLink to="/what-is-this-about" class="nav-link">What is this about?</NuxtLink>
        </nav>
      </header>
      <NuxtPage />
    </div>
  </UApp>
</template>

<style scoped>
.site-header {
  max-width: 900px;
  margin: 0 auto;
  padding: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e3e3e3;
}

.brand {
  font-weight: 700;
  text-decoration: none;
  color: inherit;
}

.nav-link {
  text-decoration: none;
}
</style>
