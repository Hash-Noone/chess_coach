import { Chess } from 'chess.js'
import { afterEach, expect, it, vi } from 'vitest'
import { stockfishPlayDepth } from './Play'
import type { SearchRequest } from './learned.worker'
import { TrainedEngine } from './trained-engine'

afterEach(() => vi.unstubAllGlobals())

it('sets Stockfish Maximum to depth 18 without changing levels 1–5', () => {
  expect([1, 2, 3, 4, 5, 6].map(stockfishPlayDepth)).toEqual([6, 7, 8, 9, 10, 18])
})

it('gives the trained engine more depth and a bounded search budget only at Maximum', async () => {
  const requests = vi.fn()
  const response = { cp: 0, pv: [] }
  class FakeWorker {
    onmessage?: (message: { data: { result: typeof response } }) => void
    postMessage(request: SearchRequest) {
      requests(request.limits)
      this.onmessage?.({ data: { result: response } })
    }
    terminate() {}
  }
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('document', { baseURI: 'https://example.test/chess-coach/' })
  const engine = new TrainedEngine()
  const game = new Chess()
  for (const level of [1, 2, 3, 4, 5, 6]) await engine.analyze(game, level, true)
  await engine.analyze(game, 6, false)
  expect(requests.mock.calls).toEqual([
    [{ depth: 1, timeMs: 140 }],
    [{ depth: 2, timeMs: 250 }],
    [{ depth: 3, timeMs: 450 }],
    [{ depth: 4, timeMs: 750 }],
    [{ depth: 5, timeMs: 1250 }],
    [{ depth: 8, timeMs: 4000 }],
    [{ depth: 3, timeMs: 450 }],
  ])
  engine.close()
})
