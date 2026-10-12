#!/usr/bin/env node
import { createServer } from 'node:http'
import { existsSync, readFileSync, renameSync, statSync, watch, writeFileSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { timingSafeEqual } from 'node:crypto'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

export function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 2) out[String(argv[i]).replace(/^--/, '')] = argv[i + 1]
  return out
}

export function tokenMatches(given, token) {
  if (typeof given !== 'string' || given.length !== token.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(token))
}

export function isLocalHost(host) {
  return typeof host === 'string' && /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)
}

export const BODY_MAX = 16384
const ACTIONS = new Set(['converse', 'stop', 'answer', 'say', 'session'])
const ANSWER_ID = /^[A-Za-z0-9_-]{1,20}$/
const ASK_ID = /^[A-Za-z0-9_-]{1,40}$/
const ANSWERS_MAX = 5
const AGENT_ID = /^[A-Za-z0-9._:-]{1,64}$/
const REQUEST_ID = /^[A-Za-z0-9-]{1,40}$/
const TEXT_MAX = 300
const MESSAGE_MAX = 2000
const INBOX_KEPT = 50

export function readAction(body) {
  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    return undefined
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
  const { request, action, agent, text = '', answers = [], ask } = parsed
  if (typeof request !== 'string' || !REQUEST_ID.test(request)) return undefined
  if (typeof action !== 'string' || !ACTIONS.has(action)) return undefined
  if (typeof agent !== 'string' || !AGENT_ID.test(agent)) return undefined
  if (typeof text !== 'string' || text.length > MESSAGE_MAX) return undefined
  if (ask !== undefined && (typeof ask !== 'string' || !ASK_ID.test(ask))) return undefined
  if (!Array.isArray(answers) || answers.length > ANSWERS_MAX) return undefined
  for (const one of answers) {
    if (one === null || typeof one !== 'object' || typeof one.id !== 'string' || !ANSWER_ID.test(one.id) || typeof one.text !== 'string' || one.text.length > TEXT_MAX) return undefined
    if (one.other !== undefined && typeof one.other !== 'boolean') return undefined
  }
  const picked = answers.map(one => (one.other === true ? { id: one.id, text: one.text, other: true } : { id: one.id, text: one.text }))
  return { request, action, agent, text, answers: picked, ...(ask !== undefined ? { ask } : {}) }
}

export function appendInbox(dir, entry) {
  const file = join(dir, 'inbox.json')
  let list = []
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (Array.isArray(parsed)) list = parsed
  } catch {
    list = []
  }
  const next = [...list, entry].slice(-INBOX_KEPT)
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(next))
  renameSync(tmp, file)
}

function reply(res, status, body) {
  res.writeHead(status, { 'content-type': TYPES['.json'], 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

export function staticPath(web, pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '')
  if (clean.includes('..')) return undefined
  const full = join(web, clean)
  if (!full.startsWith(web.endsWith(sep) ? web : web + sep)) return undefined
  return TYPES[extname(full)] !== undefined ? full : undefined
}

export function startServer({ dir, web, token, port = 0, pollMs = 250 }) {
  const stateFile = join(dir, 'state.json')
  const portFile = join(dir, 'server.json')
  let last = '{}'
  let version = -Infinity
  const clients = new Set()

  const readState = () => {
    let text
    try {
      text = readFileSync(stateFile, 'utf8')
    } catch {
      return
    }
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      return
    }
    const next = typeof parsed.version === 'number' ? parsed.version : 0
    if (next <= version) return
    version = next
    last = text
    for (const client of clients) client.write(`data: ${text}\n\n`)
  }

  readState()
  const poll = setInterval(readState, pollMs)
  let watcher
  try {
    watcher = watch(dir, () => readState())
  } catch {
    watcher = undefined
  }
  const heartbeat = setInterval(() => {
    for (const client of clients) client.write(': ping\n\n')
  }, 15_000)

  let bound = 0

  const takeAction = (req, res) => {
    if (req.method !== 'POST') return reply(res, 405, { error: 'POST only' })
    if (req.headers.origin !== `http://127.0.0.1:${bound}`) return reply(res, 403, { error: 'foreign origin' })
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return reply(res, 415, { error: 'JSON only' })
    if (Number(req.headers['content-length'] ?? 0) > BODY_MAX) {
      req.resume()
      return reply(res, 413, { error: 'too large' })
    }
    let size = 0
    const chunks = []
    req.on('data', chunk => {
      size += chunk.length
      if (size <= BODY_MAX) chunks.push(chunk)
    })
    req.on('end', () => {
      if (size > BODY_MAX) return reply(res, 413, { error: 'too large' })
      const action = readAction(Buffer.concat(chunks).toString('utf8'))
      if (action === undefined) return reply(res, 400, { error: 'bad action' })
      try {
        appendInbox(dir, { ...action, at: Date.now() })
      } catch {
        return reply(res, 500, { error: 'inbox not writable' })
      }
      reply(res, 202, { queued: true, request: action.request })
    })
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (!isLocalHost(req.headers.host) || !tokenMatches(url.searchParams.get('token') ?? req.headers['x-office-token'], token)) {
      res.writeHead(403, { 'content-type': 'text/plain' })
      res.end('forbidden')
      return
    }
    const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
    if (url.pathname === '/action') {
      takeAction(req, res)
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'content-type': 'text/plain', allow: 'GET' })
      res.end('method not allowed')
      return
    }
    if (url.pathname === '/events') {
      res.writeHead(200, { ...headers, 'content-type': 'text/event-stream', connection: 'keep-alive' })
      res.write(`data: ${last}\n\n`)
      clients.add(res)
      req.on('close', () => clients.delete(res))
      return
    }
    if (url.pathname === '/state') {
      res.writeHead(200, { ...headers, 'content-type': TYPES['.json'] })
      res.end(last)
      return
    }
    const file = staticPath(web, url.pathname === '/' ? 'index.html' : url.pathname)
    if (file === undefined || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('not found')
      return
    }
    res.writeHead(200, { ...headers, 'content-type': TYPES[extname(file)] })
    res.end(readFileSync(file))
  })

  const ready = new Promise(resolve => {
    server.listen(port, '127.0.0.1', () => {
      bound = server.address().port
      const tmp = `${portFile}.tmp`
      writeFileSync(tmp, JSON.stringify({ port: bound, token, pid: process.pid }))
      renameSync(tmp, portFile)
      resolve(bound)
    })
  })

  const close = () =>
    new Promise(resolve => {
      clearInterval(poll)
      clearInterval(heartbeat)
      watcher?.close()
      for (const client of clients) client.end()
      server.close(() => resolve(undefined))
      server.closeAllConnections()
    })

  return { ready, close }
}

const isMain = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isMain) {
  const args = parseArgs(process.argv.slice(2))
  if (!args.dir || !args.web || !args.token) {
    process.stderr.write('usage: office-server.mjs --dir <state dir> --web <web dir> --token <token>\n')
    process.exit(2)
  }
  const running = startServer({ dir: args.dir, web: args.web, token: args.token })
  running.ready.then(port => process.stdout.write(`ready ${port}\n`))
  const stop = () => running.close().then(() => process.exit(0))
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
  const parent = process.ppid
  setInterval(() => {
    if (process.ppid !== parent) void stop()
  }, 2_000).unref()
}
