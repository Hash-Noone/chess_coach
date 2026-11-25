import { readFileSync } from 'node:fs'
import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { decodeModel } from './learned-evaluation'
import { openingMove, search } from './learned-search'

const data = readFileSync(new URL('../public/lichess-engine/model.bin', import.meta.url))
const evaluate = decodeModel(Uint8Array.from(data).buffer)
const book = JSON.parse(readFileSync(new URL('../public/lichess-engine/book.json', import.meta.url), 'utf8'))

describe('Lichess-trained engine', () => {
  it('scores a clear material advantage for the correct side with the shipped network', () => {
    expect(evaluate(new Chess('4k3/8/8/8/8/8/8/3QK3 w - - 0 1'))).toBeGreaterThan(300)
    expect(evaluate(new Chess('3qk3/8/8/8/8/8/8/4K3 b - - 0 1'))).toBeLessThan(-300)
  })

  it('selects legal frequency-weighted moves from the shipped opening book', () => {
    const game = new Chess()
    const first = openingMove(game, book, () => 0)
    const last = openingMove(game, book, () => 0.999)
    const choices = game.moves({ verbose: true }).map(move => move.lan)
    expect(choices).toContain(first)
    expect(choices).toContain(last)
    expect(first).not.toBe(last)
  })

  it('finds a forced mate at a shallow depth without mutating the position', () => {
    const game = new Chess()
    for (const move of ['f3', 'e5', 'g4']) game.move(move)
    const initial = game.fen()
    const result = search(game, evaluate, { depth: 2, timeMs: 1000 })
    expect(result).toMatchObject({ bestMove: 'd8h4', mate: -1 })
    expect(game.fen()).toBe(initial)
  })

  it('quiescence avoids a poisoned capture and returns a legal move at a node cutoff', () => {
    const game = new Chess('4k3/8/2p5/3r4/8/8/8/3QK3 w - - 0 1')
    const initial = game.fen()
    const result = search(game, evaluate, { depth: 2, timeMs: 1000, nodes: 750 })
    expect(result.bestMove).not.toBe('d1d5')
    expect(game.moves({ verbose: true }).map(move => move.lan)).toContain(result.bestMove)
    expect(game.fen()).toBe(initial)
  })
})
