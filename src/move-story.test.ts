import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { reviewMove } from './coach'
import { moveStory } from './move-story'

describe('board-linked move explanations', () => {
  it('separates a queen threat from the rook it hangs without inventing an engine verdict', () => {
    const move = new Chess('4k3/q7/8/8/8/2n5/7R/4K3 w - - 0 1').move('Ra2')
    const steps = moveStory(move)
    expect(steps[0].fen).toBe(move.before)
    expect(steps[1].fen).toBe(move.after)
    expect(steps.find(step => step.title.includes('queen attack'))).toMatchObject({
      text: expect.stringContaining('queen on a7'), arrows: [{ from: 'a2', to: 'a7' }], squares: ['a7'],
    })
    expect(steps.find(step => step.title.includes('hanging'))).toMatchObject({
      tone: 'warning', text: expect.stringContaining('undefended rook on a2'),
      arrows: expect.arrayContaining([{ from: 'c3', to: 'a2' }]), squares: ['a2'],
    })
    expect(steps.some(step => step.title.includes('Engine verdict'))).toBe(false)
    expect(steps.at(-1)?.text).toContain('Analyze game')
  })

  it('shows a bad move’s legal punishment, rewinds, and compares the engine alternative', () => {
    const move = new Chess('4k3/q7/8/8/8/2n5/7R/4K3 w - - 0 1').move('Ra2')
    const before = { cp: 0, bestMove: 'h2h3', pv: ['h2h3'] }
    const after = { cp: -500, bestMove: 'c3a2', pv: ['c3a2'] }
    const steps = moveStory(move, reviewMove(move, before, after), before, after)
    expect(steps.find(step => step.title.includes('Engine verdict'))?.title).toContain('Blunder')
    const reply = steps.find(step => step.title.includes('strongest reply'))!
    expect(new Chess(reply.fen).get('a2')).toMatchObject({ type: 'n', color: 'b' })
    expect(new Chess(reply.fen).get('c3')).toBeUndefined()
    expect(reply.evaluation).toBeUndefined() // The recorded score does not evaluate this extra ply.
    expect(steps.at(-2)?.fen).toBe(move.before)
    expect(new Chess(steps.at(-1)!.fen).get('h3')).toMatchObject({ type: 'r', color: 'w' })
    expect(steps.at(-1)?.text).toContain('not the recorded move')
  })

  it('highlights the checking piece and king, and distinguishes mate from a check', () => {
    const game = new Chess()
    for (const move of ['f3', 'e5', 'g4']) game.move(move)
    const mate = moveStory(game.move('Qh4#')).find(step => step.title === 'Checkmate')!
    expect(mate).toMatchObject({ arrows: [{ from: 'h4', to: 'e1' }], squares: ['e1'] })
    expect(new Chess(mate.fen).isCheckmate()).toBe(true)
    const check = moveStory(new Chess('4k3/8/8/8/8/8/7R/4K3 w - - 0 1').move('Re2+'))
    expect(check.find(step => step.title === 'Check on the king')?.text).toContain('must escape')
  })

  it('uses the real board for forks and discovered attacks', () => {
    const fork = new Chess('r1bqk2r/ppp2ppp/2np4/4p3/2B1P1n1/2NPPN2/PPP3PP/R2Q1RK1 b kq - 4 8').move('Nxe3')
    const arrows = moveStory(fork).find(step => step.title.includes('fork'))!.arrows
    expect(arrows).toEqual(expect.arrayContaining([{ from: 'e3', to: 'd1' }, { from: 'e3', to: 'f1' }]))
    const discovery = new Chess('6k1/4q3/8/8/8/8/4B3/3KR3 w - - 0 1').move('Bd3')
    expect(moveStory(discovery).find(step => step.title.includes('discovered attack'))?.arrows).toEqual([{ from: 'e1', to: 'e7' }])
  })

  it('keeps castling, en passant, and promotion narration faithful to the resulting board', () => {
    const castle = new Chess('4k3/8/8/8/8/8/8/4K2R w K - 0 1').move('O-O')
    expect(moveStory(castle)[1].text).toContain('king moves to g1 and the rook')
    const game = new Chess()
    for (const san of ['e4', 'a6', 'e5', 'd5']) game.move(san)
    const enPassant = moveStory(game.move('exd6'))[1]
    expect(enPassant.text).toContain('en passant')
    expect(new Chess(enPassant.fen).get('d5')).toBeUndefined()
    const promotion = moveStory(new Chess('4k3/P7/8/8/8/8/8/4K3 w - - 0 1').move('a8=N'))[1]
    expect(promotion.text).toContain('promotes to a knight')
    expect(new Chess(promotion.fen).get('a8')?.type).toBe('n')
  })
})
