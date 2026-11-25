import type { Chess } from 'chess.js'

const inputCount = 773
const width = 64
const scale = 4096
export const pieceValues = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 }
const kinds = 'pnbrqk'

export function decodeModel(data: ArrayBuffer) {
  if (data.byteLength !== (inputCount * width + width * 2 + 1) * 2) throw new Error('Invalid trained-engine weights.')
  const view = new DataView(data)
  const weights = Float32Array.from({ length: data.byteLength / 2 }, (_, index) => view.getInt16(index * 2, true) / scale)
  const hiddenBias = weights.subarray(inputCount * width, (inputCount + 1) * width)
  const output = weights.subarray((inputCount + 1) * width)
  const accumulator = new Float32Array(width)
  function feature(index: number) {
    const offset = index * width
    for (let i = 0; i < width; i++) accumulator[i] += weights[offset + i]
  }

  return (game: Chess) => {
    accumulator.set(hiddenBias)
    let material = 0
    for (const rank of game.board()) {
      for (const piece of rank) {
        if (!piece) continue
        const index = (Number(piece.square[1]) - 1) * 8 + piece.square.charCodeAt(0) - 97
        feature(((piece.color === 'b' ? 6 : 0) + kinds.indexOf(piece.type)) * 64 + index)
        material += pieceValues[piece.type] * (piece.color === 'w' ? 1 : -1)
      }
    }
    if (game.turn() === 'w') feature(768)
    const rights = [game.getCastlingRights('w'), game.getCastlingRights('b')]
    for (let i = 0; i < rights.length; i++) {
      if (rights[i].k) feature(769 + 2 * i)
      if (rights[i].q) feature(770 + 2 * i)
    }
    let estimate = output[width]
    for (let i = 0; i < width; i++) estimate += Math.max(0, Math.min(3, accumulator[i])) * output[i]
    return Math.round(Math.max(-5000, Math.min(5000, material + 800 * estimate)))
  }
}
