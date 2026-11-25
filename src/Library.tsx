import { useState, type FormEvent } from 'react'
import { ArrowRight, BookOpen, Download, FileText, Globe2, LibraryBig } from 'lucide-react'
import { fetchLichessGames, library, savePgn, type SavedGame } from './games'

export function Library({ saved, onSave, onOpen }: {
  saved: SavedGame[]
  onSave: (games: SavedGame[]) => void
  onOpen: (game: SavedGame) => void
}) {
  const [username, setUsername] = useState('')
  const [pgn, setPgn] = useState('')
  const [loading, setLoading] = useState(false)
  const [remoteStatus, setRemoteStatus] = useState<{ text: string; error?: boolean }>()
  const [pgnError, setPgnError] = useState('')

  async function importLichess(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setRemoteStatus(undefined)
    try {
      const { games, latestOnly } = await fetchLichessGames(username)
      if (games.length === 0) {
        setRemoteStatus({ text: 'No standard chess games were found for this player.' })
        return
      }
      onSave(games)
      setRemoteStatus({ text: latestOnly ? 'Added the latest game. Lichess did not return a full game export.' : `Loaded ${games.length} ${games.length === 1 ? 'game' : 'games'} into your library.` })
    } catch (error) {
      setRemoteStatus({ text: error instanceof TypeError ? 'Could not reach Lichess. Check your connection or paste a PGN.' : (error as Error).message, error: true })
    } finally {
      setLoading(false)
    }
  }

  function importPgn(event: FormEvent) {
    event.preventDefault()
    setPgnError('')
    try {
      const game = savePgn(pgn)
      onSave([game])
      onOpen(game)
      setPgn('')
    } catch (error) { setPgnError(`Could not import PGN: ${(error as Error).message}`) }
  }

  function cards(games: SavedGame[]) {
    return <div className="library-list">{games.map(game =>
      <button className="library-game" key={game.id} onClick={() => onOpen(game)}>
        <span className="game-icon"><FileText size={19} /></span>
        <span className="game-info"><strong>{game.id === 'fools-mate' ? 'Fool’s Mate' : `${game.white} vs. ${game.black}`}</strong>
          <small>{game.opening ?? (game.source === 'engine' ? 'Engine match' : game.source === 'lichess' ? 'Lichess' : 'Imported PGN')}{game.date && !game.date.includes('?') ? ` · ${game.date.slice(0, 10)}` : ''}</small></span>
        <span className="badge subtle">{game.result === '*' ? 'Ongoing' : game.result}</span><ArrowRight size={16} />
      </button>)}</div>
  }

  return <div className="library-layout">
    <div className="side-stack">
      <form className="panel section-pad" onSubmit={importLichess}>
        <div className="eyebrow"><Globe2 size={16} /> LICHESS IMPORT</div>
        <h2>Find a player’s games</h2>
        <p className="muted">Add recent public games from Lichess. No account or API key required.</p>
        <label className="field-label" htmlFor="lichess-username">Lichess username</label>
        <input id="lichess-username" value={username} placeholder="e.g. DrNykterstein" onChange={event => setUsername(event.target.value)} required />
        <button className="button primary full" disabled={loading}><Download size={16} /> {loading ? 'Fetching games…' : 'Import games'}</button>
        {remoteStatus && <p className={`notice ${remoteStatus.error ? 'error' : ''}`} role="status">{remoteStatus.text}</p>}
      </form>
      <form className="panel section-pad" onSubmit={importPgn}>
        <div className="eyebrow"><FileText size={15} /> PGN IMPORT</div>
        <h2>Paste a game</h2>
        <label className="field-label" htmlFor="pgn">Game PGN</label>
        <textarea id="pgn" value={pgn} rows={4} placeholder="1. e4 e5 2. Nf3 Nc6 …" onChange={event => setPgn(event.target.value)} required />
        <button className="button secondary full"><ArrowRight size={16} /> Import & review</button>
        {pgnError && <p className="notice error" role="alert">{pgnError}</p>}
      </form>
    </div>
    <div className="side-stack">
      <section className="panel section-pad">
        <div className="section-heading"><LibraryBig size={18} /><h3>Saved games</h3><span className="badge subtle">{saved.length}</span></div>
        {saved.length ? cards(saved) : <p className="empty-moves">Your imported games and reviewed engine matches will appear here.</p>}
      </section>
      <section className="panel section-pad">
        <div className="section-heading"><BookOpen size={18} /><h3>Practice collection</h3></div>
        <p className="muted">Study a classic attack or a quick checkmate.</p>
        {cards(library)}
      </section>
    </div>
  </div>
}
