import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MessageCircle, Sparkles } from 'lucide-react'
import type { Evaluation } from './engine'
import type { CoachLevel } from './coach'
import { questionPrompt, requestCoach, type CoachConnection, type MoveFacts, type Prompt } from './llm'

export function useCoachReply(connection?: CoachConnection, prompt?: Prompt) {
  const system = prompt?.system
  const user = prompt?.user
  const cacheKey = system && user ? JSON.stringify([system, user]) : undefined
  const cache = useRef<{ connection?: CoachConnection; answers: Map<string, string> }>({ answers: new Map() })
  const [reply, setReply] = useState<{ connection: CoachConnection; user: string; answer?: string; error?: string }>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (cache.current.connection !== connection) cache.current = { connection, answers: new Map() }
    if (!connection || !system || !user || !cacheKey || cache.current.answers.has(cacheKey)) return
    const controller = new AbortController()
    void requestCoach(connection, { system, user }, controller.signal).then(answer => {
      if (!controller.signal.aborted) {
        cache.current.answers.set(cacheKey, answer)
        setReply({ connection, user: cacheKey, answer })
      }
    }).catch(error => {
      if (!controller.signal.aborted) setReply({ connection, user: cacheKey, error: (error as Error).message })
    })
    return () => controller.abort()
  }, [connection, system, user, cacheKey, attempt])

  if (!connection || !cacheKey) return
  const current = reply?.connection === connection && reply.user === cacheKey ? reply : undefined
  return { answer: cache.current.connection === connection ? cache.current.answers.get(cacheKey) : undefined, error: current?.error,
    retry: () => { setReply(undefined); setAttempt(value => value + 1) } }
}

export function GeneratedCoachText({ reply, title }: { reply: ReturnType<typeof useCoachReply>; title: string }) {
  if (!reply) return null
  return <div className="coach-reply" aria-live="polite">
    <strong><Sparkles size={14} /> {title}</strong>
    {reply.answer ? <p>{reply.answer}</p> : reply.error ? <p className="notice error">{reply.error} <button className="link-button" onClick={reply.retry}>Retry</button></p>
      : <p className="muted">Generating with your coach provider…</p>}
  </div>
}

export function AskCoach({ connection, fen, evaluation, move, level }: {
  connection?: CoachConnection; fen: string; evaluation?: Evaluation; move?: MoveFacts; level: CoachLevel
}) {
  const [question, setQuestion] = useState('')
  const [submitted, setSubmitted] = useState<Prompt>()
  const reply = useCoachReply(connection, submitted)

  function ask(event: FormEvent) {
    event.preventDefault()
    if (!connection || !question.trim()) return
    setSubmitted(questionPrompt(question.trim(), fen, evaluation, move, level))
  }

  return <section className="panel section-pad">
    <div className="section-heading"><MessageCircle size={17} /><h3>Ask the coach</h3></div>
    {connection ? <form onSubmit={ask}>
      <label className="field-label" htmlFor="coach-question">Question about the current board</label>
      <textarea id="coach-question" value={question} onChange={event => setQuestion(event.target.value)} placeholder="What should I look for in this position?" maxLength={500} rows={2} required />
      <button className="button secondary full">Ask about this position</button>
    </form> : <p className="muted">Enable a provider in Coach settings to ask questions about this position.</p>}
    <GeneratedCoachText reply={reply} title="Coach answer" />
  </section>
}
