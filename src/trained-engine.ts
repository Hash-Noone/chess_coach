import type { Chess } from 'chess.js'
import type { Evaluation } from './engine'
import type { SearchRequest } from './learned.worker'

const depth = [1, 2, 3, 4, 5, 8]
const time = [140, 250, 450, 750, 1250, 4000]

export class TrainedEngine {
  private worker = new Worker(new URL('./learned.worker.ts', import.meta.url), { type: 'module' })
  private reject?: (error: Error) => void

  analyze(game: Chess, level: number, play: boolean): Promise<Evaluation> {
    return new Promise((resolve, reject) => {
      const finish = () => { clearTimeout(timer); this.reject = undefined }
      const fail = (error: Error) => { finish(); reject(error) }
      this.reject = fail
      const timer = setTimeout(() => fail(new Error('Trained engine timed out. Please try again.')), 15000)
      this.worker.onerror = () => fail(new Error('The trained engine could not load.'))
      this.worker.onmessage = ({ data }) => {
        if (data.error) fail(new Error(data.error))
        else { finish(); resolve(data.result) }
      }
      const history = game.history({ verbose: true })
      const strength = play ? level - 1 : 2
      const request: SearchRequest = {
        fen: history[0]?.before ?? game.fen(),
        moves: history.map(move => move.lan),
        book: play,
        limits: { depth: depth[strength], timeMs: time[strength] },
        assetBase: new URL(import.meta.env.BASE_URL, document.baseURI).href,
      }
      this.worker.postMessage(request)
    })
  }

  close() {
    this.worker.terminate()
    this.reject?.(new Error('Engine stopped.'))
  }
}
