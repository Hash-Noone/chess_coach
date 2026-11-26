import { useEffect, useMemo, useState } from 'react'
import type { Move } from 'chess.js'
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from 'lucide-react'
import type { CoachLevel, Review } from './coach'
import type { Evaluation } from './engine'
import { moveStory, type StoryStep } from './move-story'

/** Scope playback to the selected position so navigation cancels old timers. */
export function useMoveExplanation({ id, move, review, before, after, level, active }: {
  id: string
  move?: Move
  review?: Review
  before?: Evaluation
  after?: Evaluation
  level: CoachLevel
  active: boolean
}) {
  const steps = useMemo(() => move ? moveStory(move, review, before, after, level) : [], [move, review, before, after, level])
  const [session, setSession] = useState<{ id: string; index?: number; playing: boolean }>({ id, playing: false })
  const index = session.id === id ? session.index : undefined
  const playing = session.id === id && session.playing
  const setIndex = (index: number | undefined) => setSession(old => ({ ...old, id, index }))
  const setPlaying = (playing: boolean) => setSession(old => ({ ...old, id, playing }))
  const [reducedMotion, setReducedMotion] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  const current: StoryStep | undefined = index === undefined ? undefined : steps[index]

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const changed = () => setReducedMotion(media.matches)
    media.addEventListener('change', changed)
    return () => media.removeEventListener('change', changed)
  }, [])

  useEffect(() => { setSession(old => old.id === id ? old : { id, playing: false }) }, [id])
  useEffect(() => { if (!active) setSession(old => ({ ...old, playing: false })) }, [active])
  useEffect(() => {
    if (!active || !playing || index === undefined || !current) return
    // Leave time to read the narration; manual stepping is always available.
    const timer = window.setTimeout(() => {
      if (index < steps.length - 1) setIndex(index + 1)
      else setPlaying(false)
    }, Math.max(3000, Math.min(14000, current.text.split(/\s+/).length * 330)))
    return () => window.clearTimeout(timer)
  }, [id, active, playing, index, current, steps.length])

  function play() {
    if (!playing && (index === undefined || index === steps.length - 1)) setIndex(0)
    setPlaying(!playing)
  }

  const controls = move && <section className={`move-explanation story-${current?.tone ?? 'idle'}`} aria-label="Animated move explanation">
      <div className="story-heading">
        <span className="eyebrow">MOVE EXPLAINED <span>{move.san}</span></span>
        {current && <button className="icon-button" aria-label="Close explanation" title="Return to game position" onClick={() => { setIndex(undefined); setPlaying(false) }}><X size={16} /></button>}
      </div>
      {current ? <>
        <div className="story-caption" key={index} aria-live="polite" aria-atomic="true">
          <h3>{current.title}</h3>
          <p>{current.text}</p>
        </div>
        <div className="story-steps" role="group" aria-label="Explanation steps">{steps.map((step, at) =>
          <button key={at} className={index === at ? 'current' : ''} aria-label={`Step ${at + 1}: ${step.title}`} aria-current={index === at ? 'step' : undefined}
            title={step.title} onClick={() => { setIndex(at); setPlaying(false) }}><span /></button>)}</div>
        <div className="story-controls">
          <button className="icon-button" aria-label="Previous explanation step" disabled={index === 0} onClick={() => { setIndex(index! - 1); setPlaying(false) }}><ChevronLeft size={18} /></button>
          <button className="button secondary" onClick={play}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? 'Pause' : index === steps.length - 1 ? 'Replay explanation' : 'Play'}</button>
          <button className="icon-button" aria-label="Next explanation step" disabled={index === steps.length - 1} onClick={() => { setIndex(index! + 1); setPlaying(false) }}><ChevronRight size={18} /></button>
          <small>{index! + 1} / {steps.length}</small>
          <button className="icon-button story-replay" aria-label="Restart explanation" title="Restart explanation" onClick={() => { setIndex(0); setPlaying(true) }}><RotateCcw size={16} /></button>
        </div>
        <button className="link-button story-return" onClick={() => { setIndex(undefined); setPlaying(false) }}>Return to recorded position</button>
      </> : <>
        <p>Watch the move, its threats, and what it leaves behind.</p>
        <button className="button secondary full" onClick={play}><Play size={16} /> Explain this move</button>
      </>}
    </section>
  return { story: active ? current : undefined, animate: !reducedMotion, controls }
}
