import type { Family, Icon, Prop, Wear } from './roles'

export const OUTLINE = '#1b1722'

export type Phase = (dur: number, offset?: number) => string

const FIXED: Readonly<Record<string, string>> = {
  w: '#ffffff',
  e: '#1d1924',
  m: '#9c3f3a',
  r: '#f19a8e',
  k: OUTLINE,
  g: '#1b1b22',
  G: '#d6efff',
  n: '#20232b',
  N: '#8fdcff',
  u: '#f6f6f6',
  U: '#c3c7cd',
  o: '#2a2d35',
  O: '#5a606b',
  y: '#f6c42f',
  Y: '#c9921a',
  x: '#7a4a26',
  X: '#5a3518',
  z: '#fdfdfd',
  Z: '#cfd5dd',
  q: '#3b7bd4',
  Q: '#2a5ea8',
  l: '#e8c25a',
  v: '#ef6fa8',
  j: '#3ddc84',
  i: '#e0403a',
  d: '#8d939c',
  D: '#5d636e',
  t: '#5cb85c',
  T: '#3a8f45',
}

const CLASSED: Readonly<Record<string, string>> = { a: 'va', b: 'vb', p: 'vp', f: 'vf', h: 'vh' }
const SHADES = 'SCAHPBF'

export const SPRITE_STYLE =
  '.va{fill:var(--a,#d4343d)}.vb{fill:var(--b,#ffffff)}.vp{fill:var(--p,#2b2e3b)}.vf{fill:var(--f,#16141c)}.vh{fill:var(--h,#3b2a20)}'

export type Grid = { rows: readonly string[]; top?: number; left?: number }

function runs(cells: readonly (readonly [number, number])[]): string {
  const byRow = new Map<number, number[]>()
  for (const [x, y] of cells) {
    const list = byRow.get(y) ?? []
    list.push(x)
    byRow.set(y, list)
  }
  type Span = { x: number; y: number; w: number; h: number }
  const open = new Map<string, Span>()
  const done: Span[] = []
  for (const y of [...byRow.keys()].sort((a, b) => a - b)) {
    const xs = [...new Set(byRow.get(y) ?? [])].sort((a, b) => a - b)
    const spans: [number, number][] = []
    for (const x of xs) {
      const last = spans[spans.length - 1]
      if (last !== undefined && x === last[0] + last[1]) last[1] += 1
      else spans.push([x, 1])
    }
    const seen = new Set<string>()
    for (const [x, w] of spans) {
      const id = `${x},${w}`
      seen.add(id)
      const span = open.get(id)
      if (span !== undefined && span.y + span.h === y) span.h += 1
      else {
        if (span !== undefined) done.push(span)
        open.set(id, { x, y, w, h: 1 })
      }
    }
    for (const [id, span] of open) {
      if (!seen.has(id)) {
        done.push(span)
        open.delete(id)
      }
    }
  }
  done.push(...open.values())
  return done.map(span => `M${span.x} ${span.y}h${span.w}v${span.h}h-${span.w}z`).join('')
}

export type ArtOptions = { outline?: boolean; shadeFrom?: number }

export function art(grids: Grid | readonly Grid[], options: ArtOptions = {}): string {
  const list: readonly Grid[] = Array.isArray(grids) ? grids : [grids as Grid]
  const cells = new Map<string, string>()
  for (const grid of list) {
    const top = grid.top ?? 0
    const left = grid.left ?? 0
    grid.rows.forEach((row, rowIndex) => {
      Array.from(row).forEach((char, colIndex) => {
        if (char === '.' || char === ' ') return
        const x = colIndex + left
        const code = options.shadeFrom !== undefined && x >= options.shadeFrom && 'cahpbf'.includes(char) ? char.toUpperCase() : char
        cells.set(`${x},${rowIndex + top}`, code)
      })
    })
  }
  const groups = new Map<string, [number, number][]>()
  const shade: [number, number][] = []
  for (const [id, code] of cells) {
    const point = id.split(',').map(Number) as [number, number]
    const isShade = SHADES.includes(code)
    const base = isShade ? code.toLowerCase() : code
    const bucket = groups.get(base) ?? []
    bucket.push(point)
    groups.set(base, bucket)
    if (isShade) shade.push(point)
  }
  let out = ''
  if (options.outline !== false) {
    const edge: [number, number][] = []
    for (const id of cells.keys()) {
      const [x, y] = id.split(',').map(Number) as [number, number]
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        if (!cells.has(`${x + dx},${y + dy}`)) edge.push([x + dx, y + dy])
      }
    }
    if (edge.length > 0) out += `<path fill="${OUTLINE}" d="${runs(edge)}"/>`
  }
  for (const [code, bucket] of groups) {
    const d = runs(bucket)
    if (code === 's') out += `<path d="${d}"/>`
    else if (code === 'c') out += `<path fill="currentColor" d="${d}"/>`
    else if (CLASSED[code] !== undefined) out += `<path class="${CLASSED[code]}" d="${d}"/>`
    else out += `<path fill="${FIXED[code] ?? '#ff00ff'}" d="${d}"/>`
  }
  if (shade.length > 0) out += `<path fill="#000" fill-opacity=".2" d="${runs(shade)}"/>`
  return out
}

export const AVATAR_CX = 13

const HEAD_F: Grid = {
  left: 6,
  rows: [
    '....ssssss....',
    '..ssssssssss..',
    '.ssssssssssss.',
    '.ssssssssssss.',
    'ssssssssssssss',
    'shhshhssssssss',
    'ssssssssssssss',
    'sewsewssssssss',
    'seeseessssSSss',
    'sssSssssssSsss',
    'srsmmsrsssssss',
    '.ssssssssssss.',
    '..ssssssssss..',
  ],
}

const HEAD_B: Grid = {
  left: 6,
  rows: [
    '....ssssss....',
    '..ssssssssss..',
    '.ssssssssssss.',
    '.ssssssssssss.',
    'ssssssssssssss',
    'ssssssssssssss',
    'ssssssssssssss',
    'ssssssssssssss',
    'ssSSssssssssss',
    'ssSsssssssssss',
    'ssssssssssssss',
    '.ssssssssssss.',
    '..ssssssssss..',
  ],
}

type HairStyle = { front: Grid; back: Grid }

const BACK_TOP = ['.....hhhhhh.....', '...hhhhhhhhhh...', '..hhhhhhhhhhhh..', '.hhhhhhhhhhhhhh.', '.hhhhhhhhhhhhhh.']
const BACK_REST = [
  '.hhhhhhhhhhhhhhh',
  '.hhhhhhhhhhhhhhh',
  '.hhhhhhhhhhhhhhh',
  '.hhhhhhhhhhhhhhh',
  '.hh..hhhhhhhhhh.',
  '.hh..hhhhhhhhhh.',
  '..h..hhhhhhhhh..',
  '.....hhhhhhhh...',
]
const FRONT_SHORT = [
  '.....hhhhhh.....',
  '...hhhhhhhhhh...',
  '..hhhhhhhhhhhh..',
  '.hhhhhhhhhhhhhh.',
  '.hhhhhhhhhhhhhh.',
  '.hhhhhhhhhhhhhhh',
  '.h......hhhhhhhh',
  '.h.......hhhhhhh',
  '.............hhh',
  '.............hh.',
  '.............hh.',
]

const HAIR_STYLES: readonly HairStyle[] = [
  {
    front: { left: 5, top: -1, rows: FRONT_SHORT },
    back: { left: 5, top: -1, rows: [...BACK_TOP, ...BACK_REST] },
  },
  {
    front: {
      left: 5,
      top: -3,
      rows: [
        '...hhhhh........',
        '..hhhhhhhhh.....',
        '..hhhhhhhhhhh...',
        '..hhhhhhhhhhhh..',
        '..hhhhhhhhhhhh..',
        '.hhhhhhhhhhhhhh.',
        '.hhhhhhhhhhhhhh.',
        '.hhh.hhhhhhhhhhh',
        '.h......hhhhhhhh',
        '.h.......hhhhhhh',
        '.............hhh',
        '.............hh.',
      ],
    },
    back: { left: 5, top: -3, rows: ['...hhhhh........', '..hhhhhhhhh.....', ...BACK_TOP, ...BACK_REST] },
  },
  {
    front: {
      left: 5,
      top: -1,
      rows: [
        '.....hhhhhh.....',
        '...hhhhhhhhhh...',
        '..hhhhhhhhhhhh..',
        '.hhhhhhhhhhhhhh.',
        '.hhhhhhhhhhhhhhh',
        'hhhhhhhhhhhhhhhh',
        'hh......hhhhhhhh',
        'hh.......hhhhhhh',
        'h............hhh',
        'h............hhh',
        'h............hhh',
        'hh...........hhh',
        'hh..........hhhh',
        '.h..........hhh.',
        '.h.........hhhh.',
        '...........hhh..',
      ],
    },
    back: {
      left: 5,
      top: -1,
      rows: [
        ...BACK_TOP,
        '.hhhhhhhhhhhhhhh',
        '.hhhhhhhhhhhhhhh',
        '.hhhhhhhhhhhhhhh',
        '.hhhhhhhhhhhhhhh',
        '.hhhhhhhhhhhhhhh',
        '.hhhhhhhhhhhhhhh',
        '.hhhhhhhhhhhhhhh',
        '.hhhhhhhhhhhhhhh',
        '..hhhhhhhhhhhh..',
        '...hhhhhhhhhh...',
        '....hhhhhhhh....',
      ],
    },
  },
  {
    front: {
      left: 4,
      top: -3,
      rows: [
        '.....hhhhhhh......',
        '...hhhhhhhhhhh....',
        '..hhhhhhhhhhhhhh..',
        '.hhhhhhhhhhhhhhhh.',
        'hhhhhhhhhhhhhhhhhh',
        'hhhhhhhhhhhhhhhhhh',
        'hhhhhhhhhhhhhhhhhh',
        'hhhhhhhhhhhhhhhhhh',
        'hhh......hhhhhhhhh',
        'hh........hhhhhhhh',
        'hh............hhhh',
        '..............hhhh',
        '..............hhh.',
      ],
    },
    back: {
      left: 4,
      top: -3,
      rows: [
        '.....hhhhhhh......',
        '...hhhhhhhhhhh....',
        '..hhhhhhhhhhhhhh..',
        '.hhhhhhhhhhhhhhhh.',
        'hhhhhhhhhhhhhhhhhh',
        'hhhhhhhhhhhhhhhhhh',
        'hhhhhhhhhhhhhhhhhh',
        'hhhhhhhhhhhhhhhhhh',
        'hhhhhhhhhhhhhhhhhh',
        'hhhhhhhhhhhhhhhhhh',
        'hhh..hhhhhhhhhhhhh',
        '.hh..hhhhhhhhhhhh.',
        '.....hhhhhhhhhhh..',
      ],
    },
  },
  {
    front: { left: 5, top: -5, rows: ['........hhh.....', '.......hhhhh....', '.......hhhhh....', '........hhh.....', ...FRONT_SHORT] },
    back: { left: 5, top: -5, rows: ['........hhh.....', '.......hhhhh....', '.......hhhhh....', '........hhh.....', ...BACK_TOP, ...BACK_REST] },
  },
  {
    front: {
      left: 5,
      top: -1,
      rows: [
        '.....hhhhhh.....',
        '...hhhhhhhhhh...',
        '..hhhhhhhhhhhh..',
        '.hhhhhhhhhhhhhh.',
        '.hhhhhhhhhhhhhhh',
        'hhhhhhhhhhhhhhhh',
        'hh......hhhhhhhh',
        'hh.......hhhhhhh',
        'h............hhh',
        'h...........hhhh',
        'h...........hhhh',
        'hh..........hhhh',
        '.h.........hhhh.',
      ],
    },
    back: {
      left: 5,
      top: -1,
      rows: [
        ...BACK_TOP,
        '.hhhhhhhhhhhhhhh',
        '.hhhhhhhhhhhhhhh',
        '.hhhhhhhhhhhhhhh',
        '.hhhhhhhhhhhhhhh',
        '.hhhhhhhhhhhhhhh',
        '.hhhhhhhhhhhhhhh',
        '.hhhhhhhhhhhhhhh',
        '..hhhhhhhhhhhh..',
      ],
    },
  },
]

export const HAIR_COUNT = HAIR_STYLES.length
export const HAIR_COLORS = ['#4a3121', '#231e24', '#d9a94a', '#b65a2c', '#8d8b98', '#7a3328', '#3b2a5a'] as const
export const SKINS = ['#f3cba5', '#e2ad80', '#c68a5e', '#8f5b3d', '#f7dcc4', '#d79a6c'] as const

const TORSO: Readonly<Record<Family, { front: readonly string[]; back: readonly string[] }>> = {
  suit: {
    front: ['...bbbbbb...', '.ccbbabbbcc.', 'cccbbabbcccC', 'ccccbaabccCC', 'ccccbaabccCC', 'cccccaacccCC', 'ccccccccccCC', 'cccckcccccCC', 'ccccccccccCC', 'cccckcccccCC', 'ccccccccccCC', 'pppppppppPPP'],
    back: ['...bbbbbb...', '.cccccccccc.', 'ccccccccccCC', 'ccccccccccCC', 'ccccccccccCC', 'cccccCccccCC', 'cccccCccccCC', 'cccccCccccCC', 'cccccCccccCC', 'ccccCcCcccCC', 'ccccCcCcccCC', 'pppppppppPPP'],
  },
  hoodie: {
    front: ['..CCCCCCCC..', '.cccacccacc.', 'cccacccaccCC', 'cccacccaccCC', 'ccccccccccCC', 'ccccccccccCC', 'cCCCCCCCcCCC', 'cCccccccCcCC', 'cCccccccCcCC', 'ccccccccccCC', 'CCCCCCCCCCCC', 'pppppppppPPP'],
    back: ['..cccccccc..', '.ccCCCCCCcc.', 'cccCccccCccC', 'cccCccccCccC', 'ccccCCCCcccC', 'ccccccccccCC', 'ccccccccccCC', 'ccccccccccCC', 'ccccccccccCC', 'ccccccccccCC', 'CCCCCCCCCCCC', 'pppppppppPPP'],
  },
  smart: {
    front: ['..bbb..bbb..', '.ccbbbbbbcc.', 'cccbbbbbbccC', 'ccccbbbbcccC', 'cccccbbccccC', 'ccccccccccCC', 'ccccccccccCC', 'ccccccccccCC', 'ccccccccccCC', 'ccccccccccCC', 'aaaaaaaaaaAA', 'pppppppppPPP'],
    back: ['...bbbbbb...', '.cccccccccc.', 'ccccccccccCC', 'ccccccccccCC', 'ccccccccccCC', 'ccccccccccCC', 'ccccccccccCC', 'ccccccccccCC', 'ccccccccccCC', 'ccccccccccCC', 'aaaaaaaaaaAA', 'pppppppppPPP'],
  },
  creative: {
    front: ['...cccccc...', '.cccccccccc.', 'ccccccccccCC', 'aaaaaaaaaaAA', 'ccccccccccCC', 'aaaaaaaaaaAA', 'ccccccccccCC', 'ccccccccccCC', 'ccbbccccccCC', 'ccbbccccccCC', 'ccccccccccCC', 'pppppppppPPP'],
    back: ['...cccccc...', '.cccccccccc.', 'ccccccccccCC', 'aaaaaaaaaaAA', 'ccccccccccCC', 'aaaaaaaaaaAA', 'ccccccccccCC', 'ccccccccccCC', 'ccccccccccCC', 'ccccccccccCC', 'ccccccccccCC', 'pppppppppPPP'],
  },
  street: {
    front: ['..aaaaaaaa..', '.ccabbbbacc.', 'cccabbbbaccC', 'cccbbaabbccC', 'cccbbaabbccC', 'cccabbbbaccC', 'cccakbbbaccC', 'ccccbbbbcccC', 'ccccbbbbcccC', 'ccccbbbbcccC', 'aaaaaaaaaaAA', 'pppppppppPPP'],
    back: ['..aaaaaaaa..', '.cccccccccc.', 'ccccccccccCC', 'ccccccccccCC', 'cccaaaaaacCC', 'cccaccccacCC', 'cccaaaaaacCC', 'ccccccccccCC', 'ccccccccccCC', 'ccccccccccCC', 'aaaaaaaaaaAA', 'pppppppppPPP'],
  },
  accountant: {
    front: ['...cccccc...', '.aacccbccaa.', 'aaaccbcccaAA', 'aaaaccbcaaAA', 'aaaaacbaaaAA', 'aaaaaabaaaAA', 'aaaakaaaaaAA', 'aaaaaaaaaaAA', 'aaaakaaaaaAA', 'aaaaaaaaaaAA', 'aaaaaaaaaaAA', 'pppppppppPPP'],
    back: ['...cccccc...', '.aaaaaaaaaa.', 'aaaaaaaaaaAA', 'aaaaaaaaaaAA', 'aaaaaaaaaaAA', 'aaaaaaaaaaAA', 'aaaaaaaaaaAA', 'aaaaaaaaaaAA', 'aaaaaaaaaaAA', 'aaaaaaaaaaAA', 'aaaaaaaaaaAA', 'pppppppppPPP'],
  },
  work: {
    front: ['...cccccc...', '.aaaccccaaa.', 'aaaaccccaaAA', 'aaaacccaaaAA', 'aaaaacaaaaAA', 'bbbbbbbbbbBB', 'aaaaaaaaaaAA', 'aaaaaaaaaaAA', 'bbbbbbbbbbBB', 'aaaaaaaaaaAA', 'aaaaaaaaaaAA', 'pppppppppPPP'],
    back: ['...cccccc...', '.aaaaaaaaaa.', 'aaaaaaaaaaAA', 'aaaaaaaaaaAA', 'aaaaaaaaaaAA', 'bbbbbbbbbbBB', 'aaaaaaaaaaAA', 'aaaaaaaaaaAA', 'bbbbbbbbbbBB', 'aaaaaaaaaaAA', 'aaaaaaaaaaAA', 'pppppppppPPP'],
  },
}

const LEGS: Readonly<Record<string, Grid>> = {
  stand: { left: 8, top: 25, rows: ['ppppppPPPP', 'ppppppPPPP', 'pppp..PPPP', 'pppp..PPPP', 'pppp..PPPP', 'pppp..PPPP', 'pppp..PPPP', 'pppp..PPPP', 'ffff..FFFF', 'fffff.FFFF'] },
  stride: { left: 7, top: 25, rows: ['.ppppppPPPP.', '.ppppppPPPP.', '.pppp..PPPP.', 'pppp....PPPP', 'pppp....PPPP', 'pppp....PPPP', 'pppp....PPPP', 'pppp....PPPP', 'ffff....FFFF', 'fffff....FFF'] },
  sitB: { left: 8, top: 25, rows: ['ppppppPPPP', 'ppppppPPPP', 'pppppPPPPP'] },
  sitF: { left: 7, top: 25, rows: ['.ppppppPPPP.', 'pppppppPPPPP', 'pppppppPPPPP', '.pppp..PPPP.', '.pppp..PPPP.', '.pppp..PPPP.', '.ffff..FFFF.'] },
  sofaF: {
    left: 3,
    top: 25,
    rows: ['....pppppppppPPP', '...ppppppppppPPP', '..pppppppppPPPP.', '.pppppppppPPPP..', 'pppppppppPPPP...', 'ppppp..PPPPP....', '.pppp...PPPP....', '.pppp...PPPP....', '.ffff...FFFF....', 'fffff...FFFFF...'],
  },
}

const rep = (row: string, count: number): string[] => Array.from({ length: count }, () => row)

const LIMBS: Readonly<Record<string, Grid>> = {
  Ldown: { left: 5, top: 14, rows: [...rep('cc', 8), 'ss', 'ss'] },
  Rdown: { left: 19, top: 14, rows: [...rep('CC', 8), 'ss', 'ss'] },
  Lhold: { left: 5, top: 14, rows: ['cc...', 'cc...', 'cc...', 'ccc..', '.ccs.'] },
  Rhold: { left: 16, top: 14, rows: ['...CC', '...CC', '...CC', '..CCC', '.sCC.'] },
  LswingA: { left: 4, top: 14, rows: [...rep('.cc', 5), ...rep('cc.', 3), 'ss.', 'ss.'] },
  RswingA: { left: 19, top: 14, rows: [...rep('CC', 7), 'ss', 'ss'] },
  LswingB: { left: 5, top: 14, rows: [...rep('cc', 7), 'ss', 'ss'] },
  RswingB: { left: 19, top: 14, rows: [...rep('CC.', 5), ...rep('.CC', 3), '.ss', '.ss'] },
  LtypeBA: { left: 4, top: 14, rows: ['.cc', '.cc', '.cc', '.cc', 'ccc', 'cc.'] },
  RtypeBA: { left: 19, top: 14, rows: ['CC.', 'CC.', 'CC.', 'CC.', 'CC.', 'CCC'] },
  LtypeBB: { left: 4, top: 14, rows: ['.cc', '.cc', '.cc', '.cc', '.cc', 'ccc'] },
  RtypeBB: { left: 19, top: 14, rows: ['CC.', 'CC.', 'CC.', 'CC.', 'CCC', '.CC'] },
  LtypeFA: { left: 5, top: 14, rows: ['cc...', 'cc...', 'cc...', 'cc...', 'cc...', 'ccc..', '.ccss'] },
  LtypeFB: { left: 5, top: 14, rows: ['cc...', 'cc...', 'cc...', 'cc...', 'ccc..', '.ccss'] },
  RtypeF: { left: 15, top: 14, rows: ['....CC', '....CC', '....CC', '....CC', '....CC', '...CCC', 'ssCC..'] },
  RthinkB: { left: 20, top: 3, rows: ['ss.', 'ss.', '.CC', '.CC', '.CC', '.CC', '.CC', '.CC', '.CC', '.CC', '.CC', 'CC.'] },
  thinkTop: { left: 12, top: 11, rows: ['sss....', '.ssCC..', '..CCCC.', '...CCCC', '....CCC', '.....CC', '.....CC', '.....CC'] },
  RraiseA: { left: 20, top: -2, rows: ['ss', 'ss', ...rep('CC', 13), 'C.'] },
  RraiseB: { left: 20, top: -1, rows: ['.ss', '.ss', '.CC', 'CC.', ...rep('CC.', 10), 'C..'] },
  Lfail: { left: 3, top: 6, rows: ['.ss', '.ss', '.ss', 'cc.', 'cc.', 'cc.', 'cc.', '.cc', '..cc'] },
  Rfail: { left: 20, top: 6, rows: ['ss.', 'ss.', 'ss.', '.CC', '.CC', '.CC', '.CC', 'CC.', 'C..'] },
  LhappyA: { left: 1, top: 1, rows: ['ss....', 'ss....', 'cc....', 'cc....', '.cc...', '.cc...', '.cc...', '..cc..', '..cc..', '..cc..', '...cc.', '...cc.', '....cc', '....cc'] },
  RhappyA: { left: 19, top: 1, rows: ['....ss', '....ss', '....CC', '....CC', '...CC.', '...CC.', '...CC.', '..CC..', '..CC..', '..CC..', '.CC...', '.CC...', 'CC....', 'CC....'] },
  LhappyB: { left: 2, top: 4, rows: ['ss...', 'ss...', 'cc...', 'cc...', '.cc..', '.cc..', '.cc..', '..cc.', '..cc.', '...cc', '...cc'] },
  RhappyB: { left: 19, top: 4, rows: ['...ss', '...ss', '...CC', '...CC', '..CC.', '..CC.', '..CC.', '.CC..', '.CC..', 'CC...', 'CC...'] },
  RphoneB: { left: 20, top: 4, rows: ['nnnn', 'nNNn', 'nNNn', 'nNNn', 'nnnn', '.ss.', '.CC.', '.CC.', 'CC..', 'CC..', 'C...'] },
  phoneF: { left: 10, top: 15, rows: ['nnnnn', 'nNNNn', 'nNNNn', 'nNNNn', 'nnnnn'] },
  RtabletB: { left: 19, top: 3, rows: ['nnnnnn', 'nzzzzn', 'nzvjin', 'nzvjin', 'nnnnnn', '..ss..', '..CC..', '..CC..', '.CC...', 'CC....', 'C.....'] },
  tabletF: { left: 9, top: 14, rows: ['nnnnnnn', 'nzzzzzn', 'nzvzjin', 'nzvjjin', 'nnnnnnn'] },
  paperF: { left: 9, top: 14, rows: ['zzzZzzz', 'zddZddz', 'zzzZzzz', 'zddZddz', 'zzzZzzz'] },
  LreadB: { left: 3, top: 13, rows: ['zzzz.', 'zddz.', 'zzzz.', 'zddz.', 'zzzzs', '...cc', '..cc.', '..cc.', '.cc..', '.cc..'] },
  RreadB: { left: 19, top: 13, rows: ['.zzzz', '.zddz', '.zzzz', '.zddz', 'szzzz', 'CC...', '.CC..', '.CC..', '..CC.', '..CC.'] },
  Rcup: { left: 19, top: 14, rows: ['CC...', 'CC...', 'CC...', 'CCuuU', 'ssuuU', '.suuUU', '..UUU'] },
  Llap: { left: 5, top: 14, rows: [...rep('cc', 8), 'ccs', '.ss'] },
  Rlap: { left: 18, top: 14, rows: [...rep('.CC', 8), 'sCC', 'ss.'] },
}

const ARMS: Readonly<Record<string, readonly string[]>> = {
  down: ['Ldown', 'Rdown'],
  swingA: ['LswingA', 'RswingA'],
  swingB: ['LswingB', 'RswingB'],
  typeBA: ['LtypeBA', 'RtypeBA'],
  typeBB: ['LtypeBB', 'RtypeBB'],
  typeFA: ['LtypeFA', 'RtypeF'],
  typeFB: ['LtypeFB', 'RtypeF'],
  thinkB: ['Ldown', 'RthinkB'],
  thinkF: ['Ldown'],
  thinkTop: ['thinkTop'],
  raiseA: ['Ldown', 'RraiseA'],
  raiseB: ['Ldown', 'RraiseB'],
  fail: ['Lfail', 'Rfail'],
  happyA: ['LhappyA', 'RhappyA'],
  happyB: ['LhappyB', 'RhappyB'],
  phoneB: ['Ldown', 'RphoneB'],
  phoneF: ['Lhold', 'Rhold', 'phoneF'],
  tabletB: ['Ldown', 'RtabletB'],
  tabletF: ['Lhold', 'Rhold', 'tabletF'],
  readF: ['Lhold', 'Rhold', 'paperF'],
  readB: ['LreadB', 'RreadB'],
  cup: ['Ldown', 'Rcup'],
  lap: ['Llap', 'Rlap'],
}

const WEAR: Readonly<Record<string, readonly Grid[]>> = {
  glassesf: [{ left: 6, top: 6, rows: ['ggggggg', 'g..g..g', 'g..g..g'] }],
  glassesb: [{ left: 6, top: 7, rows: ['gggg'] }],
  beardf: [{ left: 6, top: 9, rows: ['............hh', 'h......hhhhhh.', '.hhhhhhhhhhhh.', '..hhhhhhhhhh..'] }],
  headphonesf: [
    { left: 6, top: -2, rows: ['....oooooo....', '..oo......oo..', '.o..........o.'] },
    { left: 15, top: 6, rows: ['.oo', 'oOO', 'oOO', 'oOO', '.oo'] },
    { left: 4, top: 6, rows: ['oo', 'oO', 'oO', 'oo'] },
  ],
  headphonesb: [
    { left: 6, top: -2, rows: ['....oooooo....', '..oo......oo..', '.o..........o.'] },
    { left: 6, top: 6, rows: ['oo.', 'OOo', 'OOo', 'OOo', 'oo.'] },
    { left: 19, top: 6, rows: ['oo', 'Oo', 'Oo', 'oo'] },
  ],
  hardhat: [
    {
      left: 4,
      top: -4,
      rows: ['.......yyyy.......', '.....yyyyyyyy.....', '....yyyyyyyyyy....', '...yyyyyyyyyyyY...', '...yyyyyyyyyyyY...', '..yyyyyyyyyyyyyY..', 'YYYYYYYYYYYYYYYYYY'],
    },
  ],
}

const CARRY: Readonly<Record<Exclude<Prop, 'none'>, Grid>> = {
  briefcase: { left: 17, top: 22, rows: ['..xxx..', '.x...x.', 'xxxxxxx', 'xXXlXXx', 'xXXXXXx', 'xxxxxxx'] },
  blueprint: { left: 15, top: 15, rows: ['.......qq', '......qQq', '.....qQq.', '....qQq..', '...qQq...', '..qQq....', '.qQq.....', 'qq.......'] },
  phone: { left: 19, top: 21, rows: ['nnn', 'nNn', 'nNn', 'nnn'] },
  tablet: { left: 1, top: 19, rows: ['nnnnnn', 'nzvjin', 'nzvjin', 'nnnnnn'] },
  envelope: { left: 1, top: 21, rows: ['zzzzzz', 'zZzzZz', 'zzZZzz', 'zzzzzz'] },
}

const ICONS: Readonly<Record<Exclude<Icon, 'none'>, Grid>> = {
  wrench: { rows: ['.....d.d', '.....ddd', '....ddd.', '...ddd..', '..ddd...', '.ddd....', 'ddd.....', 'dd......'] },
  doc: { rows: ['zzzzz...', 'zqqzZz..', 'zzzzzzz.', 'zqqqqqz.', 'zzzzzzz.', 'zqqqqqz.', 'zzzzzzz.'] },
  bug: { rows: ['.k....k.', '..kkkk..', '.iikkii.', 'iikiikii', 'iiiiiiii', 'iikiikii', '.iiiiii.'] },
  magnifier: { rows: ['.dddd...', 'dGGGGd..', 'dGwGGd..', 'dGGGGd..', '.dddd...', '....xx..', '.....xx.', '......xx'] },
  chart: { rows: ['......ii', '......ii', '...jj.ii', '...jj.ii', 'vv.jj.ii', 'vv.jj.ii', 'dddddddd'] },
  branch: { rows: ['jj......', 'jj...ll.', '.d...ll.', '.d..d...', '.d.d....', '.dd.....', '.d......', 'ii......', 'ii......'] },
  envelope: { rows: ['zzzzzzzz', 'zZzzzzZz', 'zzZzzZzz', 'zzzZZzzz', 'zzzzzzzz', 'zzzzzzzz'] },
}

export type PoseId =
  | 'stand'
  | 'walk'
  | 'type'
  | 'typeFast'
  | 'browse'
  | 'read'
  | 'think'
  | 'raise'
  | 'fail'
  | 'happy'
  | 'phone'
  | 'tablet'
  | 'cup'
  | 'standRaise'
  | 'study'
  | 'sofa'
  | 'bossCup'
  | 'slump'
  | 'laptop'

export type Motion = 'none' | 'bob' | 'jump' | 'shake'

type Side = { arms: readonly string[]; top?: string; legs: string }

export type PoseMeta = { seated: boolean; front: Side; back: Side; frameDur: number; motion: Motion; headDy: number; carry: boolean }

function seated(front: readonly string[], back: readonly string[], extra: Partial<PoseMeta> & { top?: string } = {}): PoseMeta {
  const { top, ...rest } = extra
  return {
    seated: true,
    front: { arms: front, legs: 'sitF', ...(top !== undefined ? { top } : {}) },
    back: { arms: back, legs: 'sitB' },
    frameDur: 0,
    motion: 'none',
    headDy: 0,
    carry: false,
    ...rest,
  }
}

function standing(arms: readonly string[], extra: Partial<PoseMeta> = {}): PoseMeta {
  return { seated: false, front: { arms, legs: 'stand' }, back: { arms, legs: 'stand' }, frameDur: 0, motion: 'bob', headDy: 0, carry: false, ...extra }
}

export const POSES: Readonly<Record<PoseId, PoseMeta>> = {
  stand: standing(['down'], { carry: true }),
  walk: { ...standing(['swingA', 'swingB'], { carry: true, frameDur: 0.5, motion: 'none' }), front: { arms: ['swingA', 'swingB'], legs: 'stride' }, back: { arms: ['swingA', 'swingB'], legs: 'stride' } },
  type: seated(['typeFA', 'typeFB'], ['typeBA', 'typeBB'], { frameDur: 0.32 }),
  typeFast: seated(['typeFA', 'typeFB'], ['typeBA', 'typeBB'], { frameDur: 0.16 }),
  browse: seated(['typeFA', 'typeFB'], ['typeBA', 'typeBB'], { frameDur: 0.9 }),
  read: seated(['readF'], ['readB'], { motion: 'bob', headDy: 1 }),
  think: seated(['thinkF'], ['thinkB'], { motion: 'bob', top: 'thinkTop' }),
  raise: seated(['raiseA', 'raiseB'], ['raiseA', 'raiseB'], { frameDur: 0.6 }),
  fail: seated(['fail'], ['fail'], { motion: 'shake', headDy: 2 }),
  happy: standing(['happyA', 'happyB'], { frameDur: 0.4, motion: 'jump' }),
  phone: seated(['phoneF'], ['phoneB'], { motion: 'bob', headDy: 1 }),
  tablet: seated(['tabletF'], ['tabletB'], { motion: 'bob', headDy: 1 }),
  cup: standing(['cup']),
  standRaise: standing(['raiseA', 'raiseB'], { frameDur: 0.6, motion: 'none' }),
  study: standing(['thinkB'], { motion: 'bob' }),
  sofa: { ...seated(['lap'], ['lap'], { motion: 'bob' }), front: { arms: ['lap'], legs: 'sofaF' } },
  bossCup: seated(['cup'], ['cup'], { motion: 'bob' }),
  slump: { ...standing(['down'], { carry: true, frameDur: 0, motion: 'none', headDy: 2 }), front: { arms: ['down'], legs: 'stride' }, back: { arms: ['down'], legs: 'stride' } },
  laptop: { ...standing(['tabletF'], { motion: 'bob', headDy: 1 }), back: { arms: ['tabletB'], legs: 'stand' } },
}

export function poseHeight(pose: PoseId, facing: 'front' | 'back'): number {
  const grid = LEGS[POSES[pose][facing].legs]
  return grid === undefined ? 35 : (grid.top ?? 0) + grid.rows.length
}

export type DefMap = Map<string, string>

function buildStatic(): DefMap {
  const defs: DefMap = new Map()
  const add = (id: string, body: string) => defs.set(id, `<g id="${id}">${body}</g>`)
  for (const [id, grid] of Object.entries(LEGS)) add(`L-${id}`, art(grid))
  for (const [id, grid] of Object.entries(LIMBS)) add(`l-${id}`, art(grid))
  for (const [id, limbs] of Object.entries(ARMS)) add(`A-${id}`, limbs.map(limb => `<use href="#l-${limb}"/>`).join(''))
  for (const [family, parts] of Object.entries(TORSO)) {
    add(`T-${family}-f`, art({ left: 7, top: 13, rows: parts.front }))
    add(`T-${family}-b`, art({ left: 7, top: 13, rows: parts.back }))
  }
  add('hf', art(HEAD_F))
  add('hb', art(HEAD_B))
  HAIR_STYLES.forEach((style, index) => {
    add(`h${index}f`, art(style.front, { shadeFrom: 17 }))
    add(`h${index}b`, art(style.back, { shadeFrom: 17 }))
  })
  for (const [id, grids] of Object.entries(WEAR)) add(`w-${id}`, art(grids, { outline: !id.startsWith('glasses') }))
  for (const [id, grid] of Object.entries(CARRY)) add(`c-${id}`, art(grid))
  for (const [id, grid] of Object.entries(ICONS)) add(`i-${id}`, art(grid))
  return defs
}

const STATIC_DEFS = buildStatic()

export function spriteDefs(phase: Phase): DefMap {
  const defs: DefMap = new Map(STATIC_DEFS)
  const blink = `<path d="M7 7h2v2h-2zM10 7h2v2h-2z" opacity="0"><animate attributeName="opacity" values="0;1;0" keyTimes="0;.93;.97" dur="4.2s" calcMode="discrete" ${phase(4.2)}/></path>`
  const steam = [0, 600, 1200]
    .map(
      (delay, index) =>
        `<rect x="${21 + (index % 2)}" y="15" width="1" height="1" fill="#fff" opacity="0"><animate attributeName="y" values="15;7" dur="1.8s" ${phase(1.8, delay)}/><animate attributeName="opacity" values="0;.9;0" dur="1.8s" ${phase(1.8, delay)}/></rect>`,
    )
    .join('')
  defs.set('blink', `<g id="blink">${blink}</g>`)
  defs.set('steam', `<g id="steam">${steam}</g>`)
  return defs
}

export function wearId(wear: Wear, facing: 'front' | 'back'): string {
  if (wear === 'none') return ''
  if (wear === 'hardhat') return 'w-hardhat'
  return `w-${wear}${facing === 'front' ? 'f' : 'b'}`
}

export function hashOf(text: string): number {
  let hash = 2166136261
  for (const char of text) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
