import { setTimeout as delay } from 'node:timers/promises'

const maxBodyBytes = 32 * 1024
const maxPromptBytes = 16 * 1024
const maxOutputTokens = 450
const dayMs = 86_400_000
const defaultDailyLimit = 100
const rateWindowMs = 60_000
const requestsPerWindow = 15
const retryStatuses = new Set([429, 500, 502, 503, 504])
const retryDelays = [200, 400]

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}

async function readPrompt(req) {
  if (Number(req.headers['content-length']) > maxBodyBytes) return
  const chunks = []
  let size = 0
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length
    if (size > maxBodyBytes) return
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function createCoachHandler({
  apiKey = process.env.GEMINI_API_KEY?.trim() || '',
  model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite',
  fetchUpstream = globalThis.fetch,
  timeoutMs = 15_000,
  publicOrigin = process.env.COACH_ORIGIN?.trim(),
  dailyLimit = Number(process.env.COACH_MAX_REQUESTS_PER_DAY),
} = {}) {
  const expectedOrigin = publicOrigin && new URL(publicOrigin).origin
  const maxDailyRequests = Number.isSafeInteger(dailyLimit) && dailyLimit > 0 ? dailyLimit : defaultDailyLimit
  const requests = new Map()
  let resetAt = 0
  let quotaDay = -1
  let dailyRequests = 0

  function takeDailyRequest() {
    const day = Math.floor(Date.now() / dayMs)
    if (day !== quotaDay) {
      quotaDay = day
      dailyRequests = 0
    }
    if (dailyRequests >= maxDailyRequests) return false
    dailyRequests++
    return true
  }

  return async function coach(req, res, next) {
    const path = req.url?.split('?')[0]
    if (path !== '/api/coach' && path !== '/api/coach/status') return next()
    if (path === '/api/coach/status') {
      if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' })
      return json(res, 200, { available: Boolean(apiKey) })
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' })
    if (!apiKey) return json(res, 503, { error: 'Built-in coach unavailable.' })
    const origin = expectedOrigin || `${req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`
    if (req.headers.origin !== origin || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) {
      return json(res, 403, { error: 'Coaching requests must come from the app origin.' })
    }
    if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return json(res, 415, { error: 'Expected a JSON coaching prompt.' })
    }

    const now = Date.now()
    if (now >= resetAt) {
      requests.clear()
      resetAt = now + rateWindowMs
    }
    const ip = req.socket.remoteAddress
    const count = requests.get(ip) ?? 0
    if (count >= requestsPerWindow) return json(res, 429, { error: 'Too many coaching requests.' })
    requests.set(ip, count + 1)

    let prompt
    try {
      prompt = await readPrompt(req)
    } catch {
      return json(res, 400, { error: 'Invalid coaching prompt.' })
    }
    if (prompt === undefined) {
      req.resume()
      return json(res, 413, { error: 'Coaching prompt is too large.' })
    }
    if (typeof prompt?.system !== 'string' || !prompt.system.trim() || typeof prompt?.user !== 'string' || !prompt.user.trim()) {
      return json(res, 400, { error: 'Invalid coaching prompt.' })
    }
    if (Buffer.byteLength(prompt.system) + Buffer.byteLength(prompt.user) > maxPromptBytes) {
      return json(res, 413, { error: 'Coaching prompt is too large.' })
    }

    if (!takeDailyRequest()) return json(res, 429, { error: 'Daily coaching quota reached.' })

    const controller = new AbortController()
    const disconnect = () => controller.abort()
    res.once('close', disconnect)
    try {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)])
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
      const request = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: prompt.system }] },
          contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
          generationConfig: {
            maxOutputTokens,
            ...(model === 'gemini-2.5-flash' ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        }),
        signal,
        redirect: 'error',
      }
      let data
      for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
        if (attempt > 0) {
          await delay(retryDelays[attempt - 1], undefined, { signal })
          signal.throwIfAborted()
          if (!takeDailyRequest()) break
        }
        let response
        try {
          response = await fetchUpstream(url, request)
        } catch {
          signal.throwIfAborted()
          continue
        }
        if (!response.ok) {
          await response.body?.cancel()
          if (!retryStatuses.has(response.status)) break
          continue
        }
        try {
          data = await response.json()
          break
        } catch (error) {
          if (!(error instanceof TypeError)) throw error
          signal.throwIfAborted()
        }
      }
      const parts = data?.candidates?.[0]?.content?.parts
      const answer = Array.isArray(parts) ? parts
        .filter(part => !part?.thought && typeof part?.text === 'string')
        .map(part => part.text).join('\n').trim() : ''
      if (!answer || answer.includes(apiKey)) throw new Error()
      if (!res.destroyed) json(res, 200, { answer })
    } catch {
      if (!res.destroyed) json(res, 502, { error: 'Built-in coach unavailable.' })
    } finally {
      res.off('close', disconnect)
    }
  }
}
