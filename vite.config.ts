import { defineConfig } from 'vite'
import { createCoachHandler } from './server/coach.mjs'

export default defineConfig({
  base: './',
  plugins: [{
    name: 'server-coach',
    configureServer(server) {
      server.middlewares.use(createCoachHandler())
    },
  }],
})
