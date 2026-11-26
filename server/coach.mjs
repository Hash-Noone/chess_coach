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
const geminiStatuses = new Set(['INVALID_ARGUMENT', 'FAILED_PRECONDITION', 'PERMISSION_DENIED', 'UNAUTHENTICATED', 'NOT_FOUND', 'RESOURCE_EXHAUSTED', 'INTERNAL', 'UNAVAILABLE', 'DEADLINE_EXCEEDED', 'CANCELLED', 'UNKNOWN'])
const finishReasons = new Set(['STOP', 'MAX_TOKENS', 'SAFETY', 'RECITATION', 'LANGUAGE', 'OTHER', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'MALFORMED_FUNCTION_CALL', 'UNEXPECTED_TOOL_CALL', 'TOO_MANY_TOOL_CALLS'])
const blockReasons = new Set(['SAFETY', 'OTHER', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'IMAGE_SAFETY', 'JAILBREAK'])
const networkCodes = new Set(['ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN', 'ENOTFOUND', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'])
const errorNames = new Set(['Error', 'TypeError', 'SyntaxError', 'AbortError', 'TimeoutError', 'AggregateError'])

function known(value, values) {
  return typeof value !== 'string' ? undefined : values.has(value) ? value : 'OTHER'
}

function geminiMessageCategory(message) {
  if (typeof message !== 'string') return
  if (/quota|rate limit/i.test(message)) return 'quota or rate limit'
  if (/overloaded|high demand|capacity/i.test(message)) return 'provider capacity'
  if (/api key|credential/i.test(message)) return 'API credential error'
  if (/deadline|timed? out|timeout/i.test(message)) return 'provider timeout'
  if (/not found|not supported/i.test(message)) return 'resource not found or unsupported'
  return 'details withheld'
}

function retryAfterMs(value) {
  const header = value?.trim()
  if (!header) return 0
  if (/^\d+$/.test(header)) return Number(header) * 1000
  return Math.max(0, Date.parse(header) - Date.now()) || 0
}

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
  timeoutMs = 30_000,
  attemptTimeoutMs = 15_000,
  publicOrigin = process.env.COACH_ORIGIN?.trim(),
  dailyLimit = Number(process.env.COACH_MAX_REQUESTS_PER_DAY),
} = {}) {
  const expectedOrigin = publicOrigin && new URL(publicOrigin).origin
  const loggedModel = /^gemini-[a-z0-9.-]+$/i.test(model) && !model.includes(apiKey) ? model : '(custom model)'
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
      const started = performance.now()
      const deadline = started + timeoutMs
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
        redirect: 'error',
      }
      let retryAfter = 0
      const logFailure = (attempt, start, fields) => {
        console.warn('[Gemini coach] ' + JSON.stringify({
          attempt: attempt + 1,
          model: loggedModel,
          elapsedMs: Math.round(performance.now() - start),
          ...fields,
        }))
      }
      const errorFields = (error, attemptSignal = signal) => ({
        errorName: known(error?.name, errorNames),
        networkCode: known(error?.cause?.code ?? error?.code, networkCodes),
        abortReason: controller.signal.aborted ? 'client disconnected'
          : signal.aborted ? 'coach deadline exceeded'
          : attemptSignal.aborted ? 'Gemini attempt deadline exceeded'
          : undefined,
      })
      for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
        if (attempt > 0) {
          const now = performance.now()
          const waitMs = Math.ceil(Math.max(retryDelays[attempt - 1], retryAfter - now))
          if (retryAfter && now + waitMs >= deadline) break
          try {
            await delay(waitMs, undefined, { signal })
          } catch (error) {
            logFailure(attempt - 1, started, { failure: 'retry wait aborted', ...errorFields(error) })
            throw error
          }
          retryAfter = 0
          signal.throwIfAborted()
          if (!takeDailyRequest()) break
        }
        const start = performance.now()
        const attemptSignal = deadline - start > attemptTimeoutMs
          ? AbortSignal.any([signal, AbortSignal.timeout(attemptTimeoutMs)])
          : signal
        let response
        try {
          response = await fetchUpstream(url, { ...request, signal: attemptSignal })
        } catch (error) {
          logFailure(attempt, start, { failure: 'transport', ...errorFields(error, attemptSignal) })
          signal.throwIfAborted()
          continue
        }
        if (!response.ok) {
          if (response.status === 429) {
            retryAfter = performance.now() + retryAfterMs(response.headers.get('Retry-After'))
          }
          let error
          let readError
          try {
            error = (await response.json())?.error
          } catch (reason) {
            readError = reason
          }
          logFailure(attempt, start, {
            failure: 'http',
            httpStatus: response.status,
            geminiCode: Number.isInteger(error?.code) && error.code >= 100 && error.code < 600 ? error.code : undefined,
            geminiStatus: known(error?.status, geminiStatuses),
            geminiMessageCategory: geminiMessageCategory(error?.message),
            ...(readError ? errorFields(readError, attemptSignal) : {}),
          })
          signal.throwIfAborted()
          if (!retryStatuses.has(response.status)) break
          continue
        }
        let data
        try {
          data = await response.json()
        } catch (error) {
          logFailure(attempt, start, { failure: 'response parse', httpStatus: response.status, ...errorFields(error, attemptSignal) })
          signal.throwIfAborted()
          if (!attemptSignal.aborted && !(error instanceof TypeError)) throw error
          continue
        }
        const candidate = data?.candidates?.[0]
        const parts = candidate?.content?.parts
        const answer = Array.isArray(parts) ? parts
          .filter(part => !part?.thought && typeof part?.text === 'string')
          .map(part => part.text).join('\n').trim() : ''
        if (!answer || answer.includes(apiKey)) {
          logFailure(attempt, start, {
            failure: answer ? 'credential echo' : 'no answer',
            httpStatus: response.status,
            finishReason: known(candidate?.finishReason, finishReasons),
            blockReason: known(data?.promptFeedback?.blockReason, blockReasons),
            thoughtTokens: Number.isSafeInteger(data?.usageMetadata?.thoughtsTokenCount) ? data.usageMetadata.thoughtsTokenCount : undefined,
          })
          break
        }
        if (!res.destroyed) json(res, 200, { answer })
        return
      }
      if (!res.destroyed) json(res, 502, { error: 'Built-in coach unavailable.' })
    } catch {
      if (!res.destroyed) json(res, 502, { error: 'Built-in coach unavailable.' })
    } finally {
      res.off('close', disconnect)
    }
  }
}
