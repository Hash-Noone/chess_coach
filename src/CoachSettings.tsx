import { useState, type FormEvent } from 'react'
import { KeyRound } from 'lucide-react'
import { providerUrl, type ActiveCoach, type CoachConnection, type CoachSettings } from './llm'

export function CoachSettingsPanel({ settings, connection, builtInAvailable, onToggleBuiltIn, onSave, onDisconnect }: {
  settings: CoachSettings
  connection?: ActiveCoach
  builtInAvailable?: boolean
  onToggleBuiltIn?: () => void
  onSave: (connection: CoachConnection) => void
  onDisconnect: () => void
}) {
  const [draft, setDraft] = useState(settings)
  const [apiKey, setApiKey] = useState('')
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const isBuiltIn = connection?.provider === 'built-in'
  const isCustom = !!connection && !isBuiltIn

  function save(event: FormEvent) {
    event.preventDefault()
    setFailed(false)
    try {
      providerUrl(draft)
      if (!draft.model.trim() || !apiKey.trim()) throw new Error('Enter a model and an API key.')
      onSave({ ...draft, apiKey: apiKey.trim() })
      setApiKey('')
      setNotice('LLM coach enabled for this tab.')
    } catch (error) {
      setFailed(true)
      setNotice((error as Error).message)
    }
  }

  return <details className="panel section-pad coach-settings">
    <summary><KeyRound size={16} /> Coach settings <span className="badge subtle">{isBuiltIn ? 'Built-in Gemini' : isCustom ? 'Custom LLM' : 'Rule-based'}</span></summary>
    {builtInAvailable && <>
      <p className="muted">Built-in Gemini sends relevant positions, analysis, and your questions to Google. The host’s API key never reaches your browser.</p>
      {!isCustom && <button type="button" className="button secondary full" onClick={onToggleBuiltIn}>
        {isBuiltIn ? 'Use rule-based coach' : 'Use built-in Gemini'}
      </button>}
    </>}
    <p className="muted">You can also connect your own provider. It receives the same chess information, and requests may incur charges. Your API key stays in this tab’s memory and is erased on reload; only your provider settings are saved.</p>
    <form onSubmit={save}>
      <label className="field-label" htmlFor="coach-provider">Provider</label>
      <select id="coach-provider" value={draft.provider} onChange={event => {
        const provider = event.target.value === 'anthropic' ? 'anthropic' : 'openai'
        setDraft({ ...draft, provider, model: provider === 'anthropic' ? 'claude-sonnet-4-5' : 'gpt-4o-mini' })
      }}>
        <option value="openai">OpenAI-compatible</option>
        <option value="anthropic">Anthropic</option>
      </select>
      {draft.provider === 'openai' && <>
        <label className="field-label" htmlFor="coach-url">API base URL</label>
        <input id="coach-url" value={draft.baseUrl} onChange={event => setDraft({ ...draft, baseUrl: event.target.value })} required />
      </>}
      <label className="field-label" htmlFor="coach-model">Model</label>
      <input id="coach-model" value={draft.model} onChange={event => setDraft({ ...draft, model: event.target.value })} required />
      <label className="field-label" htmlFor="coach-key">API key</label>
      <input id="coach-key" type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={event => setApiKey(event.target.value)} required />
      <button className="button primary full">Enable custom provider</button>
      {isCustom && <button type="button" className="button secondary full" onClick={() => {
        onDisconnect(); setApiKey(''); setFailed(false); setNotice('Custom provider disconnected.')
      }}>Disconnect</button>}
      {notice && <p className={`notice ${failed ? 'error' : ''}`} role="status">{notice}</p>}
    </form>
  </details>
}
