import { OX, OY, ROOM_H, ROOM_W, idleScreens, isSeatChair, roomLayers, roomVars, setArtClock } from '../../hooks/art'
import type { Box2, Drawable } from '../../hooks/art'
import { raster, rasterNow, svgDoc } from './raster'

export type Piece = { index: number; depth: number; box: Box2; svg: string }

const PAD = 2

export function roomPieces(): Piece[] {
  return roomLayers(false, isSeatChair)
    .drawables.filter((item): item is Drawable & { box: Box2 } => item.box !== undefined)
    .map((item, index) => ({ index, depth: item.depth, box: item.box, svg: item.svg }))
}

export async function roomRaster(now: number, scale: number): Promise<HTMLCanvasElement> {
  setArtClock(now)
  const layers = roomLayers(false, isSeatChair)
  const drawables = [...layers.drawables, ...idleScreens()].sort((a, b) => a.depth - b.depth)
  const body = `<rect width="${ROOM_W}" height="${ROOM_H}" fill="#151824"/><g transform="translate(${OX},${OY})">${layers.ground}${drawables.map(item => item.svg).join('')}</g>`
  const style = roomVars(now)
  return rasterNow(`room|${style}|${scale}`, () => ({ svg: svgDoc(0, 0, ROOM_W, ROOM_H, body, style), width: ROOM_W * scale, height: ROOM_H * scale }))
}

export function pieceRaster(key: string, box: Box2, svg: string, scale: number): HTMLCanvasElement | undefined {
  return raster(`${key}|${scale}`, () => ({
    svg: svgDoc(OX + box.x - PAD, OY + box.y - PAD, box.w + PAD * 2, box.h + PAD * 2, `<g transform="translate(${OX},${OY})">${svg}</g>`),
    width: (box.w + PAD * 2) * scale,
    height: (box.h + PAD * 2) * scale,
  }))
}

export function pieceOrigin(box: Box2): [number, number] {
  return [OX + box.x - PAD, OY + box.y - PAD]
}
