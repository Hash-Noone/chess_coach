import { useEffect, useState } from 'react'
import { ChevronRight, Crown, Database, Github, Sparkles, Swords } from 'lucide-react'
import { Analysis, initialReview, type ReviewState } from './Analysis'
import type { CoachLevel } from './coach'
import { library, loadSavedGames, storeGames, type SavedGame } from './games'
import { Library } from './Library'
import { loadCoachSettings, storeCoachSettings, type CoachConnection } from './llm'
import { Play } from './Play'
import { readRoute, routeHash, type Route, type Mode } from './routes'

const modes = [
  { id: 'play', name: 'Play', icon: Swords, title: 'Play the engine', subtitle: 'Train against a Lichess-trained opponent or take on Stockfish.' },
  { id: 'library', name: 'Game library', icon: Database, title: 'Game library', subtitle: 'Bring in your games or study a classic from the practice collection.' },
  { id: 'coach', name: 'AI coach', icon: Sparkles, title: 'Review a game', subtitle: 'See why moves worked, where things changed, and what to practice.' },
] as const
export function App() {
  const [route, setRoute] = useState(() => readRoute(window.location.hash))
  const { mode } = route
  const [saved, setSaved] = useState(loadSavedGames)
  const [lastGameId, setLastGameId] = useState<string>()
  const [storageError, setStorageError] = useState(false)
  const [coachSettings, setCoachSettings] = useState(loadCoachSettings)
  const [connection, setConnection] = useState<CoachConnection>()
  const [coachLevel, setCoachLevel] = useState<CoachLevel>('beginner')
  const [reviews, setReviews] = useState<Record<string, ReviewState>>({})
  const page = modes.find(item => item.id === mode)!
  const gameId = (route.mode === 'coach' ? route.gameId : undefined) ?? lastGameId
  const selected = saved.find(game => game.id === gameId) ?? library.find(game => game.id === gameId) ?? library[0]

  useEffect(() => {
    window.scrollTo(0, 0)
    if (mode === 'coach') setLastGameId(selected.id)
  }, [mode, selected.id])

  useEffect(() => {
    const syncRoute = () => setRoute(readRoute(window.location.hash))
    window.addEventListener('hashchange', syncRoute)
    return () => window.removeEventListener('hashchange', syncRoute)
  }, [])

  function navigate(next: Route) {
    const hash = routeHash(next)
    if (window.location.hash !== hash) window.location.hash = hash
    setRoute(next)
  }

  function tab(next: Mode) {
    if (next === mode) return
    navigate(next === 'coach' ? { mode: next, gameId: selected.id } : { mode: next })
  }

  function persist(games: SavedGame[]) {
    setSaved(old => {
      const incoming = new Set(games.map(game => game.id))
      const next = [...games, ...old.filter(game => !incoming.has(game.id))]
      try { storeGames(next) } catch { setStorageError(true) }
      return next
    })
  }

  function open(game: SavedGame) {
    navigate({ mode: 'coach', gameId: game.id })
  }

  return <>
    <header className="topbar"><div className="topbar-inner">
      <button className="brand" onClick={() => tab('play')} aria-label="Chess Coach home"><span className="brand-icon"><Crown size={24} /></span><span>Chess<span className="brand-accent">Coach</span><small>THE TRAINING ROOM</small></span></button>
      <nav aria-label="Main navigation">{modes.map(({ id, name, icon: Icon }) =>
        <button key={id} className={mode === id ? 'active' : ''} aria-current={mode === id ? 'page' : undefined} onClick={() => tab(id)}><Icon size={17} /> <span>{name}</span></button>
      )}</nav>
      <span className="top-status"><span className="status-dot" /> Local engine</span>
    </div></header>
    <main>
      <div className="page-head">
        <div><div className="eyebrow page-eyebrow">CHESS STUDIO <ChevronRight size={12} /> {page.name.toUpperCase()}</div><h1>{page.title}</h1><p>{page.subtitle}</p></div>
        <div className="page-decoration" aria-hidden="true">♞</div>
      </div>
      {storageError && <p className="notice error" role="alert">This browser could not save games to local storage. Games will be kept until you close the page.</p>}
      <div hidden={mode !== 'play'}><Play active={mode === 'play'} onReview={game => { persist([game]); open(game) }} /></div>
      <div hidden={mode !== 'library'}><Library saved={saved} onSave={persist} onOpen={open} /></div>
      {(lastGameId || mode === 'coach') && <div hidden={mode !== 'coach'}><Analysis key={selected.id} active={mode === 'coach'} selected={selected} onLibrary={() => tab('library')}
        state={reviews[selected.id] ?? initialReview} update={apply => setReviews(old => ({
          ...old, [selected.id]: apply(old[selected.id] ?? initialReview),
        }))} level={coachLevel} onLevel={setCoachLevel}
        settings={coachSettings} connection={connection} onConnect={next => {
          const { provider, baseUrl, model } = next
          const settings = { provider, baseUrl, model }
          try { storeCoachSettings(settings) } catch { /* The connection still works for this tab. */ }
          setCoachSettings(settings)
          setConnection(next)
        }} onDisconnect={() => setConnection(undefined)} /></div>}
      <footer><span>ChessCoach <span className="footer-divider">·</span> Stockfish analysis and Lichess game data</span><a href="https://github.com/Hash-Noone/chess_coach" target="_blank" rel="noopener"><Github size={15} /> Source</a></footer>
    </main>
  </>
}
