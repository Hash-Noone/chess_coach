import { Chess, validateFen, type Square } from 'chess.js'

export function readPlayPosition(input: string) {
  const fen = input.trim()
  const validation = validateFen(fen)
  if (!validation.ok) throw new Error(validation.error)

  const position = new Chess(fen)
  const [, turn, castling, enPassant] = fen.split(/\s+/)
  const waiting = turn === 'w' ? 'b' : 'w'
  const king = position.findPiece({ type: 'k', color: waiting })[0]
  if (position.isAttacked(king, position.turn())) throw new Error('Invalid FEN: the side not to move is in check')

  for (const [right, color, kingSquare, rookSquare] of [
    ['K', 'w', 'e1', 'h1'], ['Q', 'w', 'e1', 'a1'],
    ['k', 'b', 'e8', 'h8'], ['q', 'b', 'e8', 'a8'],
  ] as const) {
    if (!castling.includes(right)) continue
    const king = position.get(kingSquare)
    const rook = position.get(rookSquare)
    if (king?.type !== 'k' || king.color !== color || rook?.type !== 'r' || rook.color !== color) {
      throw new Error('Invalid FEN: castling rights do not match the king and rooks')
    }
  }
  if (enPassant !== '-') {
    const pawn = position.get(`${enPassant[0]}${turn === 'w' ? 5 : 4}` as Square)
    if (position.get(enPassant as Square) || pawn?.type !== 'p' || pawn.color !== waiting) {
      throw new Error('Invalid FEN: en passant square does not match a pawn move')
    }
  }
  return position
}
