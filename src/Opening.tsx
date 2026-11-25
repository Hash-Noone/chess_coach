import { useEffect, useState } from 'react'
import { DEFAULT_POSITION } from 'chess.js'
import { BookOpen } from 'lucide-react'

type BookOpening = { name: string; eco: string }
type BookMove = { uci: string; san: string; white: number; draws: number; black: number; opening?: BookOpening | null }
type Book = { moves: BookMove[]; opening?: BookOpening | null }
type OpeningData = { fen: string; book?: Book; masters?: boolean; error?: boolean }
let useMasters = false

export function openingForPosition(fen: string, opening?: BookOpening | null) {
  return fen.split(' ', 4).join(' ') === DEFAULT_POSITION.split(' ', 4).join(' ') ? undefined : opening
}

export function resultPercentages({ white, draws, black }: Pick<BookMove, 'white' | 'draws' | 'black'>) {
  const total = white + draws + black
  return [white, draws, black].map(count => total ? (100 * count / total).toFixed(1) : '0.0')
}

export function Opening({ fen, onMove }: { fen: string; onMove?: (uci: string) => void }) {
  const [data, setData] = useState<OpeningData>()
  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      try {
        const query = new URLSearchParams({ fen, moves: '8', topGames: '0', recentGames: '0' })
        let response = await fetch(`https://explorer.lichess.org/${useMasters ? 'masters' : 'lichess'}?${query}`, { signal: controller.signal })
        if (!useMasters && [401, 403, 404].includes(response.status)) {
          useMasters = true
          response = await fetch(`https://explorer.lichess.org/masters?${query}`, { signal: controller.signal })
        }
        if (!response.ok) throw new Error('Opening Explorer unavailable')
        const book: Book = await response.json()
        if (!controller.signal.aborted) setData({ fen, book, masters: useMasters })
      } catch {
        if (!controller.signal.aborted) setData({ fen, error: true })
      }
    }, 350)
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [fen])

  const active = data?.fen === fen ? data : undefined
  const opening = openingForPosition(fen, active?.book?.opening)
  return <section className="panel section-pad opening">
    <div className="section-heading"><BookOpen size={17} /><h3>Opening explorer</h3><span className="badge subtle">{active?.masters ? 'Lichess Masters' : 'Lichess'}</span></div>
    {opening && <p className="opening-name">{opening.eco} · {opening.name}</p>}
    {!active ? <p className="muted">Looking up this position…</p> : active.error ? <p className="muted">The Lichess opening book is unavailable right now.</p>
      : active.book?.moves.length ? <>
        <p className="muted book-legend">Results for White: W wins · D draws · L losses</p>
        <div className="book-moves">{active.book.moves.map(move => {
          const total = move.white + move.draws + move.black
          const [win, draw, loss] = resultPercentages(move)
          return <button className="book-move" key={move.uci} type="button" disabled={!onMove} onClick={() => onMove?.(move.uci)}>
            <span><strong>{move.san}</strong> {move.opening && <small>{move.opening.eco}</small>}</span>
            <small>{total.toLocaleString()} games</small>
            <span className="book-results">
              <span className="book-bar" aria-hidden="true">
                <span style={{ flex: move.white }} /><span style={{ flex: move.draws }} /><span style={{ flex: move.black }} />
              </span>
              <span>W {win}% · D {draw}% · L {loss}%</span>
            </span>
          </button>
        })}</div></> : <p className="muted">No book moves found for this position.</p>}
  </section>
}
