import { Chess, SQUARES, type Color, type Move, type Square } from 'chess.js'
import { coordinateMove, type Evaluation } from './engine'
import { tacticsOf, type Tactic } from './tactics'

export const qualities = ['Best', 'Good', 'Inaccuracy', 'Mistake', 'Blunder'] as const
export type Quality = typeof qualities[number]
export type CoachLevel = 'beginner' | 'advanced'

export type Review = {
  quality: Quality
  loss: number
  winDrop: number
  explanation: string
  bestSan?: string
  theme?: 'mate' | 'material' | 'development' | 'position'
  bestMove?: string
  playedTactics: Tactic[]
  bestTactics: Tactic[]
  bestFollowup?: { san: string[]; text: string }
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

export function notationMeaning(move: Move) {
  const action = move.isKingsideCastle() ? 'castle toward the king’s side'
    : move.isQueensideCastle() ? 'castle toward the queen’s side'
    : `${names[move.piece]} ${move.captured ? `takes the ${names[move.captured]} on` : 'to'} ${move.to}`
  const promotion = move.promotion ? `, promotes to a ${names[move.promotion]}` : ''
  const check = move.san.endsWith('#') ? ', checkmate' : move.san.endsWith('+') ? ', check' : ''
  return `${move.san} = ${action}${promotion}${check}`
}

function square(file: number, rank: number) {
  return `${String.fromCharCode(file)}${rank}` as Square
}

function mateReason(move: Move) {
  const board = new Chess(move.after)
  const king = board.board().flat().find(piece => piece?.type === 'k' && piece.color !== move.color)
  if (!king) return ''
  const [file, rank] = [king.square.charCodeAt(0), Number(king.square[1])]
  const blocked: string[] = []
  const attacked: string[] = []
  board.remove(king.square)
  for (const destination of [...SQUARES].sort()) {
    if (destination === king.square || Math.abs(destination.charCodeAt(0) - file) > 1 || Math.abs(Number(destination[1]) - rank) > 1) continue
    const occupant = board.get(destination)
    if (occupant?.color === king.color) blocked.push(`${destination} (its own ${names[occupant.type]})`)
    else if (board.isAttacked(destination, move.color)) attacked.push(destination)
  }
  const reasons = [
    blocked.length ? `its pieces block ${blocked.join(', ')}` : '',
    attacked.length ? `${attacked.join(', ')} ${attacked.length === 1 ? 'is' : 'are'} under attack` : '',
  ].filter(Boolean)
  return `The king on ${king.square} cannot escape${reasons.length ? `: ${reasons.join('; ')}` : ''}. No piece can block the check or take the attacker.`
}

function pawnWeakness(move: Move) {
  if (move.piece !== 'p') return ''
  const before = new Chess(move.before)
  const after = new Chess(move.after)
  const king = before.board().flat().find(piece => piece?.type === 'k' && piece.color === move.color)
  if (!king) return ''
  const [file, rank] = [king.square.charCodeAt(0), Number(king.square[1])]
  const [df, dr] = [move.from.charCodeAt(0) - file, Number(move.from[1]) - rank]
  const weaknesses: string[] = []
  if (Math.abs(df) === 1 && dr === (move.color === 'w' ? 1 : -1) && !after.get(move.from)) {
    let tip = move.from
    for (let n = 2; file + n * df >= 97 && file + n * df <= 104 && rank + n * dr >= 1 && rank + n * dr <= 8; n++) {
      const next = square(file + n * df, rank + n * dr)
      if (after.get(next)?.color === move.color) break
      tip = next
      if (after.get(next)) break
    }
    if (tip !== move.from) weaknesses.push(`opens the ${king.square}–${tip} diagonal toward your king`)
  }
  const knight = before.attackers(move.to, move.color).find(from => before.get(from)?.type === 'n')
  if (knight && move.from[1] === (move.color === 'w' ? '2' : '7')) weaknesses.push(`takes ${move.to} away from your knight on ${knight}`)
  return weaknesses.length ? `Moving this pawn ${weaknesses.join(' and ')}.` : ''
}

function avoidsMate(best: Move, mate: Move) {
  const retry = boardMove(best.after, mate.lan)
  if (!retry) return `Try ${best.san} instead (${names[best.piece]} to ${best.to}); the opponent cannot play ${mate.san.replace('#', '')} in that position.`
  if (retry.san.endsWith('#')) return ''
  if (!retry.san.endsWith('+')) return `Try ${best.san} instead. Then ${retry.san} would no longer put your king in check.`
  const evasions = new Chess(retry.after).moves({ verbose: true })
  const response = evasions.find(move => move.captured && move.to === retry.to)
    ?? evasions.find(move => move.piece !== 'k')
    ?? evasions[0]
  if (!response) return ''
  const defense = response.piece === 'k' ? `move the king to ${response.to}`
    : response.captured && response.to === retry.to ? `take the checking ${names[retry.piece]} with your ${names[response.piece]}`
    : `block the check with your ${names[response.piece]} from ${response.from} to ${response.to}`
  return `Try ${best.san} instead. If the opponent plays ${retry.san}, you can ${defense}.`
}

function followup(best: Move, pv: string[]) {
  if (pv[0] !== best.lan) return
  const reply = boardMove(best.after, pv[1])
  const next = reply && boardMove(reply.after, pv[2])
  if (!reply || !next) return
  const opponent = reply.color === 'w' ? 'White' : 'Black'
  const side = next.color === 'w' ? 'White' : 'Black'
  const action = next.captured ? `takes the ${names[next.captured]} on ${next.to} with the ${names[next.piece]}`
    : `moves the ${names[next.piece]} to ${next.to}`
  return {
    san: [best.san, reply.san, next.san],
    text: `For example, if ${opponent} plays ${notationMeaning(reply)}, ${side} ${action} (${next.san}).`,
  }
}

export function beginnerExplanation(move: Move, before: Evaluation, after: Evaluation, review: Review) {
  const notation = notationMeaning(move) + '.'
  if (move.san.endsWith('#')) return `${notation} ${mateReason(move)}`
  const best = boardMove(move.before, before.bestMove)
  const reply = boardMove(move.after, after.bestMove)
  if (reply?.san.endsWith('#') && review.theme === 'mate') {
    const defense = best && avoidsMate(best, reply)
    return `${notation} That lets ${reply.color === 'w' ? 'White' : 'Black'} play ${notationMeaning(reply)}. ${mateReason(reply)}${defense ? ' ' + defense : ''}`
  }
  if (review.quality === 'Inaccuracy' || review.quality === 'Mistake' || review.quality === 'Blunder') {
    const weakness = pawnWeakness(move)
    if (weakness) {
      const alternative = best && idea(best)
      const threat = review.bestTactics.find(tactic => tactic.kind !== 'hanging piece')
      const suggestion = threat ? ` Try ${best?.san} instead. ${threat.description} ${review.bestFollowup?.text ?? ''}`
        : best ? ` Try ${best.san} instead${alternative ? `: it ${alternative}` : ''}.` : ''
      return [`${notation} ${weakness}${suggestion}`, ...review.playedTactics.map(tactic => tactic.description)].join(' ').trim()
    }
  }
  return `${notation} ${review.explanation}`
}

export function reviewImpact(move: Move, review: Review, before: Evaluation, after: Evaluation, level: CoachLevel) {
  if (move.san.endsWith('#')) return 'Delivered checkmate'
  if (before.mate !== undefined || after.mate !== undefined) {
    if (review.theme !== 'mate') return ''
    return after.mate !== undefined && after.mate * (move.color === 'w' ? 1 : -1) < 0 ? 'Allowed checkmate' : 'Missed a chance to force checkmate'
  }
  if (level === 'advanced') return `${review.loss} cp loss · ${review.winDrop.toFixed(1)} point win chance drop`
  if (review.loss < 5) return 'No meaningful loss of advantage'
  const pawns = review.loss / 100
  return `Lost about ${pawns.toFixed(1)} ${pawns.toFixed(1) === '1.0' ? 'pawn' : 'pawns'} of advantage`
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
  const playedTactics = tacticsOf(move)
  const bestTactics = !best ? [] : isBest ? playedTactics : tacticsOf(best)
  const bestThreat = bestTactics.find(tactic => tactic.kind !== 'hanging piece')
  const bestFollowup = best && followup(best, before.pv)
  const result: Review = { quality, loss, winDrop, bestSan: best?.san, bestMove: before.bestMove, explanation: '', playedTactics, bestTactics, bestFollowup }
  const explain = (explanation: string, theme?: Review['theme']): Review => ({ ...result, theme,
    explanation: [explanation, ...playedTactics.map(tactic => tactic.description)].join(' ') })

  if (move.san.endsWith('#')) return explain(`${move.san} delivers checkmate. The king has no legal escape.`, 'mate')
  if (isBest || quality === 'Best' || quality === 'Good') {
    const description = idea(move)
    return explain(description
      ? `${move.san} ${description}${isBest ? ' and is Stockfish’s top choice' : ''}.`
      : isBest ? `${move.san} is Stockfish’s top choice in this position.` : `${move.san} holds a similar evaluation to the engine’s best line.`)
  }

  const bestIdea = best && idea(best)
  const alternative = !best ? '' : bestThreat ? ` Prefer ${best.san}. ${bestThreat.description}${bestFollowup ? ' ' + bestFollowup.text : ''}`
    : ` Prefer ${best.san}${bestIdea ? `: it ${bestIdea}` : ', which keeps a better position in the engine’s analysis'}.`
  const reply = boardMove(move.after, after.bestMove)
  if (concededMate) {
    const distance = Math.abs(after.mate!)
    return explain(`${move.san} allows a forced mate in ${distance}${reply ? ` starting with ${reply.san}` : ''}.${alternative}`, 'mate')
  }
  if (missedMate) return explain(`${move.san} misses a forced mate in ${Math.abs(before.mate!)}.${alternative}`, 'mate')

  if (reply?.captured) {
    const board = new Chess(reply.after)
    const canRecapture = board.moves({ verbose: true }).some(candidate => candidate.to === reply.to && candidate.captured)
    if (!canRecapture || values[reply.captured] > values[reply.piece]) {
      return explain(`${move.san} allows ${reply.san}, which takes your ${names[reply.captured]} on ${reply.to}${canRecapture ? ' with a lower-value piece' : ' without an immediate recapture'}.${alternative}`, 'material')
    }
  }
  if (reply?.piece === 'n') {
    const position = new Chess(reply.after)
    const targets = position.board().flat().filter(piece => piece && piece.color === move.color && values[piece.type] >= 5
      && position.attackers(piece.square, reply.color).includes(reply.to))
    if (targets.length >= 2) return explain(`${move.san} allows ${reply.san}, forking your ${targets.slice(0, 2).map(piece => `${names[piece!.type]} on ${piece!.square}`).join(' and ')}.${alternative}`, 'material')
  }
  if (best?.captured && values[best.captured] >= 3) return explain(`${move.san} passes up the chance to take a ${names[best.captured]}.${alternative}`, 'material')
  return explain(`${move.san} ${quality === 'Inaccuracy' ? 'gives up some of your position’s potential' : 'makes the position harder to hold'}.${alternative}`, bestIdea?.startsWith('develops') ? 'development' : 'position')
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
