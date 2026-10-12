import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { launch, open, shot, sleep, value, waitFor } from './chrome.mjs'

const FFMPEG = process.env.FFMPEG ?? (existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg')
const ROOT = resolve(import.meta.dirname, '..')
const WIDTH = 1500
const HEIGHT = 1050

const FRAMES = [
  [4_000, 'html-1-arrivals'],
  [16_000, 'html-2-busy'],
  [23_500, 'html-3-results'],
  [30_000, 'html-4-leaving'],
  [34_000, 'html-5-asking'],
  [47_000, 'html-6-later'],
  [16_000, 'html-7-card', 'eng'],
  [23_500, 'html-8-question', 'qa'],
]
const CLIP = { at: 500, seconds: 12 }

function options() {
  const list = process.argv.slice(2)
  const flag = name => {
    const at = list.indexOf(name)
    return at >= 0 ? (list[at + 1] ?? '') : undefined
  }
  const url = flag('--url')
  if (url !== undefined) return { mode: 'url', url, out: resolve(list[list.indexOf('--url') + 2] ?? 'live.png') }
  const props = flag('--props')
  if (props !== undefined) return { mode: 'props', out: resolve(props || join(ROOT, 'docs/preview')) }
  return { mode: 'all', out: resolve(list[0] ?? join(ROOT, 'docs/preview')) }
}

function catalogSheets(dir) {
  const bundle = join(dir, 'preview.mjs')
  execFileSync('npx', ['-y', 'esbuild@0.24.0', join(ROOT, 'scripts/preview.ts'), '--bundle', '--platform=node', '--format=esm', `--outfile=${bundle}`, '--log-level=warning'], { cwd: ROOT, stdio: 'inherit' })
  execFileSync(process.execPath, [bundle, dir], { stdio: 'inherit' })
  return readdirSync(dir).filter(name => name.endsWith('.svg'))
}

function encode(frames, fps, out) {
  const input = ['-y', '-loglevel', 'error', '-framerate', fps.toFixed(2), '-i', join(frames, 'f-%04d.jpg')]
  execFileSync(FFMPEG, [...input, '-vf', 'scale=1500:-2:flags=neighbor', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(out, 'html-clip.mp4')])
  execFileSync(FFMPEG, [...input, '-vf', 'fps=12,scale=750:-2:flags=neighbor,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=none', join(out, 'html-clip.gif')])
}

async function clip(cdp, page, out, work) {
  const frames = join(work, 'frames')
  mkdirSync(frames)
  await open(cdp, `${page}?demo=1&at=${CLIP.at}`, WIDTH, HEIGHT)
  await sleep(800)
  const stamps = []
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    writeFileSync(join(frames, `f-${String(stamps.length).padStart(4, '0')}.jpg`), Buffer.from(data, 'base64'))
    stamps.push(metadata.timestamp)
    void cdp.send('Page.screencastFrameAck', { sessionId })
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: WIDTH, maxHeight: HEIGHT, everyNthFrame: 1 })
  await sleep(CLIP.seconds * 1000)
  await cdp.send('Page.stopScreencast')
  const span = (stamps[stamps.length - 1] ?? 0) - (stamps[0] ?? 0)
  const fps = span > 0 ? (stamps.length - 1) / span : 1
  encode(frames, fps, out)
  console.log(`html-clip.mp4 and html-clip.gif: ${stamps.length} frames at ${fps.toFixed(1)} fps`)
}

async function props(cdp, out) {
  mkdirSync(out, { recursive: true })
  await open(cdp, pathToFileURL(join(ROOT, 'web/check.html')).href, 1400, 900)
  const report = await waitFor(cdp, 'window.officeProps', 240_000)
  const size = await value(cdp, "[document.querySelector('canvas').width, document.querySelector('canvas').height]")
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: 1, mobile: false })
  await sleep(300)
  await shot(cdp, join(out, 'html-props.png'))
  console.log(`html-props.png: ${report.results.length} spots, ${report.ok ? 'all pass' : 'FAILURES'}`)
}

async function all(cdp, out, work) {
  mkdirSync(out, { recursive: true })
  const page = pathToFileURL(join(ROOT, 'web/index.html')).href
  for (const [at, name, card] of FRAMES) {
    await open(cdp, `${page}?demo=1&at=${at}${card ? `&card=${card}` : ''}`, WIDTH, HEIGHT)
    await sleep(1_500)
    await shot(cdp, join(out, `${name}.png`))
    console.log(`${name}.png`)
  }
  await clip(cdp, page, out, work)
  for (const name of catalogSheets(work)) {
    const svg = readFileSync(join(work, name), 'utf8')
    const width = Number(/width="(\d+)"/.exec(svg)?.[1] ?? WIDTH)
    const height = Number(/height="(\d+)"/.exec(svg)?.[1] ?? HEIGHT)
    await open(cdp, pathToFileURL(join(work, name)).href, width, height)
    await sleep(300)
    await shot(cdp, join(out, name.replace(/\.svg$/, '.png')))
    console.log(name.replace(/\.svg$/, '.png'))
  }
  await props(cdp, out)
}

const chosen = options()
const { cdp, close } = await launch(WIDTH, HEIGHT)
const work = mkdtempSync(join(tmpdir(), 'office-capture-'))
try {
  if (chosen.mode === 'url') {
    await open(cdp, chosen.url, WIDTH, HEIGHT)
    await sleep(2_500)
    await shot(cdp, chosen.out)
    console.log(`${chosen.out}: ${await value(cdp, "document.querySelector('.status')?.textContent + ' | ' + document.querySelectorAll('.log li').length + ' log rows'")}`)
  } else if (chosen.mode === 'props') await props(cdp, chosen.out)
  else await all(cdp, chosen.out, work)
} finally {
  await close()
  rmSync(work, { recursive: true, force: true })
}
