import { useState, type FormEvent } from 'react'
import { ArrowRight, BookOpen, Download, FileText, Globe2, LibraryBig } from 'lucide-react'
import { fetchChessComGames, fetchLichessGames, gameSites, library, savePgn, type GameSite, type SavedGame } from './games'

export function Library({ saved, onSave, onOpen }: {
  saved: SavedGame[]
  onSave: (games: SavedGame[]) => void
  onOpen: (game: SavedGame) => void
}) {
  const [username, setUsername] = useState('')
  const [site, setSite] = useState<GameSite>('lichess')
  const [pgn, setPgn] = useState('')
  const [loading, setLoading] = useState(false)
  const [remoteStatus, setRemoteStatus] = useState<{ text: string; error?: boolean }>()
  const [pgnError, setPgnError] = useState('')

  const siteName = gameSites[site]

  async function importPlayer(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setRemoteStatus(undefined)
    try {
      const { games, latestOnly } = site === 'lichess'
        ? await fetchLichessGames(username)
        : { games: await fetchChessComGames(username), latestOnly: false }
      if (games.length === 0) {
        setRemoteStatus({ text: 'No standard chess games were found for this player.' })
        return
      }
      onSave(games)
      setRemoteStatus({ text: latestOnly ? 'Added the latest game. Lichess did not return a full game export.' : `Loaded ${games.length} ${games.length === 1 ? 'game' : 'games'} into your library.` })
    } catch (error) {
      setRemoteStatus({ text: error instanceof TypeError ? `Could not reach ${siteName}. Check your connection or paste a PGN.` : (error as Error).message, error: true })
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
          <small>{[
            game.source === 'lichess' || game.source === 'chesscom' ? gameSites[game.source] : game.source === 'engine' ? 'Engine match' : game.source === 'pgn' ? 'Imported PGN' : undefined,
            game.opening, game.date && !game.date.includes('?') ? game.date.slice(0, 10) : undefined,
          ].filter(Boolean).join(' · ')}</small></span>
        <span className="badge subtle">{game.result === '*' ? 'Ongoing' : game.result}</span><ArrowRight size={16} />
      </button>)}</div>
  }

  return <div className="library-layout">
    <div className="side-stack">
      <form className="panel section-pad" onSubmit={importPlayer}>
        <div className="eyebrow"><Globe2 size={16} /> USERNAME IMPORT</div>
        <h2>Find a player’s games</h2>
        <p className="muted">Add recent public games from Lichess or Chess.com. No account or API key required.</p>
        <label className="field-label" htmlFor="game-site">Game source</label>
        <select id="game-site" value={site} disabled={loading} onChange={event => {
          setSite(event.target.value === 'chesscom' ? 'chesscom' : 'lichess')
          setRemoteStatus(undefined)
        }}>
          <option value="lichess">Lichess</option>
          <option value="chesscom">Chess.com</option>
        </select>
        <label className="field-label" htmlFor="game-username">{siteName} username</label>
        <input id="game-username" value={username} placeholder={site === 'lichess' ? 'e.g. DrNykterstein' : 'e.g. hikaru'} onChange={event => setUsername(event.target.value)} required />
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
