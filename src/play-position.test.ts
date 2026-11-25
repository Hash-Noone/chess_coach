import { expect, it } from 'vitest'
import { gameLabel } from './Board'
import { readPlayPosition } from './play-position'

it('rejects malformed FEN and impossible check, castling, and en passant states', () => {
  expect(() => readPlayPosition('not a position')).toThrow('Invalid FEN')
  expect(() => readPlayPosition('4k3/8/8/8/8/8/4R3/4K3 w - - 0 1')).toThrow('not to move is in check')
  expect(() => readPlayPosition('4k3/8/8/8/8/8/8/4K3 w K - 0 1')).toThrow('castling rights')
  expect(() => readPlayPosition('4k3/8/8/4P3/8/8/8/4K3 w - d6 0 1')).toThrow('en passant square')
})

it('keeps the loaded en passant target and captures the passing pawn', () => {
  const game = readPlayPosition(' 4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1 ')
  expect(game.move({ from: 'e5', to: 'd6' }).isEnPassant()).toBe(true)
  expect(game.get('d5')).toBeUndefined()
  expect(game.get('d6')).toEqual({ color: 'w', type: 'p' })
})

it('supports underpromotion and displays draws from loaded positions', () => {
  const promotion = readPlayPosition('7k/P7/8/8/8/8/8/7K w - - 0 1')
  promotion.move({ from: 'a7', to: 'a8', promotion: 'n' })
  expect(promotion.get('a8')).toEqual({ color: 'w', type: 'n' })
  expect(gameLabel(promotion, 'w', 'Stockfish')).toBe('Draw by insufficient material')
  const stalemate = readPlayPosition('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')
  expect(gameLabel(stalemate, 'w', 'Stockfish')).toBe('Draw by stalemate')
})
