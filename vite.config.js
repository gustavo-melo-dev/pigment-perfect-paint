import { defineConfig } from 'vite'

export default defineConfig({
    server: {
        // Whitelist a specific host for the dev server
        allowedHosts: ['paint.gustavomelo.dev']
    }
})