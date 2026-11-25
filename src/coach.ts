import { Chess, type Color, type Move } from 'chess.js'
import { coordinateMove, type Evaluation } from './engine'

export const qualities = ['Best', 'Good', 'Inaccuracy', 'Mistake', 'Blunder'] as const
export type Quality = typeof qualities[number]

export type Review = {
  quality: Quality
  loss: number
  winDrop: number
  explanation: string
  bestSan?: string
  theme?: 'mate' | 'material' | 'development' | 'position'
  bestMove?: string
}

const names = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: Infinity }

export function winChance(cp: number) {
  return 100 / (1 + Math.exp(-0.00368208 * cp))
}

export function classify(winDrop: number): Quality {
  if (winDrop < 1) return 'Best'
  if (winDrop < 5) return 'Good'
  if (winDrop < 10) return 'Inaccuracy'
  if (winDrop < 20) return 'Mistake'
  return 'Blunder'
}

export function boardMove(fen: string, uci?: string): Move | undefined {
  if (!uci) return
  try { return new Chess(fen).move(coordinateMove(uci)) } catch { return }
}

function idea(move: Move) {
  if (move.san.endsWith('#')) return 'delivers checkmate'
  if (move.isKingsideCastle() || move.isQueensideCastle()) return 'tucks the king away and brings a rook into play'
  if (move.promotion) return `promotes the pawn to a ${names[move.promotion]}`
  if (move.captured) return `takes the ${names[move.captured]} on ${move.to}${move.san.endsWith('+') ? ' with check' : ''}`
  if (move.san.endsWith('+')) return 'forces the king to respond to a check'
  if ((move.piece === 'b' || move.piece === 'n') && move.from[1] === (move.color === 'w' ? '1' : '8')) {
    return `develops the ${names[move.piece]} off the back rank`
  }
  if (move.piece === 'p' && /^[de][45]$/.test(move.to)) return 'claims space in the center'
  return null
}

export function reviewMove(move: Move, before: Evaluation, after: Evaluation): Review {
  const sign = move.color === 'w' ? 1 : -1
  const best = boardMove(move.before, before.bestMove)
  const isBest = best?.lan === move.lan
  const loss = isBest ? 0 : Math.max(0, Math.round((before.cp - after.cp) * sign))
  const winDrop = isBest ? 0 : Math.max(0, winChance(before.cp * sign) - winChance(after.cp * sign))
  const concededMate = after.mate !== undefined && after.mate * sign < 0 && (before.mate === undefined || before.mate * sign >= 0)
  const missedMate = before.mate !== undefined && before.mate * sign > 0 && (after.mate === undefined || after.mate * sign <= 0) && !move.san.endsWith('#')
  const quality = isBest ? 'Best' : concededMate ? 'Blunder' : missedMate && winDrop < 10 ? 'Mistake' : classify(winDrop)
  const result: Review = { quality, loss, winDrop, bestSan: best?.san, bestMove: before.bestMove, explanation: '' }

  if (move.san.endsWith('#')) return { ...result, explanation: `${move.san} delivers checkmate. The king has no legal escape.`, theme: 'mate' }
  if (isBest || quality === 'Best' || quality === 'Good') {
    const description = idea(move)
    return { ...result, explanation: description
      ? `${move.san} ${description}${isBest ? ' and is Stockfish’s top choice' : ''}.`
      : isBest ? `${move.san} is Stockfish’s top choice in this position.` : `${move.san} holds a similar evaluation to the engine’s best line.` }
  }

  const bestIdea = best && idea(best)
  const alternative = best ? ` Prefer ${best.san}${bestIdea ? `: it ${bestIdea}` : ', which keeps a better position in the engine’s analysis'}.` : ''
  const reply = boardMove(move.after, after.bestMove)
  if (concededMate) {
    const distance = Math.abs(after.mate!)
    return { ...result, explanation: `${move.san} allows a forced mate in ${distance}${reply ? ` starting with ${reply.san}` : ''}.${alternative}`, theme: 'mate' }
  }
  if (missedMate) return { ...result, explanation: `${move.san} misses a forced mate in ${Math.abs(before.mate!)}.${alternative}`, theme: 'mate' }

  if (reply?.captured) {
    const board = new Chess(reply.after)
    const canRecapture = board.moves({ verbose: true }).some(candidate => candidate.to === reply.to && candidate.captured)
    if (!canRecapture || values[reply.captured] > values[reply.piece]) {
      return { ...result, explanation: `${move.san} allows ${reply.san}, which takes your ${names[reply.captured]} on ${reply.to}${canRecapture ? ' with a lower-value piece' : ' without an immediate recapture'}.${alternative}`, theme: 'material' }
    }
  }
  if (reply?.piece === 'n') {
    const position = new Chess(reply.after)
    const targets = position.board().flat().filter(piece => piece && piece.color === move.color && values[piece.type] >= 5
      && position.attackers(piece.square, reply.color).includes(reply.to))
    if (targets.length >= 2) return { ...result, explanation: `${move.san} allows ${reply.san}, forking your ${targets.slice(0, 2).map(piece => `${names[piece!.type]} on ${piece!.square}`).join(' and ')}.${alternative}`, theme: 'material' }
  }
  if (best?.captured && values[best.captured] >= 3) return { ...result, explanation: `${move.san} passes up the chance to take a ${names[best.captured]}.${alternative}`, theme: 'material' }
  return { ...result, explanation: `${move.san} ${quality === 'Inaccuracy' ? 'gives up some of your position’s potential' : 'makes the position harder to hold'}.${alternative}`, theme: bestIdea?.startsWith('develops') ? 'development' : 'position' }
}

export function summarize(moves: Move[], reviews: Review[]) {
  const rated = reviews.map((review, index) => ({ ...review, move: moves[index], index }))
  const accuracy = (color: Color) => {
    const side = rated.filter(item => item.move.color === color)
    if (!side.length) return null
    return Math.round(side.reduce((total, item) => total + (item.quality === 'Best' ? 100 : Math.max(0, 103.1668 * Math.exp(-0.04354 * item.winDrop) - 3.1669)), 0) / side.length)
  }
  const keyMoments = rated.filter(item => ['Inaccuracy', 'Mistake', 'Blunder'].includes(item.quality))
    .sort((a, b) => b.winDrop - a.winDrop).slice(0, 3)
  const advice = {
    mate: 'Before moving, look at every check your opponent can give and count your king’s escape squares.',
    material: 'Check what the opponent can capture after your move and whether you can recapture safely.',
    development: 'In the opening, develop knights and bishops before spending extra moves on the same piece.',
    position: 'Compare two candidate moves before committing; consider your opponent’s strongest reply to each.',
  }
  const themes = Array.from(new Set(keyMoments.map(item => item.theme ?? 'position')))
  const tips = themes.map(theme => advice[theme])
  if (tips.length < 2) tips.push('Replay a critical position and try to find the engine’s move before revealing the arrow.')
  if (tips.length < 2) tips.push(advice.position)
  return { white: accuracy('w'), black: accuracy('b'), keyMoments, tips }
}
