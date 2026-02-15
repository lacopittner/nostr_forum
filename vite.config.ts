import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import fs from 'node:fs'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const relayRewrite = (requestPath: string, relayPrefix: string) => {
  const rewritten = requestPath.replace(new RegExp(`^${relayPrefix}`), '')
  return rewritten.length > 0 ? rewritten : '/'
}

const readPemFile = (filePath?: string): Buffer | undefined => {
  if (!filePath) return undefined

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath)

  if (!fs.existsSync(absolutePath)) {
    console.warn(`[vite] SSL file not found: ${absolutePath}`)
    return undefined
  }

  return fs.readFileSync(absolutePath)
}

const resolveHttpsOptions = (certPath?: string, keyPath?: string) => {
  const cert = readPemFile(certPath)
  const key = readPemFile(keyPath)
  if (!cert || !key) return undefined

  return { cert, key }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const relayTarget = env.VITE_LOCAL_RELAY_TARGET || 'ws://127.0.0.1:4433'
  const relayTarget2 = env.VITE_LOCAL_RELAY_TARGET_2 || 'ws://127.0.0.1:4434'
  const httpsOptions = resolveHttpsOptions(env.VITE_SSL_CERT, env.VITE_SSL_KEY)

  const proxy = {
    '^/relay2(?:/|$)': {
      target: relayTarget2,
      ws: true,
      changeOrigin: true,
      secure: false,
      rewrite: (requestPath: string) => relayRewrite(requestPath, '/relay2'),
    },
    '/relay': {
      target: relayTarget,
      ws: true,
      changeOrigin: true,
      secure: false,
      rewrite: (requestPath: string) => relayRewrite(requestPath, '/relay'),
    },
  }

  return {
    plugins: [react()],
    server: {
      host: true,
      allowedHosts: true,
      https: httpsOptions,
      proxy,
    },
    preview: {
      host: true,
      allowedHosts: true,
      https: httpsOptions,
      proxy,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
