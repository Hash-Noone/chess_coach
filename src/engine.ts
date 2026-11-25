import type { Chess } from 'chess.js'

export type Evaluation = { cp: number; mate?: number; bestMove?: string; pv: string[] }
export type EnginePhase = 'loading' | 'searching'
const startupTimeout = 90000

export class Stockfish {
  private worker?: Worker
  private pending?: (error: Error) => void
  private queue = Promise.resolve()
  private closed = false

  constructor(private onPhase?: (phase: EnginePhase) => void) {}

  private command<T>(worker: Worker, input: string, read: (line: string) => T | undefined, timeout: number, timeoutMessage: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const clean = () => {
        clearTimeout(timer)
        this.pending = undefined
        worker.onmessage = null
        worker.onerror = null
        worker.onmessageerror = null
      }
      const fail = (error: Error) => { clean(); reject(error) }
      const timer = setTimeout(() => fail(new Error(timeoutMessage)), timeout)
      this.pending = fail
      worker.onerror = () => fail(new Error('Stockfish could not load or stopped unexpectedly.'))
      worker.onmessageerror = () => fail(new Error('Stockfish returned an unreadable response.'))
      worker.onmessage = ({ data }) => {
        for (const line of String(data).trim().split('\n')) {
          const result = read(line.trim())
          if (result !== undefined) {
            clean()
            resolve(result)
            break
          }
        }
      }
      try { worker.postMessage(input) } catch (error) { fail(error as Error) }
    })
  }

  private async start() {
    this.onPhase?.('loading')
    const base = new URL(import.meta.env.BASE_URL, document.baseURI)
    const worker = new Worker(new URL('engine/stockfish-18-lite-single.js', base))
    this.worker = worker
    const deadline = performance.now() + startupTimeout
    const message = 'Stockfish took too long to load. Check your connection and try again.'
    await this.command(worker, 'uci', line => line === 'uciok' ? true : undefined, startupTimeout, message)
    if (this.closed) throw new Error('Engine stopped.')
    await this.command(worker, 'isready', line => line === 'readyok' ? true : undefined, Math.max(0, deadline - performance.now()), message)
    return worker
  }

  analyze(game: Chess, depth: number, skill = 20): Promise<Evaluation> {
    const terminal: Evaluation | undefined = !game.isGameOver() ? undefined : game.isCheckmate()
      ? { cp: game.turn() === 'w' ? -10000 : 10000, mate: 0, pv: [] }
      : { cp: 0, pv: [] }
    const history = game.history({ verbose: true })
    const moves = history.map(move => move.lan).join(' ')
    const position = history.length ? `${history[0].before} moves ${moves}` : game.fen()
    const sign = game.turn() === 'w' ? 1 : -1
    const result = this.queue.then(async () => {
      if (this.closed) throw new Error('Engine stopped.')
      if (terminal) return terminal
      for (let attempt = 0; ; attempt++) {
        try {
          const worker = this.worker ?? await this.start()
          if (this.closed) throw new Error('Engine stopped.')
          this.onPhase?.('searching')
          return await this.search(worker, position, sign, depth, skill)
        } catch (error) {
          this.terminate()
          if (this.closed || attempt === 1) throw error
        }
      }
    })
    this.queue = result.then(() => {}, () => {})
    return result
  }

  private search(worker: Worker, position: string, sign: number, depth: number, skill: number) {
    worker.postMessage(`setoption name Skill Level value ${skill}`)
    worker.postMessage(`position fen ${position}`)
    let evaluation: Evaluation = { cp: 0, pv: [] }
    return this.command(worker, `go depth ${depth}`, line => {
      const score = line.startsWith('info ') && line.match(/\bscore (cp|mate) (-?\d+)/)
      const pv = line.match(/\bpv (.+)$/)
      if (score && pv && !/\b(?:lowerbound|upperbound)\b|\bmultipv (?!1\b)\d+/.test(line)) {
        const value = Number(score[2]) * sign
        evaluation = {
          cp: score[1] === 'mate' ? Math.sign(value) * 10000 : value,
          mate: score[1] === 'mate' ? value : undefined,
          pv: pv[1].split(/\s+/),
        }
      }
      const best = line.match(/^bestmove ([a-h][1-8][a-h][1-8][qrbn]?)/)
      if (line.startsWith('bestmove ')) return { ...evaluation, bestMove: best?.[1] }
    }, Math.max(15000, depth * 3500), 'Stockfish search timed out. Please try again.')
  }

  private terminate() {
    this.worker?.terminate()
    this.worker = undefined
  }

  close() {
    this.closed = true
    this.pending?.(new Error('Engine stopped.'))
    this.terminate()
  }
}

export function coordinateMove(uci: string) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }
}
