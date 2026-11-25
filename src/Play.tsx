import { useEffect, useState } from 'react'
import { Chess, type Color } from 'chess.js'
import { Activity, Cpu, RotateCcw, Sparkles, Swords, Undo2 } from 'lucide-react'
import { Board, gameLabel, MoveTable } from './Board'
import { coordinateMove, Stockfish, type Evaluation } from './engine'
import { savePgn, type SavedGame } from './games'

function copyGame(game: Chess, keep = game.history().length) {
  const moves = game.history({ verbose: true })
  const copy = new Chess(moves[0]?.before || game.fen())
  for (const move of moves.slice(0, keep)) copy.move(move)
  return copy
}

export function Play({ active, onReview }: { active: boolean; onReview: (game: SavedGame) => void }) {
  const [game, setGame] = useState(() => new Chess())
  const [human, setHuman] = useState<Color>('w')
  const [orientation, setOrientation] = useState<Color>('w')
  const [skill, setSkill] = useState(4)
  const [evaluated, setEvaluated] = useState<{ fen: string; value: Evaluation }>()
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [canStart, setCanStart] = useState(false)

  useEffect(() => {
    if (!active || !canStart) return
    const engine = new Stockfish()
    let stopped = false
    const toPlay = game.turn() !== human && !game.isGameOver()
    void engine.analyze(game, toPlay ? 5 + skill : 10, toPlay ? (skill - 1) * 4 : 20)
      .then(result => {
        if (stopped) return
        setEvaluated({ fen: game.fen(), value: result })
        if (toPlay && result.bestMove) {
          const next = copyGame(game)
          next.move(coordinateMove(result.bestMove))
          setGame(next)
        }
      }).catch((reason: Error) => {
        if (!stopped) setError(reason.message)
      }).finally(() => engine.close())
    return () => { stopped = true; engine.close() }
  }, [active, canStart, game, human, retry, skill])

  function start(color = human) {
    setHuman(color)
    setOrientation(color)
    setGame(new Chess())
    setEvaluated(undefined)
    setError('')
    setCanStart(true)
  }

  function play(from: string, to: string, promotion?: string) {
    if (game.turn() !== human || game.isGameOver()) return false
    try {
      const next = copyGame(game)
      next.move({ from, to, promotion })
      setError('')
      setGame(next)
      setCanStart(true)
      return true
    } catch { return false }
  }

  const moves = game.history({ verbose: true })
  const lastMove = moves.at(-1)
  const isHumanTurn = game.turn() === human
  const levelNames = ['Relaxed', 'Casual', 'Club', 'Strong', 'Expert', 'Maximum']
  const value = evaluated?.fen === game.fen() ? evaluated.value : undefined

  function review() {
    const copy = copyGame(game)
    copy.setHeader('White', human === 'w' ? 'You' : 'Stockfish')
    copy.setHeader('Black', human === 'b' ? 'You' : 'Stockfish')
    copy.setHeader('Result', game.isCheckmate() ? (game.turn() === 'w' ? '0-1' : '1-0') : game.isDraw() ? '1/2-1/2' : '*')
    onReview(savePgn(copy.pgn(), 'engine'))
  }

  return <div className="workspace">
    <Board fen={game.fen()} orientation={orientation} bottomName={orientation === human ? 'You' : 'Stockfish'} topName={orientation === human ? 'Stockfish' : 'You'}
      showTurn={!game.isGameOver()} evaluation={value} highlight={lastMove}
      canPlay={isHumanTurn && !game.isGameOver()} onMove={play} onFlip={() => setOrientation(old => old === 'w' ? 'b' : 'w')} />
    <aside className="side-stack">
      <section className="panel section-pad">
        <div className="eyebrow"><Swords size={15} /> ENGINE MATCH</div>
        <h2>Play Stockfish</h2>
        <p className="muted">Pick a side and a level, then make your first move.</p>
        <div className="field-label">Play as</div>
        <div className="segmented">
          <button className={human === 'w' ? 'selected' : ''} onClick={() => { if (human !== 'w') start('w') }}><span className="color-dot white" /> White</button>
          <button className={human === 'b' ? 'selected' : ''} onClick={() => { if (human !== 'b') start('b') }}><span className="color-dot black" /> Black</button>
        </div>
        <label htmlFor="strength" className="field-label strength-label">Engine strength <span>{levelNames[skill - 1]} · {skill}/6</span></label>
        <input id="strength" type="range" min="1" max="6" value={skill} onChange={event => setSkill(Number(event.target.value))} />
        <div className="button-row">
          <button className="button primary" onClick={() => start()}><RotateCcw size={15} /> New game</button>
          <button className="button secondary" disabled={moves.length <= (human === 'b' ? 1 : 0)} onClick={() => {
            const keep = Math.max(human === 'b' ? 1 : 0, moves.length - (isHumanTurn ? 2 : 1))
            setGame(copyGame(game, keep)); setEvaluated(undefined); setError('')
          }}><Undo2 size={17} /> Undo</button>
        </div>
      </section>
      <section className="panel section-pad">
        <div className="section-heading"><Activity size={17} /><h3>Game moves</h3><span className="badge subtle">{moves.length} plies</span></div>
        <p className="game-status" role="status"><span className={`status-dot ${!isHumanTurn && !game.isGameOver() && !error ? 'pulse' : ''}`} />{error && !isHumanTurn ? 'Engine stopped' : gameLabel(game, human)}</p>
        {error && <div className="notice error">{error} <button className="link-button" onClick={() => { setError(''); setRetry(value => value + 1) }}>Retry</button></div>}
        <MoveTable moves={moves} />
        {moves.length > 0 && <button className="button secondary full" onClick={review}><Sparkles size={16} /> Review this game</button>}
      </section>
      <div className="inline-note"><Cpu size={15} /> Stockfish runs locally in your browser.</div>
    </aside>
  </div>
}
