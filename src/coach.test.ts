import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { beginnerExplanation, classify, reviewImpact, reviewMove, summarize, winChance } from './coach'
import { moveFacts, movePrompt } from './llm'
import { tacticsOf } from './tactics'

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

  it('explains the king diagonal and knight square opened up by f3', () => {
    const move = new Chess().move('f3')
    const before = { cp: 30, bestMove: 'e2e4', pv: [] }
    const after = { cp: -61, bestMove: 'e7e5', pv: [] }
    const review = reviewMove(move, before, after)
    const text = beginnerExplanation(move, before, after, review)
    expect(text).toContain('f3 = pawn to f3')
    expect(text).toContain('opens the e1–h4 diagonal')
    expect(text).toContain('takes f3 away from your knight on g1')
    expect(reviewImpact(move, review, before, after, 'beginner')).toBe('Lost about 0.9 pawns of advantage')
  })

  it('translates the Fool’s Mate notation, names the blocked exits, and verifies the alternative defense', () => {
    const board = new Chess()
    for (const san of ['f3', 'e5']) board.move(san)
    const move = board.move('g4')
    const before = { cp: -61, bestMove: 'e2e4', pv: ['e2e4'] }
    const after = { cp: -10000, mate: -1, bestMove: 'd8h4', pv: ['d8h4'] }
    const review = reviewMove(move, before, after)
    const text = beginnerExplanation(move, before, after, review)
    for (const phrase of ['Qh4# = queen to h4, checkmate', 'd1 (its own queen)', 'd2 (its own pawn)', 'e2 (its own pawn)', 'f1 (its own bishop)', 'f2 is under attack', 'Try e4 instead', 'block the check with your pawn from g2 to g3']) {
      expect(text).toContain(phrase)
    }
    expect(reviewImpact(move, review, before, after, 'beginner')).toBe('Allowed checkmate')
  })
})

describe('tactics from played and recommended moves', () => {
  it('explains the queen and rook fork on 8...Nxe3 in Lichess Xdv6URa9', () => {
    const move = new Chess('r1bqk2r/ppp2ppp/2np4/4p3/2B1P1n1/2NPPN2/PPP3PP/R2Q1RK1 b kq - 4 8').move('Nxe3')
    const before = { cp: -190, bestMove: 'g4e3', pv: ['g4e3'] }
    const after = { cp: -185, pv: [] }
    const result = reviewMove(move, before, after)
    expect(result.explanation).toContain('forks the queen on d1 and the rook on f1')
    expect(moveFacts(move, result, before, after).playedTactics[0]).toMatchObject({ kind: 'fork' })
  })

  it('explains the attack and verified follow-up for 14.Bg5 in Lichess a9hXsw20', () => {
    const move = new Chess('r1b2rk1/1pp1qp1p/p1nb2p1/4p3/2BPN2P/2PQB3/PP3PP1/R3K2R w KQ - 0 14').move('h5')
    const before = { cp: 390, bestMove: 'e3g5', pv: ['e3g5', 'e5d4', 'g5e7'] }
    const after = { cp: -100, pv: [] }
    const result = reviewMove(move, before, after)
    expect(result.explanation).toContain('Prefer Bg5. The white bishop on g5 attacks the black queen on e7.')
    expect(result.explanation).toContain('White takes the queen on e7 with the bishop (Bxe7)')
    const facts = moveFacts(move, result, before, after)
    expect(facts.bestFollowup?.san).toEqual(['Bg5', 'exd4', 'Bxe7'])
    expect(facts.bestTactics[0]).toMatchObject({ kind: 'queen attack' })
    const prompt = movePrompt(facts, 'beginner')
    expect(prompt.system).toContain('translate algebraic notation')
    expect(prompt.user).toContain('"bestTactics"')
    expect(movePrompt(facts, 'advanced').system).toContain('standard tactical and evaluation terms')
  })

  it('detects a pin, a skewer, and a discovered attack based on the pieces on the actual board', () => {
    const pin = new Chess('4k3/8/2n5/8/2B5/8/8/4K3 w - - 0 1').move('Bb5')
    const skewer = new Chess('r3k3/q7/8/8/8/8/7R/4K3 w - - 0 1').move('Ra2')
    const discovery = new Chess('6k1/4q3/8/8/8/8/4B3/3KR3 w - - 0 1').move('Bd3')
    expect(tacticsOf(pin)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'pin' })]))
    expect(tacticsOf(skewer)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'skewer' })]))
    expect(tacticsOf(discovery)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'discovered attack' })]))
  })
})
