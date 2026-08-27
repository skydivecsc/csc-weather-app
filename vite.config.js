import { execFileSync } from 'node:child_process'
import { env as processEnvironment } from 'node:process'
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

const BUILD_COMMIT_PATTERN = /^[0-9a-f]{40}$/

export const resolveBuildCommit = (
  publicSettings,
  environment = processEnvironment,
) => {
  const cscwxBuildCommit = environment.CSCWX_BUILD_COMMIT?.trim()
  const viteBuildCommit = (
    environment.VITE_BUILD_COMMIT || publicSettings.VITE_BUILD_COMMIT
  )?.trim()

  if (
    cscwxBuildCommit &&
    viteBuildCommit &&
    cscwxBuildCommit !== viteBuildCommit
  ) {
    throw new Error(
      'CSCWX_BUILD_COMMIT and VITE_BUILD_COMMIT must identify the same commit',
    )
  }

  let buildCommit = cscwxBuildCommit || viteBuildCommit

  if (!buildCommit) {
    try {
      buildCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: PROJECT_DIRECTORY,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    } catch {
      throw new Error(
        'Set CSCWX_BUILD_COMMIT or VITE_BUILD_COMMIT when building outside a Git checkout',
      )
    }
  }

  if (!BUILD_COMMIT_PATTERN.test(buildCommit)) {
    throw new Error(
      'The frontend build commit must be an exact lowercase 40-character Git SHA',
    )
  }

  return buildCommit
}

const versionManifestPlugin = (buildId) => {
  const source = `${JSON.stringify({ buildId })}\n`

  const serveManifest = (request, response, next) => {
    if (request.url?.split('?', 1)[0] !== '/version.json') {
      next()
      return
    }

    response.statusCode = 200
    response.setHeader('Cache-Control', 'no-store, max-age=0')
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(source)
  }

  return {
    name: 'cscwx-version-manifest',
    configurePreviewServer(server) {
      server.middlewares.use(serveManifest)
    },
    configureServer(server) {
      server.middlewares.use(serveManifest)
    },
    generateBundle() {
      this.emitFile({
        fileName: 'version.json',
        source,
        type: 'asset',
      })
    },
  }
}

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

  const buildCommit = resolveBuildCommit(env)

  return {
    define: {
      'import.meta.env.VITE_BUILD_COMMIT': JSON.stringify(buildCommit),
    },
    plugins: [react(), versionManifestPlugin(buildCommit)],
    server: {
      port: 3000
    }
  }
})
