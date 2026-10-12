import { mkdirSync, writeFileSync } from 'node:fs'

import { castSvg, kitSvg, kitZoomSvg } from './catalog'

const out = process.argv[2] ?? '.'
mkdirSync(out, { recursive: true })
const T0 = Date.UTC(2026, 9, 8, 11, 0, 0)

for (const [name, svg] of [
  ['5-cast', castSvg(T0)],
  ['7-kit', kitSvg(T0)],
  ['10-kit-zoom', kitZoomSvg(T0)],
] as const) {
  writeFileSync(`${out}/${name}.svg`, svg)
  console.log(`${name}.svg written`)
}
