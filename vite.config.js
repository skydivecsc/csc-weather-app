import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const PROJECT_DIRECTORY = fileURLToPath(new URL('.', import.meta.url))

const REQUIRED_PUBLIC_SETTINGS = [
  'VITE_LOGIN_BASE_URL',
  'VITE_PUBLIC_SITE_URL',
  'VITE_PUBLIC_SITE_LABEL',
  'VITE_TRIVIA_SITE_URL',
  'VITE_TRIVIA_SITE_LABEL',
]

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, PROJECT_DIRECTORY, 'VITE_')
  const missingSettings = REQUIRED_PUBLIC_SETTINGS.filter(
    (name) => !env[name]?.trim(),
  )

  if (missingSettings.length > 0) {
    throw new Error(
      `Missing required build settings for ${mode}: ${missingSettings.join(', ')}`,
    )
  }

  for (const name of [
    'VITE_LOGIN_BASE_URL',
    'VITE_PUBLIC_SITE_URL',
    'VITE_TRIVIA_SITE_URL',
  ]) {
    const url = new URL(env[name])

    if (url.protocol !== 'https:') {
      throw new Error(`${name} must use https`)
    }
  }

  return {
    plugins: [react()],
    server: {
      port: 3000
    }
  }
})
