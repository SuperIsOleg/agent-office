import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

import { startServer } from '../server/office-server.mjs'
import { CHROME, launch, open, sleep, value, waitFor } from './chrome.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const TOKEN = 'c4rd0123456789abcdef0123456789ab'
const ROOM_W = 744
const ROOM_H = 490
const HOSTILE = '<img src=x onerror="document.title=1"><script>document.title=2</script>'

function card(extra = {}) {
  return { role: 'Тестировщик', status: 'waiting for a decision', recent: [{ at: 1_000, text: 'Нажимает в симуляторе', tool: 'control', state: 'ok' }], tokens: 1200, cost: 0.12, canStop: true, asks: [], isReadOnly: false, notes: [], said: [], ...extra }
}

function person(id, type, name, tile, world, extra = {}) {
  return {
    id,
    type,
    name,
    status: 'decision',
    chip: 'Waiting',
    dot: '#f5b82e',
    completed: 0,
    model: 'Sonnet',
    activity: 'Проверять на iPad?',
    title: name,
    tile,
    path: [],
    movedAt: 0,
    gait: 'walk',
    vanishes: false,
    rest: { pose: 'cup', facing: 'back', mirror: false, world, z: 0, depth: tile[0] + tile[1] + 0.5, bubble: { text: '?', kind: 'ask' }, icon: 'none', goal: 'coffee' },
    card: card(),
    ...extra,
  }
}

function snapshot() {
  const qa = person('qa1', 'ios-team:qa-tester', 'qa-tester', [19, 2], [19.5, 2.42], {
    card: card({ effort: 'high (глубоко)', route: `проверка на устройстве ${HOSTILE}`, asks: [{ id: 'd1', question: `Проверять на iPad? ${HOSTILE}`, options: ['Да', HOSTILE], recommended: 'Да', why: HOSTILE }], notes: [{ kind: 'noticed', text: HOSTILE, at: 2_000 }] }),
  })
  const rev = person('rev1', 'ios-team:reviewer', 'reviewer', [10, 7], [10.5, 7.5], {
    status: 'working',
    chip: 'Working',
    dot: '#34c76f',
    activity: 'Читает CameraView.swift',
    rest: { pose: 'stand', facing: 'front', mirror: false, world: [10.5, 7.5], z: 0, depth: 17.5, icon: 'none', goal: 'coffee' },
    card: card({ role: 'Ревьюер', status: 'working' }),
  })
  const boss = person('coordinator', 'coordinator', 'coordinator', [18, 6], [18.5, 6.38], {
    status: 'idle',
    chip: 'Idle',
    activity: '',
    rest: { pose: 'bossCup', facing: 'back', mirror: false, world: [18.5, 6.38], z: 10, depth: 24.5, icon: 'none', goal: 'office' },
    card: card({ role: 'Координатор', status: 'idle', canStop: false, isReadOnly: true }),
  })
  return { format: 6, version: 5, at: Date.now(), startedAt: 1, stepMs: 500, people: [qa, rev], boss, door: false, hud: { spent: 1.5, tokens: 1200, runs: 3, approvals: 1, flagged: 0 }, events: [], acks: [] }
}

async function pointOf(cdp, world, lift) {
  const rect = await value(cdp, "(() => { const box = document.querySelector('canvas').getBoundingClientRect(); return [box.left, box.top, box.width, box.height] })()")
  const [left, top, width] = rect
  const unit = width / ROOM_W
  const x = 312 + (world[0] - world[1]) * 20
  const y = 118 + (world[0] + world[1]) * 10 - lift
  return [left + x * unit, top + y * unit]
}

async function click(cdp, [x, y]) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
  await sleep(250)
}

test('the card in the page: picking, hostile text as text, answers through the server into the inbox, Esc and empty floor close it', { skip: !existsSync(CHROME) && 'Chrome is not installed', timeout: 120_000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'office-card-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dir = join(root, 'state')
  mkdirSync(dir)
  writeFileSync(join(dir, 'state.json'), JSON.stringify(snapshot()))
  const running = startServer({ dir, web: join(ROOT, 'web'), token: TOKEN, pollMs: 50 })
  t.after(() => running.close())
  const port = await running.ready
  const { cdp, close } = await launch(1500, 1050)
  t.after(() => close())
  await open(cdp, `http://127.0.0.1:${port}/?token=${TOKEN}`, 1500, 1050)
  await waitFor(cdp, "document.querySelector('.status').textContent === 'live' || undefined", 10_000)
  await sleep(1200)
  const isOpen = () => value(cdp, "document.querySelector('.card').classList.contains('open')")
  assert.equal(await isOpen(), false)
  const qa = await pointOf(cdp, [19.5, 2.42], 18)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: qa[0], y: qa[1] })
  await sleep(100)
  assert.equal(await value(cdp, "document.querySelector('canvas').style.cursor"), 'pointer')
  await click(cdp, qa)
  assert.equal(await isOpen(), true)
  assert.equal(await value(cdp, "document.querySelector('.card .name').textContent"), 'qa-tester')
  assert.equal(await value(cdp, "document.querySelectorAll('.card img, .card script').length"), 0)
  assert.equal(await value(cdp, "document.querySelector('.card .role').textContent"), 'Тестировщик · Sonnet · high (глубоко)')
  assert.equal(await value(cdp, "document.querySelector('.card .route').textContent"), `Почему так: проверка на устройстве ${HOSTILE}`)
  assert.ok((await value(cdp, "document.querySelector('.card .question').textContent")).includes('<script>document.title=2</script>'))
  assert.equal(await value(cdp, 'document.title'), 'Офис')
  assert.equal(await value(cdp, "document.querySelector('.session-label').hidden"), true)
  assert.equal(await value(cdp, "[...document.querySelectorAll('.card .option')].map(one => one.textContent).join('|')"), `Да|${HOSTILE}`)
  assert.equal(await value(cdp, "document.querySelector('.card .option.recommended').textContent"), 'Да')
  assert.equal(await value(cdp, "document.querySelector('.card [data-chip]').dataset.chip"), 'Waiting')
  await value(cdp, "document.querySelector('.card .option').click()")
  await waitFor(cdp, "document.querySelector('.card .ack').textContent.includes('жду ответа') || undefined", 5_000)
  const inbox = JSON.parse(readFileSync(join(dir, 'inbox.json'), 'utf8'))
  assert.deepEqual(inbox.map(one => [one.action, one.agent, one.answers]), [['answer', 'qa1', [{ id: 'd1', text: 'Да' }]]])
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await sleep(150)
  assert.equal(await isOpen(), false)
  const rev = await pointOf(cdp, [10.5, 7.5], 18)
  await click(cdp, rev)
  assert.equal(await value(cdp, "document.querySelector('.card .name').textContent"), 'reviewer')
  assert.equal(await value(cdp, "document.querySelector('.card footer .danger').hidden"), false)
  await click(cdp, await pointOf(cdp, [4, 3], 0))
  assert.equal(await isOpen(), false)
  await value(cdp, "document.querySelector('[data-open=approvals]').click()")
  await sleep(150)
  assert.equal(await value(cdp, "document.querySelector('.card .name').textContent"), 'qa-tester')
  assert.equal(await isOpen(), true)
})

function bossAsking(version, extra) {
  const base = snapshot()
  const boss = {
    ...base.boss,
    status: 'asking',
    chip: 'Waiting',
    activity: 'Задаёт тебе вопрос',
    card: card({ role: 'Координатор', status: 'waiting for you', canStop: false, isReadOnly: false, ask: 'ask-0a1b2c3d', asks: [
      { id: 'q1', question: 'Берём роутер из HomeFeature?', options: ['Да (Recommended)', 'Нет'], recommended: 'Да (Recommended)' },
      { id: 'q2', question: 'Какие экраны проверить?', options: ['Камера', 'Галерея', 'Профиль'], multi: true },
    ], ...extra }),
  }
  return { ...base, version, boss }
}

test('the coordinator question in the page: options, multi-select toggles and «Ответить» send one answer with the ask id', { skip: !existsSync(CHROME) && 'Chrome is not installed', timeout: 120_000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'office-card-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dir = join(root, 'state')
  mkdirSync(dir)
  writeFileSync(join(dir, 'state.json'), JSON.stringify(bossAsking(6, {})))
  const running = startServer({ dir, web: join(ROOT, 'web'), token: TOKEN, pollMs: 50 })
  t.after(() => running.close())
  const port = await running.ready
  const { cdp, close } = await launch(1500, 1050)
  t.after(() => close())
  await open(cdp, `http://127.0.0.1:${port}/?token=${TOKEN}&card=coordinator`, 1500, 1050)
  await waitFor(cdp, "document.querySelector('.card .question') || undefined", 10_000)
  assert.equal(await value(cdp, "document.querySelector('.card .option.recommended').textContent"), 'Да (Recommended)')
  assert.equal(await value(cdp, "[...document.querySelectorAll('.card .option')].every(one => !one.disabled)"), true)
  await value(cdp, "[...document.querySelectorAll('.card .option')].find(one => one.textContent === 'Нет').click()")
  await value(cdp, "[...document.querySelectorAll('.card .option')].find(one => one.textContent === 'Профиль').click()")
  await value(cdp, "[...document.querySelectorAll('.card .option')].find(one => one.textContent === 'Камера').click()")
  assert.equal(await value(cdp, "[...document.querySelectorAll('.card .option.picked')].map(one => one.textContent).join('|')"), 'Нет|Камера|Профиль')
  await value(cdp, "[...document.querySelectorAll('.card .questions button')].find(one => one.textContent === 'Ответить').click()")
  await waitFor(cdp, "document.querySelector('.card .ack').textContent.includes('жду ответа') || undefined", 5_000)
  const inbox = JSON.parse(readFileSync(join(dir, 'inbox.json'), 'utf8'))
  assert.deepEqual(inbox.map(one => [one.agent, one.ask, one.answers]), [['coordinator', 'ask-0a1b2c3d', [{ id: 'q1', text: 'Нет' }, { id: 'q2', text: 'Камера, Профиль' }]]])
  writeFileSync(join(dir, 'state.json'), JSON.stringify(bossAsking(7, { reply: { state: 'sent', text: 'Нет; Камера, Профиль', at: 1 } })))
  await waitFor(cdp, "document.querySelector('.card .questions').textContent.includes('Ответ отправлен в Claude') || undefined", 5_000)
  assert.equal(await value(cdp, "[...document.querySelectorAll('.card .option')].every(one => one.disabled)"), true)
  writeFileSync(join(dir, 'state.json'), JSON.stringify(bossAsking(8, { asks: [], ask: undefined, isReadOnly: true, reply: { state: 'claude', text: 'Да (Recommended); Галерея', at: 2 } })))
  await waitFor(cdp, "document.querySelector('.card .questions').textContent.includes('Отвечено в окне Claude: Да (Recommended); Галерея') || undefined", 5_000)
})

test('writing from the card: «Отправить» posts one message, a refusal brings the text back, and the session label posts its action', { skip: !existsSync(CHROME) && 'Chrome is not installed', timeout: 120_000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'office-card-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dir = join(root, 'state')
  mkdirSync(dir)
  const base = { ...snapshot(), version: 10, session: { key: 'PROJ-1854', main: `PROJ-1854 · ${HOSTILE}`, sub: 'feature/PROJ-1854 · app-PROJ-1854', link: 'claude://claude.ai/epitaxy/local_7f3a' } }
  writeFileSync(join(dir, 'state.json'), JSON.stringify(base))
  const running = startServer({ dir, web: join(ROOT, 'web'), token: TOKEN, pollMs: 50 })
  t.after(() => running.close())
  const port = await running.ready
  const { cdp, close } = await launch(1500, 1050)
  t.after(() => close())
  await open(cdp, `http://127.0.0.1:${port}/?token=${TOKEN}&card=rev1`, 1500, 1050)
  await waitFor(cdp, "document.querySelector('.card .write textarea') || undefined", 10_000)
  assert.equal(await value(cdp, "document.querySelector('.card .write button.primary').disabled"), true)
  await value(cdp, `(() => { const box = document.querySelector('.card .write textarea'); box.value = ${JSON.stringify(`Проверь iPad ${HOSTILE}`)}; box.dispatchEvent(new Event('input')); return true })()`)
  await value(cdp, "(() => { const go = document.querySelector('.card .write button.primary'); go.click(); go.click(); return true })()")
  await waitFor(cdp, "document.querySelector('.card .ack').textContent.includes('жду ответа') || undefined", 5_000)
  const inbox = JSON.parse(readFileSync(join(dir, 'inbox.json'), 'utf8'))
  assert.deepEqual(inbox.map(one => [one.action, one.agent, one.text]), [['say', 'rev1', `Проверь iPad ${HOSTILE}`]])
  const request = inbox[0].request
  const rev = base.people[1]
  const refused = { ...base, version: 11, people: [base.people[0], { ...rev, card: { ...rev.card, said: [{ request, text: `Проверь iPad ${HOSTILE}`, at: 3_000, state: 'refused', why: 'в окне Claude открыт диалог' }] } }], acks: [{ request, ok: true, text: 'Отправлено в Claude', at: 3_000 }] }
  writeFileSync(join(dir, 'state.json'), JSON.stringify(refused))
  await waitFor(cdp, "document.querySelector('.card .said li.refused') || undefined", 5_000)
  assert.equal(await value(cdp, "document.querySelector('.card .write textarea').value"), `Проверь iPad ${HOSTILE}`)
  assert.equal(await value(cdp, "document.querySelector('.card .said li b').textContent"), 'Не отправлено: в окне Claude открыт диалог')
  assert.equal(await value(cdp, "document.querySelectorAll('.card img, .card script').length"), 0)
  assert.equal(await value(cdp, "document.querySelectorAll('[data-open=session]').length"), 0)
  assert.equal(await value(cdp, "document.querySelector('.hud').textContent.includes('Открыть сессию')"), false)
  assert.equal(await value(cdp, 'document.title'), 'Офис · PROJ-1854')
  assert.equal(await value(cdp, "document.querySelector('.session-label .main').textContent"), `PROJ-1854 · ${HOSTILE}`)
  assert.equal(await value(cdp, "document.querySelector('.session-label .sub').textContent"), 'feature/PROJ-1854 · app-PROJ-1854')
  assert.equal(await value(cdp, "document.querySelectorAll('.session-label img, .session-label script').length"), 0)
  assert.equal(await value(cdp, "[document.querySelector('.session-label').disabled, document.querySelector('.session-label').title, getComputedStyle(document.querySelector('.session-label')).cursor].join('|')"), 'false|Открыть сессию в Claude|pointer')
  const box = await value(cdp, "(() => { const a = document.querySelector('.session-label').getBoundingClientRect(); const c = document.querySelector('canvas').getBoundingClientRect(); return [a.left, a.top, a.right, a.bottom, c.left, c.top] })()")
  assert.ok(box[0] >= 0 && box[1] >= 0, 'the label sits at the top left')
  await value(cdp, "document.querySelector('.session-label').click()")
  await sleep(400)
  const after = JSON.parse(readFileSync(join(dir, 'inbox.json'), 'utf8'))
  assert.deepEqual(after.map(one => [one.action, one.agent]), [['say', 'rev1'], ['session', 'coordinator']])
})

test('without a session link the label shows but does not click, and says why', { skip: !existsSync(CHROME) && 'Chrome is not installed', timeout: 120_000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'office-card-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dir = join(root, 'state')
  mkdirSync(dir)
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ ...snapshot(), version: 12, session: { key: '', main: 'app', sub: '', why: 'ccd_session_mgmt отказал: denied' } }))
  const running = startServer({ dir, web: join(ROOT, 'web'), token: TOKEN, pollMs: 50 })
  t.after(() => running.close())
  const port = await running.ready
  const { cdp, close } = await launch(1500, 1050)
  t.after(() => close())
  await open(cdp, `http://127.0.0.1:${port}/?token=${TOKEN}`, 1500, 1050)
  await waitFor(cdp, "(document.querySelector('.session-label') && !document.querySelector('.session-label').hidden) || undefined", 10_000)
  assert.equal(await value(cdp, "document.querySelector('.session-label .main').textContent"), 'app')
  assert.equal(await value(cdp, "document.querySelector('.session-label').disabled"), true)
  assert.equal(await value(cdp, "document.querySelector('.session-label').title"), 'Сессию не открыть: ccd_session_mgmt отказал: denied')
  assert.equal(await value(cdp, 'document.title'), 'Офис')
  await value(cdp, "document.querySelector('.session-label').click()")
  await sleep(300)
  assert.equal(existsSync(join(dir, 'inbox.json')), false)
})
