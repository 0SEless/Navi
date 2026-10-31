import { createWriteStream, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const draftsDisabled = process.env.NAVI_TRACK_C1_DRAFTS_DISABLED === '1'
const scopedHistoryEnabled = process.env.NAVI_TRACK_E2_SCOPED_HISTORY === '1'

function configuredPort(name, fallback) {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be a valid TCP port; received ${process.env[name]}`)
  }
  return value
}

const appPort = configuredPort('NAVI_TRACK_C1_PORT', draftsDisabled ? 3188 : 3187)
const authPort = configuredPort('NAVI_TRACK_C1_AUTH_PORT', draftsDisabled ? 3990 : 3989)
const healthPort = configuredPort('NAVI_TRACK_C1_HEALTH_PORT', draftsDisabled ? 4190 : 4189)
const startupDeadlineMs = 165_000
const startedAt = Date.now()
const logsDirectory = path.join(root, 'reports', 'navi-studio-1.5-track-e2', 'logs')
mkdirSync(logsDirectory, { recursive: true })
const logPath = path.join(logsDirectory, 'local-server.log')
const logFile = createWriteStream(logPath, { flags: 'a' })

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`
  process.stdout.write(line)
  logFile.write(line)
}

const authStub = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', `http://127.0.0.1:${authPort}`).pathname
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (request.method === 'OPTIONS') {
    response.writeHead(204).end()
    return
  }
  if (request.method === 'GET' && pathname === '/auth/v1/user') {
    response.writeHead(401, { 'Content-Type': 'application/json' }).end('{"message":"local test stub: no Supabase session"}')
    return
  }
  log(`[track-c1-safety] rejected unexpected local backend request ${request.method} ${pathname}`)
  response.writeHead(403, { 'Content-Type': 'application/json' }).end('{"error":"local test stub rejects data/auth/storage operations"}')
})

await new Promise((resolve, reject) => {
  authStub.once('error', reject)
  authStub.listen(authPort, '127.0.0.1', resolve)
})

let nextReady = false
let nextChildExit = null
const healthServer = createServer((request, response) => {
  if (request.url !== '/ready') {
    response.writeHead(404).end()
    return
  }
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.writeHead(nextReady ? 200 : 503).end(JSON.stringify({
    ready: nextReady,
    appPort,
    childExit: nextChildExit,
  }))
})

await new Promise((resolve, reject) => {
  healthServer.once('error', reject)
  healthServer.listen(healthPort, '127.0.0.1', resolve)
})

const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
const nextUrl = `http://127.0.0.1:${appPort}/`
const child = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(appPort)], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    NODE_ENV: 'development',
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${authPort}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-only-test-value-not-a-credential',
    NEXT_PUBLIC_MOCK_AUTH: 'true',
    NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS: draftsDisabled ? 'false' : 'true',
    NEXT_PUBLIC_NAVI_STUDIO_SCOPED_HISTORY: scopedHistoryEnabled ? 'true' : 'false',
    NEXT_TELEMETRY_DISABLED: '1',
  },
})

log(`[track-c1-startup] root=${root}`)
log(`[track-c1-startup] app=127.0.0.1:${appPort} auth=127.0.0.1:${authPort} health=127.0.0.1:${healthPort}`)
log(`[track-c1-startup] NODE_ENV=development localDrafts=${!draftsDisabled} scopedHistory=${scopedHistoryEnabled}`)
log(`[track-c1-startup] waiting for an HTTP 2xx/3xx response from ${nextUrl}; deadline=${startupDeadlineMs}ms`)
log(`[track-c1-startup] log=${logPath}`)

for (const [streamName, stream] of [['stdout', child.stdout], ['stderr', child.stderr]]) {
  stream.on('data', (chunk) => {
    const text = chunk.toString()
    process[streamName === 'stderr' ? 'stderr' : 'stdout'].write(text)
    logFile.write(`[next:${streamName}] ${text}`)
  })
}

let probeRunning = false
let probeCount = 0
let lastProbe = 'not started'
async function probeNext() {
  if (nextReady || probeRunning || nextChildExit) return
  probeRunning = true
  probeCount += 1
  try {
    const response = await fetch(nextUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(2500),
    })
    await response.body?.cancel()
    lastProbe = `HTTP ${response.status}`
    if (response.status >= 200 && response.status < 400) {
      nextReady = true
      log(`[track-c1-ready] Next responded ${lastProbe} after ${Date.now() - startedAt}ms (probe ${probeCount})`)
    } else if (probeCount === 1 || probeCount % 10 === 0) {
      log(`[track-c1-wait] ${nextUrl} returned ${lastProbe} after ${Date.now() - startedAt}ms`)
    }
  } catch (error) {
    lastProbe = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    if (probeCount === 1 || probeCount % 10 === 0) {
      log(`[track-c1-wait] ${nextUrl} unavailable after ${Date.now() - startedAt}ms: ${lastProbe}`)
    }
  } finally {
    probeRunning = false
  }
}

const probeTimer = setInterval(() => { void probeNext() }, 1000)
void probeNext()

const startupDeadline = setTimeout(() => {
  if (nextReady || nextChildExit) return
  log(`[track-c1-timeout] no HTTP response after ${startupDeadlineMs}ms; last=${lastProbe}`)
  child.kill('SIGTERM')
}, startupDeadlineMs)

let stopping = false
function stopHarness(signal) {
  if (stopping) return
  stopping = true
  log(`[track-c1-stop] received ${signal}; stopping only the owned Next child and local stubs`)
  child.kill(signal)
}

function closeHarness() {
  clearInterval(probeTimer)
  clearTimeout(startupDeadline)
  healthServer.close()
  authStub.close()
  logFile.end()
}

process.once('SIGINT', () => stopHarness('SIGINT'))
process.once('SIGTERM', () => stopHarness('SIGTERM'))
child.once('error', (error) => {
  log(`[track-c1-child-error] ${error.stack ?? error.message}`)
  nextChildExit = -1
  closeHarness()
  process.exitCode = 1
})
child.once('exit', (code, signal) => {
  nextChildExit = code ?? signal ?? -1
  log(`[track-c1-child-exit] code=${code} signal=${signal} elapsed=${Date.now() - startedAt}ms`)
  closeHarness()
  process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1)
})
