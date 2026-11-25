import { decodeModel } from './learned-evaluation'
import type { Book } from './learned-search'

export type TrainingStats = {
  evaluationTrainingPositions: number
  validationPositions: number
  gameTrainingPositions: number
  games: number
  validationMaeCp: number
  materialMaeCp: number
  validationWithinOnePawn: number
  gameArchiveMonth: string
}

async function asset(name: string, base = new URL(import.meta.env.BASE_URL, self.location.href).href) {
  const url = new URL(`lichess-engine/${name}`, base)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not load the trained engine’s ${name}.`)
  return response
}

export async function loadTrainedStats(): Promise<TrainingStats> {
  return (await asset('manifest.json')).json()
}

export async function loadTrainedEngine(base: string) {
  const [weights, book] = await Promise.all([
    asset('model.bin', base).then(result => result.arrayBuffer()),
    asset('book.json', base).then(result => result.json() as Promise<Book>),
  ])
  return { evaluate: decodeModel(weights), book }
}
