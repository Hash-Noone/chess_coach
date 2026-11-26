import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchChessComGames, fetchLichessGames, library, readGame, savePgn } from './games'

const game = {
  id: 'abcdefgh',
  pgn: '[White "Alice"]\n[Black "Bob"]\n\n1. e4 e5 *',
  createdAt: 1700000000000,
  opening: { name: "King’s Pawn Game" },
}

afterEach(() => vi.unstubAllGlobals())

describe('game import', () => {
  it('replays the entire built-in practice collection', () => {
    for (const item of library) expect(readGame(item.pgn).isCheckmate()).toBe(true)
  })

  it('rejects PGNs with no moves and preserves custom starting positions', () => {
    expect(() => savePgn('*')).toThrow('does not contain any moves')
    const imported = savePgn('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/P7/4K3 w - - 0 1"]\n\n1. a4 *')
    expect(readGame(imported.pgn).history()).toEqual(['a4'])
  })

  it('names the bad token, move number and side without PGN parser jargon', () => {
    expect(() => readGame('1. e4 e5 2. Qz9 *')).toThrow('Move 2 for White, “Qz9”, isn’t a legal move.')
    expect(() => readGame('1. e4 Qz9 *')).toThrow('Move 1 for Black, “Qz9”, isn’t a legal move.')
    expect(() => readGame('1. e4 e5 2. Qa4 *')).toThrow('Move 2 for White, “Qa4”, isn’t a legal move.')
    expect(() => readGame('[Event "Missing quote]')).toThrow('Check the PGN headers and move list')
  })

  it('imports the official anonymous NDJSON export', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(game) + '\n'))
    vi.stubGlobal('fetch', fetch)
    const result = await fetchLichessGames('Alice')
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/games/user/Alice?max=20'), expect.objectContaining({ headers: { Accept: 'application/x-ndjson' } }))
    expect(result).toMatchObject({ latestOnly: false, games: [{ id: 'lichess-abcdefgh', white: 'Alice', black: 'Bob', opening: game.opening.name }] })
  })

  it('falls back to the latest game when the bulk export is unavailable', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(game)))
    vi.stubGlobal('fetch', fetch)
    const result = await fetchLichessGames('Alice')
    expect(fetch.mock.calls[1][0]).toContain('/api/user/Alice/current-game')
    expect(result).toMatchObject({ latestOnly: true, games: [{ id: 'lichess-abcdefgh' }] })
  })
})

describe('Chess.com username import', () => {
  const base = 'https://api.chess.com/pub/player/alice/games/'
  const recent = base + '2026/02'
  const older = base + '2026/01'
  const oldest = base + '2025/12'
  const chessComGame = (id: number) => ({
    url: `https://www.chess.com/game/live/${id}`, pgn: game.pgn, rules: 'chess', end_time: game.createdAt / 1000 + id,
  })

  it('fills the same 20-game limit from newest archives first and preserves the public game link', async () => {
    const latest = chessComGame(30)
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ archives: [oldest, recent, older] }))
      .mockResolvedValueOnce(Response.json({ games: [chessComGame(29), latest, { ...chessComGame(31), rules: 'chess960' }, { ...chessComGame(32), pgn: '' }] }))
      .mockResolvedValueOnce(Response.json({ games: Array.from({ length: 22 }, (_, i) => chessComGame(i + 1)) }))
    vi.stubGlobal('fetch', fetch)

    const games = await fetchChessComGames(' Alice ')
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([base + 'archives', recent, older])
    expect(games).toHaveLength(20)
    expect(games[0]).toMatchObject({
      id: 'chesscom-live-30', source: 'chesscom', url: latest.url, white: 'Alice', black: 'Bob', date: '2023-11-14',
    })
    expect(games[1].id).toBe('chesscom-live-29')
    expect(games[2].id).toBe('chesscom-live-22')
    expect(readGame(games[0].pgn).history()).toEqual(['e4', 'e5'])
  })

  it('returns no games when there are no public archives', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ archives: [] })))
    await expect(fetchChessComGames('alice')).resolves.toEqual([])
  })

  it.each([
    [404, 'Chess.com player not found'],
    [429, 'Chess.com is rate limiting requests'],
    [503, 'Chess.com could not export games right now'],
  ])('shows a friendly error for HTTP %i', async (status, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })))
    await expect(fetchChessComGames('alice')).rejects.toThrow(message)
  })
})
