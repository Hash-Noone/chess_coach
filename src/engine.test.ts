import { Chess } from 'chess.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Stockfish } from './engine'

class FakeWorker {
  static workers: FakeWorker[] = []
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onmessageerror: (() => void) | null = null
  commands: string[] = []
  terminate = vi.fn()

  constructor(public url: URL) { FakeWorker.workers.push(this) }
  postMessage(command: string) { this.commands.push(command) }
  emit(data: string) { this.onmessage?.({ data }) }
}

beforeEach(() => {
  FakeWorker.workers = []
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  vi.stubGlobal('document', { baseURI: 'https://example.test/chess-coach/' })
  vi.stubGlobal('Worker', FakeWorker)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function ready(worker: FakeWorker) {
  worker.emit('uciok')
  await vi.advanceTimersByTimeAsync(0)
  worker.emit('readyok')
  await vi.advanceTimersByTimeAsync(0)
}

describe('Stockfish worker lifecycle', () => {
  it('waits past the old timeout for WASM and runs queued positions in order', async () => {
    const phase = vi.fn()
    const game = new Chess()
    const engine = new Stockfish(phase)
    const first = engine.analyze(game, 12)
    game.move('e4')
    const second = engine.analyze(game, 5)
    game.move('e5')
    await vi.advanceTimersByTimeAsync(30000)
    const [worker] = FakeWorker.workers
    expect(worker.url.pathname).toMatch(/\/engine\/stockfish-18-lite-single\.js$/)
    expect(worker.commands).toEqual(['uci'])
    expect(phase.mock.calls).toEqual([['loading']])
    await ready(worker)
    expect(worker.commands.at(-2)).not.toContain('moves')
    expect(worker.commands.at(-1)).toBe('go depth 12')
    worker.emit('bestmove e2e4')
    await expect(first).resolves.toMatchObject({ bestMove: 'e2e4' })
    expect(worker.commands.at(-2)).toContain('moves e2e4')
    expect(worker.commands.at(-1)).toBe('go depth 5')
    worker.emit('bestmove e7e5')
    await expect(second).resolves.toMatchObject({ bestMove: 'e7e5' })
    expect(FakeWorker.workers).toHaveLength(1)
    engine.close()
  })

  it('terminates a timed-out worker and retries once before accepting subsequent positions', async () => {
    const engine = new Stockfish()
    const result = engine.analyze(new Chess(), 12)
    const failed = expect(result).rejects.toThrow('stopped unexpectedly')
    const next = engine.analyze(new Chess(), 5)
    await vi.advanceTimersByTimeAsync(0)
    const [first] = FakeWorker.workers
    await ready(first)
    await vi.advanceTimersByTimeAsync(41000)
    expect(first.terminate).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(first.terminate).toHaveBeenCalledOnce()
    const [, retry] = FakeWorker.workers
    retry.onerror?.()
    await failed
    expect(retry.terminate).toHaveBeenCalledOnce()
    const [, , recovered] = FakeWorker.workers
    await ready(recovered)
    recovered.emit('bestmove d2d4')
    await expect(next).resolves.toMatchObject({ bestMove: 'd2d4' })
    engine.close()
  })
})
