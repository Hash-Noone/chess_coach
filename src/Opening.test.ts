import { Chess, DEFAULT_POSITION } from 'chess.js'
import { expect, it } from 'vitest'
import { openingForPosition, resultPercentages } from './Opening'

it('does not label the starting position or invent a missing opening', () => {
  const opening = { eco: 'A40', name: 'Queen’s Pawn Game' }
  const afterD4 = new Chess().move('d4').after
  expect(openingForPosition(DEFAULT_POSITION, opening)).toBeUndefined()
  expect(openingForPosition(afterD4)).toBeUndefined()
  expect(openingForPosition(afterD4, opening)).toEqual(opening)
})

it('reports win, draw, and loss percentages from White’s perspective', () => {
  expect(resultPercentages({ white: 7, draws: 2, black: 1 })).toEqual(['70.0', '20.0', '10.0'])
  expect(resultPercentages({ white: 0, draws: 0, black: 0 })).toEqual(['0.0', '0.0', '0.0'])
})
