/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solidPlugin()],
  css: {
    lightningcss: {
      errorRecovery: true,
    },
  },
  // relative asset paths so the build works from a GitHub Pages sub-path
  base: './',
  test: {
    // vite-plugin-solid defaults to jsdom; lib tests only need node
    environment: 'node',
  },
})
