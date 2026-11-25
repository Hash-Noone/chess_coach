import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { classify, reviewMove, summarize, winChance } from './coach'

describe('move classification', () => {
  it('uses win chance drops rather than raw centipawn thresholds', () => {
    expect([0, 1, 5, 10, 20].map(classify)).toEqual(['Best', 'Good', 'Inaccuracy', 'Mistake', 'Blunder'])
    expect(winChance(0)).toBe(50)
    expect(winChance(900) - winChance(800)).toBeLessThan(winChance(100) - winChance(0))
  })

  it('uses the mover’s perspective and distinguishes an engine best move from search noise', () => {
    const board = new Chess()
    board.move('e4')
    const move = board.move('a6')
    const result = reviewMove(move, { cp: -75, bestMove: 'e7e5', pv: [] }, { cp: 125, pv: [] })
    expect(result.loss).toBe(200)
    expect(result.winDrop).toBeGreaterThan(15)
    expect(result.explanation).toContain('Prefer e5: it claims space in the center.')
    expect(reviewMove(move, { cp: -75, bestMove: 'a7a6', pv: [] }, { cp: 125, pv: [] }).quality).toBe('Best')
  })
})

describe('coach explanations', () => {
  it('names a forced mate the player allowed and summarizes the critical moment', () => {
    const board = new Chess()
    board.move('f3')
    board.move('e5')
    const blunder = board.move('g4')
    const mate = board.move('Qh4#')
    const beforeMate = { cp: -10000, mate: -1, bestMove: 'd8h4', pv: ['d8h4'] }
    const result = reviewMove(blunder, { cp: -92, bestMove: 'e2e4', pv: [] }, beforeMate)
    expect(result).toMatchObject({ quality: 'Blunder', bestSan: 'e4', theme: 'mate' })
    expect(result.explanation).toContain('allows a forced mate in 1 starting with Qh4#')
    const final = reviewMove(mate, beforeMate, { cp: -10000, mate: 0, pv: [] })
    expect(final.explanation).toContain('Qh4# delivers checkmate')
    const summary = summarize([blunder, mate], [result, final])
    expect(summary.white).toBeLessThan(50)
    expect(summary.black).toBe(100)
    expect(summary.keyMoments.map(item => item.move.san)).toEqual(['g4'])
    expect(summary.tips).toHaveLength(2)
  })

  it('identifies an engine reply that wins an undefended piece', () => {
    const board = new Chess('4k3/8/8/5n2/2Q5/8/8/4K3 w - - 0 1')
    const move = board.move('Qd4')
    const result = reviewMove(move, { cp: 500, bestMove: 'c4a4', pv: [] }, { cp: -300, bestMove: 'f5d4', pv: [] })
    expect(result.explanation).toContain('Nxd4, which takes your queen on d4 without an immediate recapture')
  })
})
