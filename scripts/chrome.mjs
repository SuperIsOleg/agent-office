import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROMES = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']

export const CHROME = process.env.CHROME ?? CHROMES.find(path => existsSync(path)) ?? CHROMES[0]

export const sleep = ms => new Promise(done => setTimeout(done, ms))

async function devtools(profile) {
  const file = join(profile, 'DevToolsActivePort')
  for (let tries = 0; tries < 150; tries += 1) {
    if (existsSync(file)) {
      const port = readFileSync(file, 'utf8').split('\n')[0]
      if (port) return Number(port)
    }
    await sleep(100)
  }
  throw new Error('Chrome did not open its DevTools port')
}

async function connect(port) {
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const page = pages.find(one => one.type === 'page')
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((done, fail) => {
    socket.onopen = done
    socket.onerror = fail
  })
  let id = 0
  const waiting = new Map()
  const listeners = new Map()
  socket.onmessage = message => {
    const data = JSON.parse(message.data)
    if (data.id !== undefined) {
      const call = waiting.get(data.id)
      waiting.delete(data.id)
      if (data.error) call?.fail(new Error(data.error.message))
      else call?.done(data.result)
    } else listeners.get(data.method)?.(data.params)
  }
  const send = (method, params = {}) =>
    new Promise((done, fail) => {
      id += 1
      waiting.set(id, { done, fail })
      socket.send(JSON.stringify({ id, method, params }))
    })
  const on = (method, handler) => listeners.set(method, handler)
  const once = method => new Promise(done => listeners.set(method, done))
  return { send, on, once, close: () => socket.close() }
}

export async function launch(width, height) {
  const profile = mkdtempSync(join(tmpdir(), 'office-chrome-'))
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' })
  const cdp = await connect(await devtools(profile))
  await cdp.send('Page.enable')
  const close = async () => {
    cdp.close()
    chrome.kill()
    await sleep(300)
    rmSync(profile, { recursive: true, force: true })
  }
  return { cdp, close }
}

export async function open(cdp, url, width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  const loaded = cdp.once('Page.loadEventFired')
  await cdp.send('Page.navigate', { url })
  await loaded
}

export async function shot(cdp, path) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path, Buffer.from(data, 'base64'))
}

export async function value(cdp, expression) {
  const { result } = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  return result.value
}

export async function waitFor(cdp, expression, timeoutMs) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const found = await value(cdp, expression)
    if (found !== undefined && found !== null) return found
    await sleep(250)
  }
  throw new Error(`timed out waiting for ${expression}`)
}
