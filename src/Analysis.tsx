import { useEffect, useRef, useState } from 'react'
import { Chess, type Color } from 'chess.js'
import { ChevronLeft, ChevronRight, CircleStop, ExternalLink, Lightbulb, ListOrdered, SkipBack, SkipForward, Sparkles, Target } from 'lucide-react'
import { Board, MoveTable } from './Board'
import { reviewMove, summarize, type Review } from './coach'
import { AskCoach, GeneratedCoachText, useCoachReply } from './CoachReplies'
import { CoachSettingsPanel } from './CoachSettings'
import { Stockfish, type Evaluation } from './engine'
import { readGame, type SavedGame } from './games'
import { moveFacts, movePrompt, summaryPrompt, type CoachConnection, type CoachSettings } from './llm'
import { Opening } from './Opening'

const depth = 12

export function Analysis({ selected, onLibrary, settings, connection, onConnect, onDisconnect }: {
  selected: SavedGame
  onLibrary: () => void
  settings: CoachSettings
  connection?: CoachConnection
  onConnect: (connection: CoachConnection) => void
  onDisconnect: () => void
}) {
  const [moves] = useState(() => readGame(selected.pgn).history({ verbose: true }))
  const [ply, setPly] = useState(0)
  const [showBest, setShowBest] = useState(false)
  const [orientation, setOrientation] = useState<Color>('w')
  const [reviews, setReviews] = useState<Review[]>([])
  const [scores, setScores] = useState<Evaluation[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const engineRef = useRef<Stockfish>(undefined)
  useEffect(() => () => { engineRef.current?.close(); engineRef.current = undefined }, [])

  function go(next: number) {
    setPly(Math.min(moves.length, Math.max(0, next)))
    setShowBest(false)
  }

  function stop() {
    engineRef.current?.close()
    engineRef.current = undefined
    setRunning(false)
  }

  async function analyze() {
    const board = new Chess(moves[0].before)
    const engine = new Stockfish()
    engineRef.current = engine
    setRunning(true)
    setReviews([])
    setScores([])
    setError('')
    try {
      let before = await engine.analyze(board, depth)
      if (engineRef.current !== engine) return
      setScores([before])
      for (const move of moves) {
        board.move(move)
        const after = await engine.analyze(board, depth)
        if (engineRef.current !== engine) return
        const review = reviewMove(move, before, after)
        setReviews(items => [...items, review])
        setScores(items => [...items, after])
        before = after
      }
    } catch (reason) {
      if (engineRef.current === engine) setError((reason as Error).message)
    } finally {
      if (engineRef.current === engine) stop()
    }
  }

  const current = moves[ply - 1]
  const review = reviews[ply - 1]
  const bestView = showBest && current && review?.bestMove
  const fen = bestView ? current.before : current?.after ?? moves[0].before
  const summary = reviews.length === moves.length ? summarize(moves, reviews) : undefined
  const percent = Math.floor(reviews.length / moves.length * 100)
  const facts = review && scores[ply - 1] && scores[ply] ? moveFacts(current, review, scores[ply - 1], scores[ply]) : undefined
  const generatedMove = useCoachReply(connection, facts && movePrompt(facts))
  const generatedSummary = useCoachReply(connection, summary && scores.length === moves.length + 1
    ? summaryPrompt(summary, summary.keyMoments.map(moment => moveFacts(moment.move, moment, scores[moment.index], scores[moment.index + 1])))
    : undefined)

  return <div className="workspace">
    <div>
      <Board fen={fen} orientation={orientation} bottomName={orientation === 'w' ? selected.white : selected.black} topName={orientation === 'w' ? selected.black : selected.white}
        evaluation={scores[bestView ? ply - 1 : ply]} highlight={bestView ? undefined : current} arrow={bestView || undefined}
        onFlip={() => setOrientation(old => old === 'w' ? 'b' : 'w')} />
      <div className="board-navigation">
        <button className="icon-button" title="First position" aria-label="First position" disabled={ply === 0} onClick={() => go(0)}><SkipBack size={17} /></button>
        <button className="icon-button" title="Previous move" aria-label="Previous move" disabled={ply === 0} onClick={() => go(ply - 1)}><ChevronLeft size={20} /></button>
        <span>{bestView ? 'Before ' + current.san : ply === 0 ? 'Starting position' : current.san} <small>{ply} / {moves.length}</small></span>
        <button className="icon-button" title="Next move" aria-label="Next move" disabled={ply === moves.length} onClick={() => go(ply + 1)}><ChevronRight size={20} /></button>
        <button className="icon-button" title="Final position" aria-label="Final position" disabled={ply === moves.length} onClick={() => go(moves.length)}><SkipForward size={17} /></button>
      </div>
      <Opening fen={fen} gameOpening={selected.opening} />
    </div>
    <aside className="side-stack">
      <section className="panel section-pad">
        <div className="eyebrow"><Sparkles size={16} /> GAME REVIEW</div>
        <h2>Your chess coach</h2>
        <p className="muted">Learn what changed with each move, and what to look for next time.</p>
        <div className="analysis-meta"><span className="badge subtle">Stockfish · depth {depth}</span>
          {selected.url ? <a className="link-button" href={selected.url} target="_blank" rel="noreferrer">Open on Lichess <ExternalLink size={13} /></a>
            : <button className="link-button" onClick={onLibrary}>Choose another game</button>}
        </div>
        {running ? <>
          <div className="progress-label" role="status">Analyzing moves <span>{reviews.length}/{moves.length}</span></div>
          <progress max="100" value={percent} aria-label="Analysis progress" />
          <button className="button secondary full" onClick={stop}><CircleStop size={16} /> Stop analysis</button>
        </> : !summary && <button className="button primary full" onClick={() => void analyze()}><Sparkles size={16} /> {reviews.length ? 'Restart analysis' : 'Analyze game'}</button>}
        {error && <p className="notice error" role="alert">{error}</p>}
        {summary && <div className="summary">
          <div className="section-heading"><Target size={17} /><h3>Game summary</h3></div>
          <div className="accuracy">
            <div><small><span className="color-dot white" /> White accuracy</small><strong>{summary.white ?? '—'}{summary.white !== null && '%'}</strong></div>
            <div><small><span className="color-dot black" /> Black accuracy</small><strong>{summary.black ?? '—'}{summary.black !== null && '%'}</strong></div>
          </div>
          <div className="field-label">Key moments</div>
          {summary.keyMoments.length ? <div className="key-moments">{summary.keyMoments.map(item =>
            <button key={item.index} className="badge" onClick={() => go(item.index + 1)}><i className={`rating-dot ${item.quality.toLowerCase()}`} /> {item.move.san} · {item.quality}</button>
          )}</div> : <p className="muted">No major evaluation drops at this depth.</p>}
          <div className="field-label"><Lightbulb size={16} /> Practice tips</div>
          <ul>{summary.tips.map(tip => <li key={tip}>{tip}</li>)}</ul>
          <GeneratedCoachText reply={generatedSummary} title="LLM game recap" />
        </div>}
      </section>
      <CoachSettingsPanel settings={settings} connection={connection} onSave={onConnect} onDisconnect={onDisconnect} />
      <section className="panel section-pad">
        <div className="section-heading"><ListOrdered size={18} /><h3>Move breakdown</h3><span className="badge subtle">{moves.length} plies</span></div>
        <MoveTable moves={moves} position={ply} onSelect={go} ratings={reviews.map(item => item.quality)} />
        <div className="move-review">
          {review ? <>
            <div className="section-heading"><h3>{current.san}</h3><span className={`quality ${review.quality.toLowerCase()}`}>{review.quality}</span></div>
            <p>{review.explanation}</p>
            <small className="muted">Rule-based · {scores[ply - 1]?.mate === undefined && scores[ply]?.mate === undefined ? `${review.loss} cp loss · ` : ''}{review.winDrop.toFixed(1)} point win chance drop</small>
            <GeneratedCoachText reply={generatedMove} title="LLM move explanation" />
            {review.bestMove && <button className="button secondary full" onClick={() => setShowBest(value => !value)}><Target size={16} /> {showBest ? 'Return to played move' : `Show best move: ${review.bestSan}`}</button>}
          </> : <p className="muted">{ply === 0 ? 'Select a move to see the coach’s explanation.' : 'Run analysis to get feedback on this move.'}</p>}
        </div>
      </section>
      <AskCoach key={fen} connection={connection} fen={fen} evaluation={scores[bestView ? ply - 1 : ply]} move={facts} />
    </aside>
  </div>
}
