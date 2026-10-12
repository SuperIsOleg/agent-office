import { formatCost, formatTokens } from '../../hooks/roles'
import type { SnapAck, SnapPerson, SnapSaid, Snapshot } from '../../hooks/snapshot'
import type { OfficeAsk, OfficeNote } from '../../types'

export type CardAnswer = { id: string; text: string; other?: true }

export type CardAction = { action: 'converse' | 'stop' | 'answer' | 'say' | 'session'; agent: string; text?: string; answers?: CardAnswer[]; ask?: string }

export type Post = (action: CardAction) => Promise<string>

export type Section = 'questions' | 'warnings'

const NOTE_WORD: Readonly<Record<OfficeNote['kind'], string>> = { failed: 'Ошибка', not_verified: 'Не проверено', noticed: 'Заметил', denied: 'Отказано' }

const TEXT_MAX = 300
const MESSAGE_MAX = 2000

const SAID_WORD: Readonly<Record<SnapSaid['state'], string>> = {
  queued: 'Отправлено — ждёт, пока координатор освободится',
  sent: 'Отправлено в Claude',
  delivered: 'Доставлено агенту',
  answered: 'Ответил координатор',
  refused: 'Не отправлено',
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function clock(at: number): string {
  const date = new Date(at)
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map(part => String(part).padStart(2, '0')).join(':')
}

export function personIn(snapshot: Snapshot | undefined, id: string): SnapPerson | undefined {
  if (snapshot === undefined) return undefined
  return snapshot.boss.id === id ? snapshot.boss : snapshot.people.find(one => one.id === id)
}

export function sectionFor(person: SnapPerson | undefined): Section | undefined {
  if (person === undefined) return undefined
  if (person.card.asks.length > 0) return 'questions'
  if (person.status === 'failed' || person.card.notes.length > 0) return 'warnings'
  return undefined
}

export class AgentCard {
  private id: string | undefined
  private person: SnapPerson | undefined
  private isGone = false
  private asksKey = ''
  private readonly choices = new Map<string, string>()
  private readonly multis = new Map<string, Set<string>>()
  private readonly drafts = new Map<string, string>()
  private readonly pending = new Map<string, string>()
  private isStopOpen = false
  private reason = ''
  private ack: { ok: boolean; text: string } | undefined
  private message = ''
  private isSaying = false
  private readonly sent = new Map<string, string>()
  private readonly nodes: {
    dot: HTMLElement
    name: HTMLElement
    role: HTMLElement
    route: HTMLElement
    chip: HTMLElement
    activity: HTMLElement
    questions: HTMLElement
    warnings: HTMLElement
    warningList: HTMLElement
    recent: HTMLElement
    spend: HTMLElement
    message: HTMLTextAreaElement
    say: HTMLButtonElement
    paste: HTMLButtonElement
    said: HTMLElement
    stop: HTMLButtonElement
    confirm: HTMLElement
    reason: HTMLInputElement
    ack: HTMLElement
  }

  constructor(
    private readonly root: HTMLElement,
    private readonly post: Post,
    private readonly onClose: () => void,
  ) {
    root.replaceChildren()
    const close = el('button', 'close', '×')
    close.type = 'button'
    close.setAttribute('aria-label', 'Close the card')
    close.addEventListener('click', () => this.onClose())
    const head = el('header')
    const dot = el('i', 'dot')
    const name = el('h2', 'name')
    const role = el('p', 'role')
    const route = el('p', 'route')
    const state = el('p', 'state')
    const chip = el('span', 'chip')
    const activity = el('span', 'activity')
    state.append(chip, activity)
    head.append(dot, name, role, route, state)
    const questions = el('section', 'questions')
    const warnings = el('section', 'warnings')
    const warningList = el('ul')
    warnings.append(el('h3', '', 'Предупреждения'), warningList)
    const recentBlock = el('section', 'recent')
    const recent = el('ul')
    recentBlock.append(el('h3', '', 'Recent actions'), recent)
    const spendBlock = el('section', 'spend')
    const spend = el('p')
    spendBlock.append(el('h3', '', 'Spend'), spend)
    const foot = el('footer')
    const write = el('div', 'write')
    const message = el('textarea')
    message.rows = 2
    message.maxLength = MESSAGE_MAX
    message.placeholder = 'Написать'
    message.setAttribute('aria-label', 'Написать')
    message.addEventListener('input', () => {
      this.message = message.value
      this.render()
    })
    message.addEventListener('keydown', event => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) this.say()
    })
    const say = el('button', 'primary', 'Отправить')
    say.type = 'button'
    say.addEventListener('click', () => this.say())
    const paste = el('button', 'link', 'Вставить в поле ввода')
    paste.type = 'button'
    paste.addEventListener('click', () => this.send({ action: 'converse', agent: this.id ?? '', text: this.message.trim().slice(0, MESSAGE_MAX) }, 'В поле ввода'))
    const said = el('ul', 'said')
    write.append(message, say, paste, said)
    const stop = el('button', 'danger', 'Stop agent')
    stop.type = 'button'
    stop.addEventListener('click', () => {
      this.isStopOpen = true
      this.render()
      this.nodes.reason.focus()
    })
    const confirm = el('div', 'confirm')
    const reason = el('input')
    reason.type = 'text'
    reason.maxLength = 120
    reason.placeholder = 'Причина (необязательно)'
    reason.addEventListener('input', () => (this.reason = reason.value))
    const sure = el('button', 'danger', 'Остановить')
    sure.type = 'button'
    sure.addEventListener('click', () => {
      this.isStopOpen = false
      this.send({ action: 'stop', agent: this.id ?? '', text: this.reason.slice(0, TEXT_MAX) }, 'Stop')
      this.reason = ''
      reason.value = ''
    })
    const cancel = el('button', '', 'Отмена')
    cancel.type = 'button'
    cancel.addEventListener('click', () => {
      this.isStopOpen = false
      this.render()
    })
    confirm.append(el('p', '', 'Остановить этого агента?'), reason, sure, cancel)
    const ack = el('p', 'ack')
    ack.setAttribute('role', 'status')
    foot.append(write, stop, confirm, ack)
    const body = el('div', 'scroll')
    body.append(questions, warnings, recentBlock, spendBlock)
    root.append(close, head, body, foot)
    this.nodes = { dot, name, role, route, chip, activity, questions, warnings, warningList, recent, spend, message, say, paste, said, stop, confirm, reason, ack }
  }

  selected(): string | undefined {
    return this.id
  }

  open(id: string, snapshot: Snapshot | undefined, section?: Section): void {
    if (this.id !== id) {
      this.id = id
      this.asksKey = ''
      this.choices.clear()
      this.multis.clear()
      this.drafts.clear()
      this.isStopOpen = false
      this.reason = ''
      this.ack = undefined
      this.message = ''
      this.isSaying = false
      this.nodes.message.value = ''
      this.isGone = false
      this.person = undefined
    }
    this.root.classList.add('open')
    this.root.setAttribute('aria-hidden', 'false')
    this.update(snapshot)
    const target = section === 'questions' ? this.nodes.questions : section === 'warnings' ? this.nodes.warnings : undefined
    if (target !== undefined && !target.hidden) target.scrollIntoView({ block: 'start' })
  }

  close(): void {
    this.id = undefined
    this.root.classList.remove('open')
    this.root.setAttribute('aria-hidden', 'true')
  }

  update(snapshot: Snapshot | undefined): void {
    if (this.id === undefined) return
    const found = personIn(snapshot, this.id)
    if (found !== undefined) {
      this.person = found
      this.isGone = false
    } else if (this.person !== undefined) this.isGone = true
    for (const ack of snapshot?.acks ?? []) this.take(ack)
    this.render()
  }

  private take(ack: SnapAck): void {
    if (!this.pending.has(ack.request)) return
    const label = this.pending.get(ack.request)
    this.pending.delete(ack.request)
    this.ack = { ok: ack.ok, text: ack.text }
    if (label !== 'Сообщение') return
    this.isSaying = false
    if (ack.ok && this.message.trim() === (this.sent.get(ack.request) ?? '').trim()) this.setMessage('')
  }

  private setMessage(text: string): void {
    this.message = text
    this.nodes.message.value = text
  }

  private say(): void {
    const text = this.message.trim()
    if (!text || this.isSaying || this.id === undefined) return
    this.isSaying = true
    const label = 'Сообщение'
    this.ack = { ok: true, text: `${label}: отправляю…` }
    this.render()
    this.post({ action: 'say', agent: this.id, text: text.slice(0, MESSAGE_MAX) })
      .then(request => {
        if (request === '') {
          this.isSaying = false
          this.render()
          return
        }
        this.sent.set(request, text)
        this.pending.set(request, label)
        this.ack = { ok: true, text: `${label}: передал в офис, жду ответа…` }
        this.render()
      })
      .catch((error: unknown) => {
        this.isSaying = false
        this.ack = { ok: false, text: `${label}: не отправилось — ${error instanceof Error ? error.message : String(error)}. Текст остался в поле.` }
        this.render()
      })
  }

  private renderSaid(list: readonly SnapSaid[]): void {
    for (const one of list) {
      const text = this.sent.get(one.request)
      if (one.state === 'refused' && text !== undefined && this.message.trim() === '') {
        this.setMessage(text)
        this.sent.delete(one.request)
      }
    }
    this.nodes.said.hidden = list.length === 0
    this.nodes.said.replaceChildren(
      ...list.map(one => {
        const row = el('li', one.state)
        const word = one.state === 'refused' && one.why ? `${SAID_WORD.refused}: ${one.why}` : SAID_WORD[one.state]
        row.append(el('time', '', clock(one.at)), el('span', 'text', one.text), el('b', '', word))
        return row
      }),
    )
  }

  private send(action: CardAction, label: string): void {
    if (action.agent === '') return
    this.ack = { ok: true, text: `${label}: отправляю…` }
    this.render()
    this.post(action)
      .then(request => {
        if (request === '') return
        this.pending.set(request, label)
        this.ack = { ok: true, text: `${label}: передал в Claude, жду ответа…` }
        this.render()
      })
      .catch((error: unknown) => {
        this.ack = { ok: false, text: `${label}: не отправилось — ${error instanceof Error ? error.message : String(error)}` }
        this.render()
      })
  }

  showAck(text: string, ok: boolean): void {
    this.ack = { ok, text }
    this.render()
  }

  private render(): void {
    const person = this.person
    const nodes = this.nodes
    if (person === undefined) {
      nodes.name.textContent = this.id ?? ''
      nodes.role.textContent = ''
      nodes.route.hidden = true
      nodes.chip.textContent = 'Not here'
      nodes.activity.textContent = ''
      return
    }
    const card = person.card
    nodes.dot.style.background = this.isGone ? '#9aa1ad' : person.dot
    nodes.name.textContent = person.name
    nodes.role.textContent = [card.role, person.model, card.effort].filter(Boolean).join(' · ')
    nodes.route.hidden = !card.route
    nodes.route.textContent = card.route ? `Почему так: ${card.route}` : ''
    nodes.chip.textContent = this.isGone ? 'left' : card.status
    nodes.chip.dataset['chip'] = this.isGone ? 'Idle' : person.chip
    nodes.activity.textContent = this.isGone ? 'Ушёл из офиса' : person.activity
    this.renderQuestions(person)
    this.renderNotes(card.notes)
    nodes.recent.replaceChildren(
      ...(card.recent.length === 0
        ? [el('li', 'quiet', 'Ещё ничего не делал')]
        : card.recent.map(item => {
            const row = el('li', item.state === 'error' ? 'error' : '')
            row.append(el('time', '', clock(item.at)), el('span', '', item.text))
            return row
          })),
    )
    nodes.spend.textContent =
      card.spend === 'pending'
        ? 'посчитается, когда агент закончит'
        : `${card.tokens > 0 ? formatTokens(card.tokens) : '—'} tokens · ≈${formatCost(card.cost)}${card.spend === 'running' ? ' — пока работает, по шагам модели' : ''}`
    nodes.message.disabled = this.isGone
    nodes.say.disabled = this.isGone || this.isSaying || this.message.trim() === ''
    nodes.paste.disabled = this.isGone
    this.renderSaid(card.said ?? [])
    nodes.stop.hidden = this.isGone || !card.canStop || this.isStopOpen
    nodes.confirm.hidden = !this.isStopOpen || this.isGone || !card.canStop
    nodes.ack.hidden = this.ack === undefined
    nodes.ack.textContent = this.ack?.text ?? ''
    nodes.ack.classList.toggle('bad', this.ack?.ok === false)
  }

  private renderNotes(notes: readonly OfficeNote[]): void {
    this.nodes.warnings.hidden = notes.length === 0
    this.nodes.warningList.replaceChildren(
      ...notes.map(note => {
        const row = el('li', note.kind)
        row.append(el('b', '', NOTE_WORD[note.kind]), el('span', '', note.text))
        return row
      }),
    )
  }

  private renderQuestions(person: SnapPerson): void {
    const card = person.card
    const reply = card.reply
    const key = JSON.stringify([person.id, card.asks.map(ask => [ask.id, ask.question, ask.options, ask.multi]), reply?.state, reply?.text, card.isReadOnly, card.ask, this.isGone])
    const block = this.nodes.questions
    if (key === this.asksKey) return
    if (card.ask !== undefined && !this.asksKey.includes(card.ask)) {
      this.choices.clear()
      this.multis.clear()
      this.drafts.clear()
    }
    this.asksKey = key
    block.replaceChildren()
    if (card.asks.length === 0 && (reply?.state === 'answered' || reply?.state === 'office' || reply?.state === 'claude')) {
      const word = reply.state === 'claude' ? 'Отвечено в окне Claude' : reply.state === 'office' ? 'Отвечено из офиса' : 'Отвечено'
      block.hidden = false
      block.append(el('h3', '', 'Вопросы'), el('p', 'answered', reply.text ? `${word}: ${reply.text}` : reply.state === 'answered' ? 'Отвечено в чате' : word))
      return
    }
    block.hidden = card.asks.length === 0
    if (card.asks.length === 0) return
    const isLive = card.ask !== undefined && !card.isReadOnly
    const isSent = reply?.state === 'sent'
    const isLocked = card.isReadOnly || this.isGone || isSent
    block.append(el('h3', '', card.isReadOnly || isLive ? 'Спрашивает' : card.asks.length > 1 ? `Вопросы (${card.asks.length})` : 'Вопрос'))
    if (card.isReadOnly) block.append(el('p', 'note', 'Ответь в окне Claude: этот вопрос задан там, отсюда на него не ответить.'))
    if (isLive && !isSent) block.append(el('p', 'note', 'Можно ответить здесь или в окне Claude — засчитается первый ответ.'))
    if (isSent) block.append(el('p', 'note filled', `Ответ отправлен в Claude${reply.text ? `: ${reply.text}` : ''}`))
    if (reply?.state === 'filled') block.append(el('p', 'note filled', `Ответ в поле ввода — отправь его. ${reply.text ? `(${reply.text})` : ''}`.trim()))
    const isSingle = card.asks.length === 1 && card.asks[0]?.multi !== true
    for (const ask of card.asks) block.append(this.askBlock(ask, isLocked, isSingle, card.ask))
    if (!isSingle && !isLocked) {
      const all = el('button', 'primary', 'Ответить')
      all.type = 'button'
      all.addEventListener('click', () => {
        const answers = card.asks.flatMap(ask => {
          const draft = (this.drafts.get(ask.id) ?? '').trim()
          if (draft) return [isLive ? { id: ask.id, text: draft.slice(0, TEXT_MAX), other: true as const } : { id: ask.id, text: draft.slice(0, TEXT_MAX) }]
          const picked = ask.multi === true ? ask.options.filter(option => this.multis.get(ask.id)?.has(option)).join(', ') : this.choices.get(ask.id) || ''
          return picked ? [{ id: ask.id, text: picked.slice(0, TEXT_MAX) }] : []
        })
        if (answers.length === 0 || (isLive && answers.length < card.asks.length)) {
          this.showAck(isLive ? 'Ответь на каждый вопрос' : 'Выбери вариант или напиши ответ хотя бы на один вопрос', false)
          return
        }
        this.send({ action: 'answer', agent: person.id, answers, ...(isLive ? { ask: card.ask } : {}) }, 'Ответ')
      })
      block.append(all)
    }
  }

  private askBlock(ask: OfficeAsk, isLocked: boolean, isSingle: boolean, askId: string | undefined): HTMLElement {
    const box = el('div', 'ask')
    const live = askId !== undefined ? { ask: askId } : {}
    box.append(el('p', 'question', `${ask.id} · ${ask.question}`))
    if (ask.multi === true) box.append(el('p', 'why', 'Можно выбрать несколько'))
    if (ask.options.length > 0) {
      const row = el('div', 'options')
      for (const option of ask.options) {
        const button = el('button', option === ask.recommended ? 'option recommended' : 'option', option)
        button.type = 'button'
        button.disabled = isLocked
        if (option === ask.recommended) button.title = 'Рекомендует агент'
        const isPicked = ask.multi === true ? this.multis.get(ask.id)?.has(option) === true : this.choices.get(ask.id) === option
        button.classList.toggle('picked', isPicked)
        button.setAttribute('aria-pressed', String(isPicked))
        button.addEventListener('click', () => {
          if (isSingle) {
            this.send({ action: 'answer', agent: this.id ?? '', answers: [{ id: ask.id, text: option }], ...live }, 'Ответ')
            return
          }
          if (ask.multi === true) {
            const set = this.multis.get(ask.id) ?? new Set<string>()
            if (set.has(option)) set.delete(option)
            else set.add(option)
            this.multis.set(ask.id, set)
            button.classList.toggle('picked', set.has(option))
            button.setAttribute('aria-pressed', String(set.has(option)))
            return
          }
          this.choices.set(ask.id, option)
          for (const other of row.querySelectorAll('button')) {
            other.classList.toggle('picked', other === button)
            other.setAttribute('aria-pressed', String(other === button))
          }
        })
        row.append(button)
      }
      box.append(row)
    }
    if (ask.recommended) box.append(el('p', 'recommend', `Рекомендует: ${ask.recommended}`))
    if (ask.why) box.append(el('p', 'why', ask.why))
    if (isLocked) return box
    const field = el('div', 'free')
    const input = el('input')
    input.type = 'text'
    input.maxLength = TEXT_MAX
    input.placeholder = 'Свой ответ'
    input.value = this.drafts.get(ask.id) ?? ''
    input.addEventListener('input', () => this.drafts.set(ask.id, input.value))
    field.append(input)
    if (isSingle) {
      const go = el('button', 'primary', 'Отправить')
      go.type = 'button'
      const submit = () => {
        const text = input.value.trim()
        if (!text) return
        const answer = askId !== undefined ? { id: ask.id, text: text.slice(0, TEXT_MAX), other: true as const } : { id: ask.id, text: text.slice(0, TEXT_MAX) }
        this.send({ action: 'answer', agent: this.id ?? '', answers: [answer], ...live }, 'Ответ')
      }
      go.addEventListener('click', submit)
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') submit()
      })
      field.append(go)
    }
    box.append(field)
    return box
  }
}
