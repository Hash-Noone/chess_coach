const maxBodyBytes = 32 * 1024
const rateWindowMs = 60_000
const requestsPerWindow = 15

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
  model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash',
  fetchUpstream = globalThis.fetch,
  timeoutMs = 15_000,
} = {}) {
  const requests = new Map()
  let resetAt = 0
  return async function coach(req, res, next) {
    const path = req.url?.split('?')[0]
    if (path !== '/api/coach' && path !== '/api/coach/status') return next()
    if (path === '/api/coach/status') {
      if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' })
      return json(res, 200, { available: Boolean(apiKey) })
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' })
    if (!apiKey) return json(res, 503, { error: 'Built-in coach unavailable.' })
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

    const controller = new AbortController()
    const disconnect = () => controller.abort()
    res.once('close', disconnect)
    try {
      const response = await fetchUpstream(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: prompt.system }] },
          contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
          generationConfig: {
            maxOutputTokens: 450,
            ...(model === 'gemini-2.5-flash' ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]),
        redirect: 'error',
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw new Error()
      }
      const data = await response.json()
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
