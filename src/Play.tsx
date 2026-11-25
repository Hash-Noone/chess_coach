import { useEffect, useState, type FormEvent } from 'react'
import { Chess, type Color } from 'chess.js'
import { Activity, Cpu, RotateCcw, Sparkles, Swords, Undo2 } from 'lucide-react'
import { Board, gameLabel, MoveTable } from './Board'
import { coordinateMove, Stockfish, type EnginePhase, type Evaluation } from './engine'
import { savePgn, type SavedGame } from './games'
import { loadTrainedStats, type TrainingStats } from './learned-assets'
import { Opening } from './Opening'
import { readPlayPosition } from './play-position'
import { TrainedEngine } from './trained-engine'

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
  const [phase, setPhase] = useState<EnginePhase>()
  const [retry, setRetry] = useState(0)
  const [canStart, setCanStart] = useState(false)
  const [engineType, setEngineType] = useState<'trained' | 'stockfish'>('trained')
  const [training, setTraining] = useState<TrainingStats>()
  const [positionInput, setPositionInput] = useState('')
  const [positionError, setPositionError] = useState('')
  const engineName = engineType === 'trained' ? 'Lichess-trained engine' : 'Stockfish'

  useEffect(() => {
    let mounted = true
    void loadTrainedStats().then(stats => { if (mounted) setTraining(stats) }).catch(() => {})
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!active || !canStart) return
    let stopped = false
    const toPlay = game.turn() !== human && !game.isGameOver()
    const engine = engineType === 'trained' ? new TrainedEngine() : new Stockfish(phase => { if (!stopped) setPhase(phase) })
    const request = engine instanceof TrainedEngine ? engine.analyze(game, skill, toPlay)
      : engine.analyze(game, toPlay ? 5 + skill : 10, toPlay ? (skill - 1) * 4 : 20)
    void request
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
      }).finally(() => {
        engine.close()
        if (!stopped) setPhase(undefined)
      })
    return () => { stopped = true; engine.close() }
  }, [active, canStart, engineType, game, human, retry, skill])

  function start(color = human, position = new Chess()) {
    setHuman(color)
    setOrientation(color)
    setGame(position)
    setEvaluated(undefined)
    setError('')
    setPositionError('')
    setCanStart(!position.isGameOver())
  }

  function loadPosition(event: FormEvent) {
    event.preventDefault()
    try {
      start(human, readPlayPosition(positionInput))
      setPositionInput('')
    } catch (reason) {
      setPositionError((reason as Error).message)
    }
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
  const canPlay = isHumanTurn && !game.isGameOver()
  const engineOpeningMoves = moves.length && moves[0].color !== human ? 1 : 0
  const levelNames = ['Relaxed', 'Casual', 'Club', 'Strong', 'Expert', 'Maximum']
  const value = evaluated?.fen === game.fen() ? evaluated.value : undefined

  function review() {
    const copy = copyGame(game)
    copy.setHeader('White', human === 'w' ? 'You' : engineName)
    copy.setHeader('Black', human === 'b' ? 'You' : engineName)
    copy.setHeader('Result', game.isCheckmate() ? (game.turn() === 'w' ? '0-1' : '1-0') : game.isDraw() ? '1/2-1/2' : '*')
    onReview(savePgn(copy.pgn(), 'engine'))
  }

  return <div className="workspace">
    <div className="play-board-stack">
      <Board id="play-board" fen={game.fen()} orientation={orientation} bottomName={orientation === human ? 'You' : engineName} topName={orientation === human ? engineName : 'You'} animate
        showTurn={!game.isGameOver()} evaluation={value} highlight={lastMove}
        canPlay={canPlay} onMove={play} onFlip={() => setOrientation(old => old === 'w' ? 'b' : 'w')} />
      {active && <Opening fen={game.fen()} onMove={canPlay ? uci => {
        const { from, to, promotion } = coordinateMove(uci)
        play(from, to, promotion)
      } : undefined} />}
    </div>
    <aside className="side-stack">
      <section className="panel section-pad">
        <div className="eyebrow"><Swords size={15} /> ENGINE MATCH</div>
        <h2>Engine match</h2>
        <p className="muted">Pick an engine, a side, and a level.</p>
        <label className="field-label" htmlFor="play-engine">Opponent</label>
        <select id="play-engine" value={engineType} onChange={event => {
          setEngineType(event.target.value === 'stockfish' ? 'stockfish' : 'trained')
          setEvaluated(undefined)
          setError('')
        }}>
          <option value="trained">Lichess-trained engine</option>
          <option value="stockfish">Stockfish</option>
        </select>
        <div className="field-label">Play as</div>
        <div className="segmented">
          <button className={human === 'w' ? 'selected' : ''} onClick={() => { if (human !== 'w') start('w') }}><span className="color-dot white" /> White</button>
          <button className={human === 'b' ? 'selected' : ''} onClick={() => { if (human !== 'b') start('b') }}><span className="color-dot black" /> Black</button>
        </div>
        <label htmlFor="strength" className="field-label strength-label">Engine strength <span>{levelNames[skill - 1]} · {skill}/6</span></label>
        <input id="strength" type="range" min="1" max="6" value={skill} onChange={event => setSkill(Number(event.target.value))} />
        <div className="button-row">
          <button className="button primary" onClick={() => start()}><RotateCcw size={15} /> New game</button>
          <button className="button secondary" disabled={moves.length <= engineOpeningMoves} onClick={() => {
            const keep = Math.max(engineOpeningMoves, moves.length - (isHumanTurn ? 2 : 1))
            setGame(copyGame(game, keep)); setEvaluated(undefined); setError('')
          }}><Undo2 size={17} /> Undo</button>
        </div>
        <details className="load-position">
          <summary>Load position (FEN)</summary>
          <form onSubmit={loadPosition}>
            <label className="field-label" htmlFor="play-fen">FEN</label>
            <input id="play-fen" value={positionInput} onChange={event => { setPositionInput(event.target.value); setPositionError('') }}
              aria-invalid={!!positionError} required spellCheck={false} />
            {positionError && <p className="notice error" role="alert">{positionError}</p>}
            <button className="button secondary" type="submit">Load position</button>
          </form>
        </details>
      </section>
      <section className="panel section-pad">
        <div className="section-heading"><Activity size={17} /><h3>Game moves</h3><span className="badge subtle" title="Each player’s turn counts as one move.">{moves.length} moves</span></div>
        <p className="game-status" role="status"><span className={`status-dot ${!isHumanTurn && !game.isGameOver() && !error ? 'pulse' : ''}`} />{error && !isHumanTurn ? 'Engine stopped' : engineType === 'stockfish' && phase === 'loading' && !game.isGameOver() ? 'Loading engine…' : gameLabel(game, human, engineName)}</p>
        {error && <div className="notice error">{error} <button className="link-button" onClick={() => { setError(''); setRetry(value => value + 1) }}>Retry</button></div>}
        <MoveTable moves={moves} />
        {moves.length > 0 && <button className="button secondary full" onClick={review}><Sparkles size={16} /> Review this game</button>}
      </section>
      {training && <details className="panel section-pad about-training">
        <summary>About the trained engine</summary>
        <p className="muted">Trained on {training.evaluationTrainingPositions.toLocaleString()} Lichess evaluated positions and {training.gameTrainingPositions.toLocaleString()} positions from {training.games.toLocaleString()} rated games ({training.gameArchiveMonth}). The same games supplied its opening book.</p>
        <p className="muted">On {training.validationPositions.toLocaleString()} held-out evaluations, the average error was {training.validationMaeCp} centipawns ({training.materialMaeCp} for material alone); {training.validationWithinOnePawn}% were within one pawn.</p>
        <a className="link-button" href="https://database.lichess.org/" target="_blank" rel="noreferrer">Lichess Open Database</a>
      </details>}
      <div className="inline-note"><Cpu size={15} /> Both engines run locally in your browser.</div>
    </aside>
  </div>
}
