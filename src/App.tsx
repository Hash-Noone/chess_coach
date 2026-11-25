import { useState } from 'react'
import { ChevronRight, Crown, Database, Github, Sparkles, Swords } from 'lucide-react'
import { Analysis } from './Analysis'
import { library, loadSavedGames, storeGames, type SavedGame } from './games'
import { Library } from './Library'
import { Play } from './Play'

const modes = [
  { id: 'play', name: 'Play', icon: Swords, title: 'Play the engine', subtitle: 'Sharpen your game against Stockfish, on your terms.' },
  { id: 'library', name: 'Game library', icon: Database, title: 'Game library', subtitle: 'Bring in your games or study a classic from the practice collection.' },
  { id: 'coach', name: 'AI coach', icon: Sparkles, title: 'Review a game', subtitle: 'See why moves worked, where things changed, and what to practice.' },
] as const
type Mode = typeof modes[number]['id']

export function App() {
  const [mode, setMode] = useState<Mode>('play')
  const [saved, setSaved] = useState(loadSavedGames)
  const [selected, setSelected] = useState<SavedGame>(library[0])
  const [storageError, setStorageError] = useState(false)
  const page = modes.find(item => item.id === mode)!

  function persist(games: SavedGame[]) {
    setSaved(old => {
      const incoming = new Set(games.map(game => game.id))
      const next = [...games, ...old.filter(game => !incoming.has(game.id))]
      try { storeGames(next) } catch { setStorageError(true) }
      return next
    })
  }

  function open(game: SavedGame) {
    setSelected(game)
    setMode('coach')
  }

  return <>
    <header className="topbar"><div className="topbar-inner">
      <button className="brand" onClick={() => setMode('play')} aria-label="Chess Coach home"><span className="brand-icon"><Crown size={24} /></span><span>Chess<span className="brand-accent">Coach</span><small>THE TRAINING ROOM</small></span></button>
      <nav aria-label="Main navigation">{modes.map(({ id, name, icon: Icon }) =>
        <button key={id} className={mode === id ? 'active' : ''} aria-current={mode === id ? 'page' : undefined} onClick={() => setMode(id)}><Icon size={17} /> <span>{name}</span></button>
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
      {mode === 'coach' && <Analysis key={selected.id} selected={selected} onLibrary={() => setMode('library')} />}
      <footer><span>ChessCoach <span className="footer-divider">·</span> Stockfish analysis and Lichess game data</span><a href="https://github.com/Hash-Noone/chess-coach" target="_blank" rel="noreferrer"><Github size={15} /> Source</a></footer>
    </main>
  </>
}
