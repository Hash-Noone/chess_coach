import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Chess, type Color, type Move } from 'chess.js'
import { ChevronLeft, ChevronRight, CircleStop, ExternalLink, Lightbulb, ListOrdered, SkipBack, SkipForward, Sparkles, Target } from 'lucide-react'
import { Board, MoveTable } from './Board'
import { beginnerExplanation, boardMove, reviewImpact, reviewMove, summarize, type CoachLevel, type Review } from './coach'
import { AskCoach, GeneratedCoachText, useCoachReply } from './CoachReplies'
import { CoachSettingsPanel } from './CoachSettings'
import { Stockfish, type EnginePhase, type Evaluation } from './engine'
import { gameSites, readGame, type SavedGame } from './games'
import { moveFacts, movePrompt, summaryPrompt, type ActiveCoach, type CoachConnection, type CoachSettings } from './llm'
import { Opening } from './Opening'
import { listenForReviewNavigation } from './review-navigation'
import { useMoveExplanation } from './MoveExplanation'

const depth = 12

export type ReviewState = { selection: { ply: number }; showBest: boolean; reviews: Review[]; scores: Evaluation[] }
export const initialReview: ReviewState = { selection: { ply: 0 }, showBest: false, reviews: [], scores: [] }

export function Analysis({ active, selected, onLibrary, settings, connection, builtInAvailable, onToggleBuiltIn, onConnect, onDisconnect, state, update, level, onLevel }: {
  active: boolean
  selected: SavedGame
  onLibrary: () => void
  settings: CoachSettings
  connection?: ActiveCoach
  builtInAvailable?: boolean
  onToggleBuiltIn?: () => void
  onConnect: (connection: CoachConnection) => void
  onDisconnect: () => void
  state: ReviewState
  update: (update: (state: ReviewState) => ReviewState) => void
  level: CoachLevel
  onLevel: (level: CoachLevel) => void
}) {
  const [moves] = useState(() => readGame(selected.pgn).history({ verbose: true }))
  const { selection, showBest, reviews, scores } = state
  const { ply } = selection
  const [orientation, setOrientation] = useState<Color>('w')
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState<EnginePhase>('loading')
  const [error, setError] = useState('')
  const [variation, setVariation] = useState<Move[]>([])
  const [navigationId, setNavigationId] = useState(0)
  const engineRef = useRef<Stockfish>(undefined)
  const boardRef = useRef<HTMLDivElement>(null)
  useEffect(() => () => { engineRef.current?.close(); engineRef.current = undefined }, [])

  function revealBoard() {
    const board = boardRef.current
    if (!board || !matchMedia('(max-width: 665px), (pointer: coarse)').matches) return
    const bounds = board.getBoundingClientRect()
    if (bounds.top < 0 || bounds.bottom > window.innerHeight) board.scrollIntoView({ block: 'nearest' })
  }

  function go(next: number) {
    setNavigationId(value => value + 1)
    setVariation([])
    update(state => ({ ...state, selection: { ply: Math.min(moves.length, Math.max(0, next)) }, showBest: false }))
    revealBoard()
  }

  const step = useEffectEvent((direction: -1 | 1) => {
    const next = ply + direction
    if (next >= 0 && next <= moves.length) go(next)
  })
  useEffect(() => {
    if (active) return listenForReviewNavigation(window, step)
  }, [active])

  function stop() {
    engineRef.current?.close()
    engineRef.current = undefined
    setRunning(false)
  }

  async function analyze() {
    setVariation([])
    const board = new Chess(moves[0].before)
    const engine = new Stockfish(setPhase)
    engineRef.current = engine
    setRunning(true)
    setPhase('loading')
    update(state => ({ ...state, reviews: [], scores: [], showBest: false }))
    setError('')
    try {
      let before = await engine.analyze(board, depth)
      if (engineRef.current !== engine) return
      const initial = before
      update(state => ({ ...state, scores: [initial] }))
      for (const move of moves) {
        board.move(move)
        const after = await engine.analyze(board, depth)
        if (engineRef.current !== engine) return
        const review = reviewMove(move, before, after)
        update(state => ({ ...state, reviews: [...state.reviews, review], scores: [...state.scores, after] }))
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
  const impact = review && reviewImpact(current, review, scores[ply - 1], scores[ply], level)
  const bestView = showBest && current && review?.bestMove
  const variationMove = variation.at(-1)
  const fen = variationMove?.after ?? (bestView ? current.before : current?.after ?? moves[0].before)
  const evaluation = variationMove ? undefined : scores[bestView ? ply - 1 : ply]
  const summary = reviews.length === moves.length ? summarize(moves, reviews) : undefined
  const percent = Math.floor(reviews.length / moves.length * 100)
  const facts = review && scores[ply - 1] && scores[ply] ? moveFacts(current, review, scores[ply - 1], scores[ply], level) : undefined
  const generatedMove = useCoachReply(connection, facts && movePrompt(facts, level))
  const generatedSummary = useCoachReply(connection, summary && scores.length === moves.length + 1
    ? summaryPrompt(summary, summary.keyMoments.map(moment => moveFacts(moment.move, moment, scores[moment.index], scores[moment.index + 1], level)), level)
    : undefined)
  const { story, animate, controls } = useMoveExplanation({ id: `${navigationId}:${ply}:${!!bestView}:${variation.length}:${!!review}`, active,
    move: bestView || variationMove ? undefined : current, review, before: scores[ply - 1], after: scores[ply], level })
  const displayedFen = story?.fen ?? fen
  const displayedEvaluation = story ? story.evaluation : evaluation

  return <div className="workspace">
    <div>
      <div ref={boardRef}><Board id="review-board" fen={displayedFen} orientation={orientation} bottomName={orientation === 'w' ? selected.white : selected.black} topName={orientation === 'w' ? selected.black : selected.white}
        evaluation={displayedEvaluation} highlight={story ? story.highlight : variationMove ?? (bestView ? undefined : current)} arrow={story || variationMove ? undefined : bestView || undefined}
        annotations={story} animate={animate} onFlip={() => setOrientation(old => old === 'w' ? 'b' : 'w')} />
        {controls}</div>
      <div className="board-navigation">
        <button className="icon-button" title="First position" aria-label="First position" disabled={ply === 0} onClick={() => go(0)}><SkipBack size={17} /></button>
        <button className="icon-button" title="Previous move" aria-label="Previous move" disabled={ply === 0} onClick={() => go(ply - 1)}><ChevronLeft size={20} /></button>
        <span>{story ? 'Explaining ' + current.san : bestView ? 'Before ' + current.san : ply === 0 ? 'Starting position' : current.san} <small>{ply} / {moves.length}</small></span>
        <button className="icon-button" title="Next move" aria-label="Next move" disabled={ply === moves.length} onClick={() => go(ply + 1)}><ChevronRight size={20} /></button>
        <button className="icon-button" title="Final position" aria-label="Final position" disabled={ply === moves.length} onClick={() => go(moves.length)}><SkipForward size={17} /></button>
      </div>
      {variationMove && <div className="opening-variation">
        <p><strong>Opening variation:</strong> {variation.map(move => move.san).join(' ')}</p>
        <button className="button secondary" onClick={() => { setVariation([]); revealBoard() }}>Return to game position</button>
      </div>}
      <Opening fen={displayedFen} onMove={uci => {
        const move = boardMove(displayedFen, uci)
        if (!move) return
        setVariation(steps => [...steps, move])
        revealBoard()
      }} />
    </div>
    <aside className="side-stack">
      <section className="panel section-pad">
        <div className="eyebrow"><Sparkles size={16} /> GAME REVIEW</div>
        <h2>Your chess coach</h2>
        <p className="muted">Learn what changed with each move, and what to look for next time.</p>
        <div className="analysis-meta"><span className="badge subtle" title="Depth is how many individual player turns the engine aims to look ahead.">Stockfish · looks {depth} turns ahead</span>
          {selected.url && (selected.source === 'lichess' || selected.source === 'chesscom')
            ? <a className="link-button" href={selected.url} target="_blank" rel="noreferrer">Open on {gameSites[selected.source]} <ExternalLink size={13} /></a>
            : <button className="link-button" onClick={onLibrary}>Choose another game</button>}
        </div>
        <div className="field-label">Coaching level</div>
        <div className="segmented" aria-label="Coaching level" role="group">
          <button className={level === 'beginner' ? 'selected' : ''} aria-pressed={level === 'beginner'} onClick={() => onLevel('beginner')}>Beginner</button>
          <button className={level === 'advanced' ? 'selected' : ''} aria-pressed={level === 'advanced'} onClick={() => onLevel('advanced')}>Advanced</button>
        </div>
        {running ? <>
          <div className="progress-label" role="status">{phase === 'loading' ? 'Loading engine…' : 'Analyzing moves'} <span>{reviews.length}/{moves.length}</span></div>
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
          )}</div> : <p className="muted">The engine found no major mistakes.</p>}
          <div className="field-label"><Lightbulb size={16} /> Practice tips</div>
          <ul>{summary.tips.map(tip => <li key={tip}>{tip}</li>)}</ul>
          <GeneratedCoachText reply={generatedSummary} title="LLM game recap" />
        </div>}
      </section>
      <CoachSettingsPanel settings={settings} connection={connection} builtInAvailable={builtInAvailable}
        onToggleBuiltIn={onToggleBuiltIn} onSave={onConnect} onDisconnect={onDisconnect} />
      <section className="panel section-pad">
        <div className="section-heading"><ListOrdered size={18} /><h3>Move breakdown</h3><span className="badge subtle" title="Each player’s turn counts as one move.">{moves.length} moves</span></div>
        <MoveTable moves={moves} selection={selection} onSelect={go} ratings={reviews.map(item => item.quality)} />
        <div className="move-review">
          {review ? <>
            <div className="section-heading"><h3>{current.san}</h3><span className={`quality ${review.quality.toLowerCase()}`}>{review.quality}</span></div>
            <p>{level === 'beginner' ? beginnerExplanation(current, scores[ply - 1], scores[ply], review) : review.explanation}</p>
            <small className="muted">Rule-based{impact && ` · ${impact}`}</small>
            <GeneratedCoachText reply={generatedMove} title="LLM move explanation" />
            {review.bestMove && <button className="button secondary full" onClick={() => {
              setVariation([])
              update(state => ({ ...state, showBest: !state.showBest }))
              revealBoard()
            }}><Target size={16} /> {showBest ? 'Return to played move' : `Show best move: ${review.bestSan}`}</button>}
          </> : <p className="muted">{ply === 0 ? 'Select a move to see the coach’s explanation.' : 'Run analysis to get feedback on this move.'}</p>}
        </div>
      </section>
      <AskCoach key={fen + level} connection={connection} fen={displayedFen} evaluation={displayedEvaluation} move={variationMove || (story && story.fen !== current?.after) ? undefined : facts} level={level} />
    </aside>
  </div>
}
