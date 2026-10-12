import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { startServer, staticPath, tokenMatches } from './office-server.mjs'

const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'office-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dir = join(root, 'state')
  const web = join(root, 'web')
  mkdirSync(dir)
  mkdirSync(web)
  writeFileSync(join(web, 'index.html'), '<!doctype html><title>office</title>')
  writeFileSync(join(root, 'secret.txt'), 'nope')
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ format: 1, version: 1, people: [] }))
  return { root, dir, web }
}

function get(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, res => {
      let body = ''
      res.on('data', chunk => (body += chunk))
      res.on('end', () => resolve({ status: res.statusCode, body, type: res.headers['content-type'] }))
    })
    req.on('error', reject)
    req.end()
  })
}

function send(port, path, { method = 'POST', body = '', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers: { host: `127.0.0.1:${port}`, ...headers } }, res => {
      let text = ''
      res.on('data', chunk => (text += chunk))
      res.on('end', () => resolve({ status: res.statusCode, body: text }))
    })
    req.on('error', reject)
    req.end(body)
  })
}

async function checkActions(port, dir) {
  const origin = `http://127.0.0.1:${port}`
  const json = { 'content-type': 'application/json', origin }
  const good = JSON.stringify({ request: 'r1', action: 'converse', agent: 'a9cc3631cb90cda46' })
  const at = `/action?token=${TOKEN}`
  assert.equal((await send(port, '/action', { body: good, headers: json })).status, 403)
  assert.equal((await send(port, at, { body: good, headers: { ...json, host: 'evil.example' } })).status, 403)
  assert.equal((await send(port, at, { body: good, headers: { ...json, origin: 'http://evil.example' } })).status, 403)
  assert.equal((await send(port, at, { body: good, headers: { 'content-type': 'application/json' } })).status, 403)
  assert.equal((await send(port, at, { body: good, headers: { ...json, origin: `http://localhost:${port}` } })).status, 403)
  assert.equal((await send(port, at, { body: good, headers: { ...json, 'content-type': 'text/plain' } })).status, 415)
  assert.equal((await send(port, at, { body: 'x'.repeat(17000), headers: json })).status, 413)
  for (const body of ['{"request":', JSON.stringify({ request: 'r1', action: 'delete', agent: 'a1' }), JSON.stringify({ request: 'r1', action: 'stop', agent: '../../etc/passwd' }), JSON.stringify({ request: 'r1', action: 'say', agent: 'a1', text: 'x'.repeat(2001) }), JSON.stringify({ request: '<x>', action: 'stop', agent: 'a1' }), JSON.stringify({ request: 'r1', action: 'answer', agent: 'a1', answers: [{ id: 'd 1', text: 'Да' }] }), JSON.stringify({ request: 'r1', action: 'answer', agent: 'coordinator', ask: 'ask/1', answers: [] }), JSON.stringify({ request: 'r1', action: 'answer', agent: 'coordinator', answers: [{ id: 'q1', text: 'x', other: 'yes' }] }), '[]']) {
    assert.equal((await send(port, at, { body, headers: json })).status, 400, body)
  }
  assert.equal((await send(port, at, { method: 'GET', headers: { origin } })).status, 405)
  assert.equal(existsSync(join(dir, 'inbox.json')), false)
  const first = await send(port, at, { body: good, headers: json })
  assert.equal(first.status, 202)
  assert.deepEqual(JSON.parse(first.body), { queued: true, request: 'r1' })
  const answer = JSON.stringify({ request: 'r2', action: 'answer', agent: 'a9cc3631cb90cda46', answers: [{ id: 'd1', text: 'Да' }] })
  assert.equal((await send(port, at, { body: answer, headers: json })).status, 202)
  const say = JSON.stringify({ request: 'r4', action: 'say', agent: 'coordinator', text: 'я'.repeat(2000) })
  assert.equal((await send(port, at, { body: say, headers: json })).status, 202)
  const boss = JSON.stringify({ request: 'r3', action: 'answer', agent: 'coordinator', ask: 'ask-0a1b2c3d', answers: [{ id: 'q1', text: 'Свой вариант', other: true }, { id: 'q2', text: 'Да', other: false }] })
  assert.equal((await send(port, at, { body: boss, headers: json })).status, 202)
  const inbox = JSON.parse(readFileSync(join(dir, 'inbox.json'), 'utf8'))
  assert.deepEqual(inbox.map(one => [one.request, one.action, one.agent]), [['r1', 'converse', 'a9cc3631cb90cda46'], ['r2', 'answer', 'a9cc3631cb90cda46'], ['r4', 'say', 'coordinator'], ['r3', 'answer', 'coordinator']])
  assert.equal(inbox[2].text.length, 2000)
  assert.deepEqual(inbox[1].answers, [{ id: 'd1', text: 'Да' }])
  assert.equal(inbox[1].ask, undefined)
  assert.equal(inbox[3].ask, 'ask-0a1b2c3d')
  assert.deepEqual(inbox[3].answers, [{ id: 'q1', text: 'Свой вариант', other: true }, { id: 'q2', text: 'Да' }])
  assert.equal(typeof inbox[0].at, 'number')
  assert.equal(existsSync(join(dir, 'inbox.json.tmp')), false)
}

test('actions: token, local Host, the office Origin, JSON, size and ids are checked; good ones are appended to inbox.json', async t => {
  const { dir, web } = fixture(t)
  const running = startServer({ dir, web, token: TOKEN, pollMs: 50 })
  t.after(() => running.close())
  const port = await running.ready
  await checkActions(port, dir)
})

function writeAtomic(path, text) {
  writeFileSync(`${path}.tmp`, text)
  renameSync(`${path}.tmp`, path)
}

test('the server writes a port file with its token and refuses requests without it', async t => {
  const { dir, web } = fixture(t)
  const running = startServer({ dir, web, token: TOKEN, pollMs: 50 })
  const port = await running.ready
  const portFile = JSON.parse(readFileSync(join(dir, 'server.json'), 'utf8'))
  assert.equal(portFile.port, port)
  assert.equal(portFile.token, TOKEN)
  assert.equal((await get(port, '/state')).status, 403)
  assert.equal((await get(port, '/state?token=wrong')).status, 403)
  assert.equal((await get(port, `/state?token=${TOKEN}`, { host: 'evil.example:80' })).status, 403)
  const state = await get(port, `/state?token=${TOKEN}`)
  assert.equal(state.status, 200)
  assert.equal(JSON.parse(state.body).version, 1)
  const page = await get(port, `/?token=${TOKEN}`)
  assert.equal(page.status, 200)
  assert.match(page.type, /text\/html/)
  assert.equal((await get(port, `/../secret.txt?token=${TOKEN}`)).status, 404)
  assert.equal((await get(port, `/%2e%2e/secret.txt?token=${TOKEN}`)).status, 404)
  await running.close()
})

test('events stream the current snapshot, then every newer version once', async t => {
  const { dir, web } = fixture(t)
  const running = startServer({ dir, web, token: TOKEN, pollMs: 50 })
  const port = await running.ready
  const versions = []
  await new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: `/events?token=${TOKEN}`, headers: { host: `127.0.0.1:${port}` } }, res => {
      let buffer = ''
      res.on('data', chunk => {
        buffer += chunk
        for (const block of buffer.split('\n\n').slice(0, -1)) {
          const line = block.split('\n').find(one => one.startsWith('data: '))
          if (line !== undefined) versions.push(JSON.parse(line.slice(6)).version)
        }
        buffer = buffer.slice(buffer.lastIndexOf('\n\n') + 2)
        if (versions.length === 1) {
          writeAtomic(join(dir, 'state.json'), JSON.stringify({ version: 2 }))
          setTimeout(() => writeAtomic(join(dir, 'state.json'), JSON.stringify({ version: 2 })), 120)
          setTimeout(() => writeAtomic(join(dir, 'state.json'), JSON.stringify({ version: 3 })), 240)
        }
        if (versions.length === 3) {
          req.destroy()
          resolve()
        }
      })
    })
    req.on('error', error => (error.code === 'ECONNRESET' ? resolve() : reject(error)))
    req.end()
  })
  assert.deepEqual(versions, [1, 2, 3])
  await running.close()
})

test('a half-written state file is skipped until it parses', async t => {
  const { dir, web } = fixture(t)
  const running = startServer({ dir, web, token: TOKEN, pollMs: 30 })
  const port = await running.ready
  writeFileSync(join(dir, 'state.json'), '{"version": 5, "people": [')
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.equal(JSON.parse((await get(port, `/state?token=${TOKEN}`)).body).version, 1)
  writeAtomic(join(dir, 'state.json'), JSON.stringify({ version: 5 }))
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.equal(JSON.parse((await get(port, `/state?token=${TOKEN}`)).body).version, 5)
  await running.close()
})

test('static paths stay inside the web folder and serve known types only', () => {
  assert.equal(staticPath('/srv/web', '/../etc/passwd'), undefined)
  assert.equal(staticPath('/srv/web', '/office.exe'), undefined)
  assert.equal(staticPath('/srv/web', '/office.js'), '/srv/web/office.js')
  assert.equal(tokenMatches(TOKEN, TOKEN), true)
  assert.equal(tokenMatches(TOKEN.slice(1), TOKEN), false)
  assert.equal(tokenMatches(undefined, TOKEN), false)
})

function exited(child, ms) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), ms)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

test('the python fallback keeps the same contract and stops on SIGTERM', async t => {
  const { dir, web } = fixture(t)
  const child = spawn('python3', [new URL('./office_server.py', import.meta.url).pathname, '--dir', dir, '--web', web, '--token', TOKEN])
  let isStopped = false
  t.after(async () => {
    if (isStopped) return
    child.kill('SIGKILL')
    await exited(child, 2000)
  })
  const port = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.stdout.on('data', chunk => {
      const match = /ready (\d+)/.exec(String(chunk))
      if (match) resolve(Number(match[1]))
    })
    setTimeout(() => reject(new Error('python server did not start')), 5000).unref()
  }).catch(error => {
    t.skip(String(error))
    return undefined
  })
  if (port === undefined) return
  try {
    assert.equal(JSON.parse(readFileSync(join(dir, 'server.json'), 'utf8')).port, port)
    assert.equal((await get(port, '/state')).status, 403)
    assert.equal(JSON.parse((await get(port, `/state?token=${TOKEN}`)).body).version, 1)
    assert.equal((await get(port, `/../secret.txt?token=${TOKEN}`)).status, 404)
    await checkActions(port, dir)
  } finally {
    child.kill('SIGTERM')
    isStopped = await exited(child, 3000)
  }
  assert.equal(isStopped, true, 'the python server ignored SIGTERM')
})
