import { Chess, type Move, type Square } from 'chess.js'
import { boardMove, notationMeaning, reviewImpact, type CoachLevel, type Review } from './coach'
import type { Evaluation } from './engine'
import { tacticsOf } from './tactics'

export type StoryStep = {
  title: string
  text: string
  fen: string
  tone: 'move' | 'idea' | 'warning' | 'verdict'
  arrows: { from: Square; to: Square }[]
  squares: Square[]
  highlight?: Pick<Move, 'from' | 'to'>
  evaluation?: Evaluation
}

const names = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }

function action(move: Move) {
  const side = move.color === 'w' ? 'White' : 'Black'
  if (move.isKingsideCastle() || move.isQueensideCastle()) return `${side} castles: the king moves to ${move.to} and the rook comes into play beside it.`
  if (move.isEnPassant()) return `${side} plays ${move.san}, capturing the pawn beside it en passant.`
  const development = 'nb'.includes(move.piece) && move.from[1] === (move.color === 'w' ? '1' : '8')
    ? ' This develops a piece off the back rank.' : ''
  const center = move.piece === 'p' && /^[de][45]$/.test(move.to) ? ' This claims space in the center.' : ''
  return `${side} ${move.captured ? `captures the ${names[move.captured]} on ${move.to} with the ${names[move.piece]}` : `moves the ${names[move.piece]} from ${move.from} to ${move.to}`}.${move.promotion ? ` The pawn promotes to a ${names[move.promotion]}.` : ''}${development}${center}`
}

/** Board facts work immediately; only engine analysis may judge move quality. */
export function moveStory(move: Move, review?: Review, before?: Evaluation, after?: Evaluation, level: CoachLevel = 'beginner'): StoryStep[] {
  const route = [{ from: move.from, to: move.to }]
  const steps: StoryStep[] = [
    { title: `Before ${move.san}`, text: `Follow the ${names[move.piece]} from ${move.from} to ${move.to}.`,
      fen: move.before, tone: 'move', arrows: route, squares: [move.from], evaluation: before },
    { title: `The move · ${move.san}`, text: action(move), fen: move.after, tone: 'move',
      arrows: route, squares: [move.to], highlight: move, evaluation: after },
  ]
  const board = new Chess(move.after)
  if (board.isCheck()) {
    const king = board.board().flat().find(piece => piece?.type === 'k' && piece.color !== move.color)!
    steps.push({ title: board.isCheckmate() ? 'Checkmate' : 'Check on the king',
      text: board.isCheckmate() ? `The king on ${king.square} is in check, and there is no legal way to escape, block the check, or capture the attacker.`
        : `The king on ${king.square} is in check. The opponent must escape, block the check, or capture the checking piece.`,
      fen: move.after, tone: 'idea', arrows: board.attackers(king.square, move.color).map(from => ({ from, to: king.square })), squares: [king.square], evaluation: after })
  }
  for (const tactic of tacticsOf(move)) {
    steps.push({ title: tactic.kind === 'hanging piece' ? 'But look what is hanging' : `What it does · ${tactic.kind}`,
      text: tactic.description, fen: move.after, tone: tactic.kind === 'hanging piece' ? 'warning' : 'idea',
      arrows: tactic.arrows, squares: tactic.squares, evaluation: after })
  }
  if (review && before && after) {
    steps.push({ title: `Engine verdict · ${review.quality}`, text: `${reviewImpact(move, review, before, after, level)}. ${review.explanation}`,
      fen: move.after, tone: ['Inaccuracy', 'Mistake', 'Blunder'].includes(review.quality) ? 'warning' : 'verdict',
      arrows: [], squares: [move.to], evaluation: after })
    if (['Inaccuracy', 'Mistake', 'Blunder'].includes(review.quality)) {
      const reply = boardMove(move.after, after.bestMove)
      if (reply) steps.push({ title: 'The opponent’s strongest reply',
        text: `${notationMeaning(reply)}. This is the engine’s continuation, not a move from the recorded game.`,
        fen: reply.after, tone: 'warning', arrows: [{ from: reply.from, to: reply.to }], squares: [reply.to], highlight: reply })
      const best = boardMove(move.before, review.bestMove)
      if (best && best.lan !== move.lan) {
        steps.push({ title: 'Rewind to compare', text: `Back to the position before ${move.san}. The engine suggests ${best.san} instead.`,
          fen: move.before, tone: 'verdict', arrows: [{ from: best.from, to: best.to }], squares: [best.from], evaluation: before })
        steps.push({ title: `A better move · ${best.san}`, text: `${action(best)} This is the engine’s preferred alternative, not the recorded move.`,
          fen: best.after, tone: 'verdict', arrows: [{ from: best.from, to: best.to }], squares: [best.to], highlight: best })
      }
    }
  } else {
    steps.push({ title: 'The idea is not the verdict', text: 'An attack can look strong and still be a mistake. Analyze game to see the engine’s verdict, strongest reply, and a better move when needed.',
      fen: move.after, tone: 'verdict', arrows: [], squares: [] })
  }
  return steps
}
