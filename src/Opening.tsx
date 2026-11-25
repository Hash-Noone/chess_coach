import { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'

type BookMove = { san: string; white: number; draws: number; black: number }
type Book = { moves: BookMove[]; opening?: { name: string } | null }
type OpeningData = { fen: string; book?: Book; masters?: boolean; error?: boolean }
let useMasters = false

export function Opening({ fen, gameOpening }: { fen: string; gameOpening?: string }) {
  const [data, setData] = useState<OpeningData>()
  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      try {
        const query = new URLSearchParams({ fen, moves: '4', topGames: '0', recentGames: '0' })
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
  return <section className="panel section-pad opening">
    <div className="section-heading"><BookOpen size={17} /><h3>Opening explorer</h3><span className="badge subtle">{active?.masters ? 'Lichess Masters' : 'Lichess'}</span></div>
    {(active?.book?.opening?.name || gameOpening) && <p className="opening-name">{active?.book?.opening?.name || gameOpening}</p>}
    {!active ? <p className="muted">Looking up this position…</p> : active.error ? <p className="muted">The Lichess opening book is unavailable right now.</p>
      : active.book?.moves.length ? <div className="book-moves">{active.book.moves.map(move => {
        const total = move.white + move.draws + move.black
        return <div className="book-move" key={move.san}><strong>{move.san}</strong>
          <div className="book-bar" aria-label={`White ${move.white} wins, ${move.draws} draws, black ${move.black} wins`}>
            <span style={{ flex: move.white }} /><span style={{ flex: move.draws }} /><span style={{ flex: move.black }} />
          </div><small>{total.toLocaleString()}</small></div>
      })}</div> : <p className="muted">No book moves found for this position.</p>}
  </section>
}
