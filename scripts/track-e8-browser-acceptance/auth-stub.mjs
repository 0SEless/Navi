import { createServer } from 'node:http'

const host = '127.0.0.1'
const port = 45678
const anonKey = 'e8-local-synthetic-anon-key'
const bearer = 'e8-local-synthetic-admin-token'

const server = createServer((request, response) => {
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200).end(JSON.stringify({ ok: true, mode: 'synthetic-auth-only' }))
    return
  }
  if (request.method === 'GET' && request.url === '/auth/v1/user') {
    if (request.headers.apikey !== anonKey || request.headers.authorization !== `Bearer ${bearer}`) {
      response.writeHead(401).end(JSON.stringify({ message: 'Synthetic session rejected.' }))
      return
    }
    response.writeHead(200).end(JSON.stringify({
      id: 'e8-browser-global-admin',
      email: 'e8-browser-admin@example.test',
      app_metadata: { role: 'super_admin' },
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-10-30T00:00:00.000Z',
    }))
    return
  }
  response.writeHead(404).end(JSON.stringify({ message: 'Synthetic auth stub has no such route.' }))
})

server.listen(port, host)
server.on('listening', () => process.stdout.write(`Synthetic Auth stub listening on http://${host}:${port}\n`))
server.on('error', (error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1 })
