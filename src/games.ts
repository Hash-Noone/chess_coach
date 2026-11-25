import { Chess } from 'chess.js'

export type SavedGame = {
  id: string
  white: string
  black: string
  result: string
  pgn: string
  source: 'library' | 'lichess' | 'pgn' | 'engine'
  opening?: string
  date?: string
  url?: string
}

const storageKey = 'chess-coach-games-v1'

function illegalPgnMove(game: Chess, move: string) {
  return new Error(`Move ${game.moveNumber()} for ${game.turn() === 'w' ? 'White' : 'Black'}, “${move}”, isn’t a legal move.`)
}

function loadPgn(game: Chess, pgn: string) {
  try {
    game.loadPgn(pgn)
  } catch (error) {
    const reason = error as Error & { location?: { start: { offset: number } } }
    const illegal = /^Invalid move in PGN: (.+)$/.exec(reason.message)
    if (illegal) throw illegalPgnMove(game, illegal[1])
    const offset = reason.location?.start.offset
    if (offset !== undefined) {
      const before = pgn.slice(0, offset)
      const left = /[\w=+#-]*$/.exec(before)?.[0] ?? ''
      const right = /^[\w=+#-]+/.exec(pgn.slice(offset))?.[0]
      if (right) {
        const prefix = new Chess()
        try {
          prefix.loadPgn(before.slice(0, before.length - left.length).replace(/\d+\.{1,3}\s*$/, ''))
        } catch {
          throw new Error('Check the PGN headers and move list, then try again.')
        }
        throw illegalPgnMove(prefix, left + right)
      }
    }
    throw new Error('Check the PGN headers and move list, then try again.')
  }
}

export function readGame(pgn: string) {
  const game = new Chess()
  loadPgn(game, pgn.trim())
  if (!game.history().length) throw new Error('This PGN does not contain any moves.')
  const variant = game.getHeaders().Variant
  if (variant && !/^(standard|from position)$/i.test(variant)) throw new Error('Only standard chess games are supported.')
  return game
}

export function savePgn(pgn: string, source: SavedGame['source'] = 'pgn'): SavedGame {
  const game = readGame(pgn)
  const tags = game.getHeaders()
  return {
    id: crypto.randomUUID(),
    white: tags.White && tags.White !== '?' ? tags.White : 'White',
    black: tags.Black && tags.Black !== '?' ? tags.Black : 'Black',
    result: tags.Result || '*',
    opening: tags.Opening,
    date: tags.Date?.replaceAll('.', '-'),
    pgn: game.pgn(),
    source,
  }
}

export const library: SavedGame[] = [
  {
    id: 'opera', white: 'Paul Morphy', black: 'Duke of Brunswick & Count Isouard',
    result: '1-0', source: 'library', date: '1858-01-01', opening: 'Philidor Defense',
    pgn: `[Event "Opera Game"]
[White "Paul Morphy"]
[Black "Duke of Brunswick & Count Isouard"]
[Result "1-0"]
[Opening "Philidor Defense"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6
7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7
12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`,
  },
  {
    id: 'fools-mate', white: 'White', black: 'Black', result: '0-1', source: 'library',
    opening: "Fool's Mate",
    pgn: `[Event "Fool's Mate"]
[Result "0-1"]
[Opening "Fool's Mate"]

1. f3 e5 2. g4 Qh4# 0-1`,
  },
]

export function loadSavedGames(): SavedGame[] {
  try {
    const items: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]')
    return Array.isArray(items) ? items.filter(item => item && typeof item.id === 'string' && typeof item.pgn === 'string') : []
  } catch {
    return []
  }
}

export function storeGames(games: SavedGame[]) {
  localStorage.setItem(storageKey, JSON.stringify(games))
}

type LichessGame = { id: string; pgn?: string; opening?: { name: string }; createdAt: number }

function fromLichess(item: LichessGame): SavedGame | undefined {
  if (!item.pgn || !item.id) return
  try {
    const game = savePgn(item.pgn, 'lichess')
    return {
      ...game, id: `lichess-${item.id}`, opening: item.opening?.name || game.opening,
      date: new Date(item.createdAt).toISOString().slice(0, 10),
      url: `https://lichess.org/${item.id}`,
    }
  } catch {
    return
  }
}

export async function fetchLichessGames(username: string, signal?: AbortSignal) {
  const user = username.trim()
  if (!/^[a-z0-9_-]{2,30}$/i.test(user)) throw new Error('Enter a valid Lichess username.')
  const query = new URLSearchParams({ max: '20', pgnInJson: 'true', opening: 'true', variant: 'standard' })
  const response = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(user)}?${query}`, {
    headers: { Accept: 'application/x-ndjson' }, signal,
  })
  if (response.status === 404) {
    const latest = await fetch(`https://lichess.org/api/user/${encodeURIComponent(user)}/current-game?pgnInJson=true&opening=true`, {
      headers: { Accept: 'application/json' }, signal,
    })
    if (latest.status === 429) throw new Error('Lichess is rate limiting requests. Wait a minute before trying again.')
    if (!latest.ok) throw new Error('Lichess did not provide a public game. Check the username or paste a PGN instead.')
    const game = fromLichess(await latest.json())
    return { games: game ? [game] : [], latestOnly: true }
  }
  if (response.status === 429) throw new Error('Lichess is rate limiting requests. Wait a minute before trying again.')
  if (!response.ok) throw new Error('Lichess could not export games right now. Try again or paste a PGN.')
  const games: SavedGame[] = []
  for (const line of (await response.text()).split('\n')) {
    if (!line.trim()) continue
    const game = fromLichess(JSON.parse(line))
    if (game) games.push(game)
  }
  return { games, latestOnly: false }
}
