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
  base: './',
  test: {
    environment: 'node',
  },
})
