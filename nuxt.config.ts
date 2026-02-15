export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/png', href: '/emperorwu-favicon.png' },
        { rel: 'shortcut icon', type: 'image/png', href: '/emperorwu-favicon.png' },
        { rel: 'apple-touch-icon', href: '/emperorwu-favicon.png' }
      ]
    }
  },
  vite: {
    server: {
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        'dc61-2a00-6020-479f-1200-5c34-cf1b-b0c0-2a78.ngrok-free.app',
        '.ngrok-free.app'
      ]
    }
  }
})
