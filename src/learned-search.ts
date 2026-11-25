import { Chess, type Move } from 'chess.js'
import type { Evaluation } from './engine'
import { pieceValues } from './learned-evaluation'

export type Book = Record<string, [string, number][]>
export type SearchLimits = { depth: number; timeMs: number; nodes?: number }
type Line = { score: number; pv: string[] }
const mate = 30000
const timeout = Symbol('search budget')

export function openingMove(game: Chess, book: Book, random = Math.random) {
  const entries = book[game.fen().split(' ').slice(0, 4).join(' ')]
  if (!entries?.length) return
  const legal = new Set(game.moves({ verbose: true }).map(move => move.lan))
  const choices = entries.filter(([uci]) => legal.has(uci))
  const total = choices.reduce((sum, [, count]) => sum + count, 0)
  let pick = random() * total
  for (const [uci, count] of choices) {
    pick -= count
    if (pick < 0) return uci
  }
}

function order(moves: Move[], pinned?: string) {
  const score = (move: Move) => move.lan === pinned ? 100000
    : (move.captured ? 10 * pieceValues[move.captured] - pieceValues[move.piece] : 0)
      + (move.promotion ? pieceValues[move.promotion] : 0) + (/[+#]$/.test(move.san) ? 30 : 0)
  return moves.sort((a, b) => score(b) - score(a))
}

export function search(game: Chess, evaluate: (game: Chess) => number, limits: SearchLimits): Evaluation {
  const stopAt = performance.now() + limits.timeMs
  let nodes = 0
  const sign = () => game.turn() === 'w' ? 1 : -1
  const checkTime = () => {
    nodes++
    if (nodes > (limits.nodes ?? Infinity) || ((nodes & 15) === 0 && performance.now() >= stopAt)) throw timeout
  }

  function visit(depth: number, alpha: number, beta: number, ply: number, previous: string[] = [], quietPly = 0): Line {
    checkTime()
    const moves = game.moves({ verbose: true })
    const check = game.isCheck()
    if (!moves.length) return { score: check ? -mate + ply : 0, pv: [] }
    if (game.isInsufficientMaterial() || game.isThreefoldRepetition() || game.isDrawByFiftyMoves()) return { score: 0, pv: [] }

    let value: Line = { score: -Infinity, pv: [] }
    if (depth <= 0) {
      if (!check || quietPly >= 5) {
        value.score = evaluate(game) * sign()
        if (value.score >= beta || quietPly >= 5) return value
        alpha = Math.max(alpha, value.score)
      }
    }

    const candidates = depth > 0 || check ? moves : moves.filter(move => move.captured || move.promotion)
    for (const move of order(candidates, previous[0])) {
      game.move(move.lan)
      let child: Line
      try {
        child = visit(depth - 1, -beta, -alpha, ply + 1, previous[0] === move.lan ? previous.slice(1) : [], depth <= 0 ? quietPly + 1 : 0)
      } finally { game.undo() }
      const score = -child.score
      if (score > value.score) value = { score, pv: [move.lan, ...child.pv] }
      alpha = Math.max(alpha, score)
      if (alpha >= beta) break
    }
    return value
  }

  const signAtRoot = sign()
  const playable = order(game.moves({ verbose: true }))
  if (!playable.length || game.isDraw()) {
    return { cp: game.isCheckmate() ? -signAtRoot * 10000 : 0, mate: game.isCheckmate() ? 0 : undefined, pv: [] }
  }
  let best: Line = { score: evaluate(game) * signAtRoot, pv: [playable[0].lan] }
  for (let depth = 1; depth <= limits.depth; depth++) {
    try {
      best = visit(depth, -Infinity, Infinity, 0, best.pv)
      if (Math.abs(best.score) > mate - 100 || performance.now() >= stopAt) break
    } catch (error) {
      if (error === timeout) break
      throw error
    }
  }
  const forcedMate = Math.abs(best.score) > mate - 100 ? Math.sign(best.score) * signAtRoot * Math.ceil((mate - Math.abs(best.score)) / 2) : undefined
  return { cp: forcedMate ? Math.sign(forcedMate) * 10000 : best.score * signAtRoot, mate: forcedMate, pv: best.pv, bestMove: best.pv[0] }
}
