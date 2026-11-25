import type { Chess } from 'chess.js'

export type Evaluation = { cp: number; mate?: number; bestMove?: string; pv: string[] }

export class Stockfish {
  private worker = new Worker(`${import.meta.env.BASE_URL}engine/stockfish-18-lite-single.js`)
  private pending?: (error: Error) => void
  private ready: Promise<void>
  private closed = false

  constructor() {
    this.ready = this.command('uci', line => line === 'uciok' ? true : undefined)
      .then(() => this.command('isready', line => line === 'readyok' ? true : undefined))
      .then(() => undefined)
  }

  private command<T>(input: string, read: (line: string) => T | undefined): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.closed || this.pending) {
        reject(new Error(this.closed ? 'Engine stopped.' : 'Engine is already searching.'))
        return
      }
      const clean = () => {
        clearTimeout(timer)
        this.pending = undefined
        this.worker.onmessage = null
        this.worker.onerror = null
      }
      const fail = (error: Error) => { clean(); reject(error) }
      const timer = setTimeout(() => fail(new Error('Stockfish timed out. Please try again.')), 25000)
      this.pending = fail
      this.worker.onerror = () => fail(new Error('Stockfish could not load or stopped unexpectedly.'))
      this.worker.onmessage = ({ data }) => {
        for (const line of String(data).trim().split('\n')) {
          const result = read(line.trim())
          if (result !== undefined) {
            clean()
            resolve(result)
            break
          }
        }
      }
      this.worker.postMessage(input)
    })
  }

  async analyze(game: Chess, depth: number, skill = 20): Promise<Evaluation> {
    await this.ready
    if (this.closed) throw new Error('Engine stopped.')
    if (game.isGameOver()) return game.isCheckmate()
      ? { cp: game.turn() === 'w' ? -10000 : 10000, mate: 0, pv: [] }
      : { cp: 0, pv: [] }
    const history = game.history({ verbose: true })
    const moves = history.map(move => move.lan).join(' ')
    const position = history.length ? `${history[0].before} moves ${moves}` : game.fen()
    this.worker.postMessage(`setoption name Skill Level value ${skill}`)
    this.worker.postMessage(`position fen ${position}`)
    const sign = game.turn() === 'w' ? 1 : -1
    let evaluation: Evaluation = { cp: 0, pv: [] }
    return this.command(`go depth ${depth}`, line => {
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
    })
  }

  close() {
    this.closed = true
    this.pending?.(new Error('Engine stopped.'))
    this.worker.terminate()
  }
}

export function coordinateMove(uci: string) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }
}
