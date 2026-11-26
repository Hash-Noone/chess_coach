import { Chess, SQUARES, type Move, type PieceSymbol, type Square } from 'chess.js'

export type Tactic = {
  kind: 'fork' | 'pin' | 'skewer' | 'discovered attack' | 'queen attack' | 'hanging piece'
  description: string
  arrows: { from: Square; to: Square }[]
  squares: Square[]
}

const names: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
const values: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }
type Piece = { square: Square; type: PieceSymbol }
const named = (piece: Piece) => `the ${names[piece.type]} on ${piece.square}`

function alongRay(board: Chess, from: Square, [df, dr]: number[]) {
  const pieces = []
  for (let file = from.charCodeAt(0) + df, rank = Number(from[1]) + dr;
    file >= 97 && file <= 104 && rank >= 1 && rank <= 8; file += df, rank += dr) {
    const square = `${String.fromCharCode(file)}${rank}` as Square
    const piece = board.get(square)
    if (piece) pieces.push({ ...piece, square })
    if (pieces.length === 2) break
  }
  return pieces
}

const diagonal = [[1, 1], [-1, 1], [1, -1], [-1, -1]]
const straight = [[1, 0], [-1, 0], [0, 1], [0, -1]]

export function tacticsOf(move: Move): Tactic[] {
  const before = new Chess(move.before)
  const board = new Chess(move.after)
  const attacker = board.get(move.to)
  if (!attacker) return []
  const enemy = board.turn()
  const side = move.color === 'w' ? 'White' : 'Black'
  const opponent = enemy === 'w' ? 'White' : 'Black'
  const pieceName = `The ${side.toLowerCase()} ${names[attacker.type]}`
  const found: Tactic[] = []
  const targets = board.board().flat().flatMap(piece =>
    piece && piece.color === enemy && board.attackers(piece.square, move.color).includes(move.to) ? [piece] : [])
  const isNew = (target: Piece) => !before.attackers(target.square, move.color).includes(move.from)
  const fork = targets.filter(piece => piece.type === 'k' || values[piece.type] > values[attacker.type] || !board.isAttacked(piece.square, enemy))
    .sort((a, b) => values[b.type] - values[a.type])
  if (fork.length > 1 && fork.some(isNew)) {
    found.push({ kind: 'fork', description: `${pieceName} on ${move.to} forks ${fork.slice(0, 3).map(named).join(' and ')}: it attacks them at the same time.`,
      arrows: fork.slice(0, 3).map(piece => ({ from: move.to, to: piece.square })), squares: fork.slice(0, 3).map(piece => piece.square) })
  } else {
    const queen = targets.find(piece => piece.type === 'q' && isNew(piece))
    if (queen) found.push({ kind: 'queen attack', description: `${pieceName} on ${move.to} attacks the ${opponent.toLowerCase()} queen on ${queen.square}.`,
      arrows: [{ from: move.to, to: queen.square }], squares: [queen.square] })
  }

  const rays = attacker.type === 'b' ? diagonal : attacker.type === 'r' ? straight : attacker.type === 'q' ? [...diagonal, ...straight] : []
  for (const direction of rays) {
    const [front, back] = alongRay(board, move.to, direction)
    if (!front || !back || front.color !== enemy || back.color !== enemy) continue
    if (values[front.type] < values[back.type]) {
      found.push({ kind: 'pin', description: `${pieceName} pins ${named(front)} to ${named(back)}${back.type === 'k' ? ', so it cannot move away' : ', so moving it exposes the piece behind it'}.`,
        arrows: [{ from: move.to, to: back.square }], squares: [front.square, back.square] })
    } else if (values[front.type] > values[back.type] && values[back.type] >= 3) {
      found.push({ kind: 'skewer', description: `${pieceName} lines up ${named(front)} and ${named(back)} behind it; moving the front piece exposes the one behind it.`,
        arrows: [{ from: move.to, to: back.square }], squares: [front.square, back.square] })
    }
  }

  for (const target of board.board().flat()) {
    if (!target || target.color !== enemy || values[target.type] < 5) continue
    const discovered = board.attackers(target.square, move.color).find(from => {
      const piece = board.get(from)
      if (from === move.to || !piece || !'brq'.includes(piece.type) || before.get(from)?.type !== piece.type) return false
      return !before.attackers(target.square, move.color).includes(from)
    })
    if (discovered) {
      const slider = board.get(discovered)!
      found.push({ kind: 'discovered attack', description: `Moving the ${names[move.piece]} out of the way lets the ${names[slider.type]} on ${discovered} attack ${named(target)}.`,
        arrows: [{ from: discovered, to: target.square }], squares: [discovered, target.square] })
    }
  }

  for (const destination of SQUARES) {
    const piece = board.get(destination)
    if (!piece || piece.color !== move.color || values[piece.type] < 3 || piece.type === 'k') continue
    if (board.isAttacked(destination, move.color) || !board.isAttacked(destination, enemy)) continue
    const newlyExposed = destination === move.to || !before.isAttacked(destination, enemy) || before.isAttacked(destination, move.color)
    if (newlyExposed && board.moves({ verbose: true }).some(reply => reply.captured && reply.to === destination)) {
      found.push({ kind: 'hanging piece', description: `${opponent} can capture the undefended ${names[piece.type]} on ${destination}.`,
        arrows: board.moves({ verbose: true }).filter(reply => reply.captured && reply.to === destination).map(reply => ({ from: reply.from, to: destination })), squares: [destination] })
    }
  }
  return found
}
