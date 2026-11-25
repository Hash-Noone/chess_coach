import { Chess } from 'chess.js'
import { loadTrainedEngine } from './learned-assets'
import { openingMove, search, type SearchLimits } from './learned-search'

export type SearchRequest = {
  fen: string
  moves: string[]
  book: boolean
  limits: SearchLimits
  assetBase: string
}

let assets: ReturnType<typeof loadTrainedEngine> | undefined

self.onmessage = async (event: MessageEvent<SearchRequest>) => {
  try {
    const request = event.data
    assets ??= loadTrainedEngine(request.assetBase)
    const { evaluate, book } = await assets
    const game = new Chess(request.fen)
    for (const move of request.moves) game.move(move)
    const bookMove = request.book && request.moves.length < 10 ? openingMove(game, book) : undefined
    const result = bookMove ? { cp: evaluate(game), bestMove: bookMove, pv: [bookMove] } : search(game, evaluate, request.limits)
    self.postMessage({ result })
  } catch (error) {
    self.postMessage({ error: (error as Error).message })
  }
}
