import { createServer } from 'node:http'
import { expect, it, vi } from 'vitest'
import { createCoachHandler } from './coach.mjs'

const testKey = 'unit-test-server-key'
const prompt = { system: 'Use only the engine facts.', user: 'Explain d4.' }
const geminiReply = text => Response.json({ candidates: [{ content: { parts: [{ text }] } }] })

async function withCoach(options, run) {
  const handler = createCoachHandler(options)
  const server = createServer((req, res) => void handler(req, res, () => res.writeHead(404).end()))
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const url = `http://127.0.0.1:${server.address().port}/api/coach`
  try {
    await run({
      status: () => fetch(url + '/status'),
      send: (body = prompt, headers) => fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: new URL(url).origin, ...headers }, body: JSON.stringify(body),
      }),
    })
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

it('reports availability and sends grounded prompts with the key only in Gemini headers', async () => {
  const fetchUpstream = vi.fn().mockResolvedValue(geminiReply('Take the center.'))
  await withCoach({ apiKey: testKey, model: 'gemini-configured', fetchUpstream }, async ({ status, send }) => {
    expect(await (await status()).json()).toEqual({ available: true })
    expect(await (await send({ ...prompt, generationConfig: { maxOutputTokens: 100_000 } })).json()).toEqual({ answer: 'Take the center.' })
    expect(fetchUpstream).toHaveBeenCalledOnce()
    const [url, request] = fetchUpstream.mock.calls[0]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-configured:generateContent')
    expect(request.headers['x-goog-api-key']).toBe(testKey)
    expect(request.redirect).toBe('error')
    expect(JSON.parse(request.body)).toMatchObject({
      systemInstruction: { parts: [{ text: prompt.system }] },
      contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
      generationConfig: { maxOutputTokens: 450 },
    })
    expect(request.body).not.toContain(testKey)
  })
})

it('does not call Gemini when no key is configured', async () => {
  const fetchUpstream = vi.fn()
  await withCoach({ apiKey: '', fetchUpstream }, async ({ status, send }) => {
    expect(await (await status()).json()).toEqual({ available: false })
    expect((await send()).status).toBe(503)
    expect(fetchUpstream).not.toHaveBeenCalled()
  })
})

it('defaults to Gemini 3.1 Flash-Lite when no model override is configured', async () => {
  vi.stubEnv('GEMINI_MODEL', undefined)
  try {
    const fetchUpstream = vi.fn().mockResolvedValue(geminiReply('Take the center.'))
    await withCoach({ apiKey: testKey, fetchUpstream }, async ({ send }) => {
      expect((await send()).status).toBe(200)
      expect(fetchUpstream.mock.calls[0][0]).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent')
    })
  } finally {
    vi.unstubAllEnvs()
  }
})

it('returns the same safe fallback on upstream errors and accidental credential echoes', async () => {
  const fetchUpstream = vi.fn()
    .mockResolvedValueOnce(new Response(testKey, { status: 401 }))
    .mockResolvedValueOnce(geminiReply(testKey))
  await withCoach({ apiKey: testKey, fetchUpstream }, async ({ send }) => {
    for (const _ of [0, 1]) {
      const response = await send()
      expect(response.status).toBe(502)
      expect(await response.json()).toEqual({ error: 'Built-in coach unavailable.' })
    }
  })
})

it('rejects oversized bodies and caps upstream requests per client', async () => {
  const fetchUpstream = vi.fn(() => geminiReply('Take the center.'))
  await withCoach({ apiKey: testKey, fetchUpstream }, async ({ send }) => {
    expect((await send({ ...prompt, user: 'x'.repeat(33 * 1024) })).status).toBe(413)
    expect((await send({ ...prompt, user: 'é'.repeat(9 * 1024) })).status).toBe(413)
    expect(fetchUpstream).not.toHaveBeenCalled()
    for (let i = 0; i < 13; i++) expect((await send()).status).toBe(200)
    expect((await send()).status).toBe(429)
    expect(fetchUpstream).toHaveBeenCalledTimes(13)
  })
})

it('rejects missing and cross-site origins, including under a configured HTTPS origin', async () => {
  const fetchUpstream = vi.fn(() => geminiReply('Take the center.'))
  const publicOrigin = 'https://coach.example'
  await withCoach({ apiKey: testKey, publicOrigin, fetchUpstream }, async ({ send }) => {
    expect((await send()).status).toBe(403)
    expect((await send(prompt, { Origin: '' })).status).toBe(403)
    expect((await send(prompt, { Origin: publicOrigin, 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403)
    expect(fetchUpstream).not.toHaveBeenCalled()
    expect((await send(prompt, { Origin: publicOrigin, 'Sec-Fetch-Site': 'same-origin' })).status).toBe(200)
  })
})

it('shares the daily quota across requests and counts failed upstream attempts', async () => {
  const fetchUpstream = vi.fn(() => new Response(null, { status: 500 }))
  await withCoach({ apiKey: testKey, dailyLimit: 1, fetchUpstream }, async ({ send }) => {
    expect((await send()).status).toBe(502)
    const response = await send()
    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: 'Daily coaching quota reached.' })
    expect(fetchUpstream).toHaveBeenCalledOnce()
  })
})

it('times out an upstream request without returning its diagnostic', async () => {
  const fetchUpstream = vi.fn((_url, request) => new Promise((_, reject) => {
    request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true })
  }))
  await withCoach({ apiKey: testKey, fetchUpstream, timeoutMs: 5 }, async ({ send }) => {
    const response = await send()
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Built-in coach unavailable.' })
  })
})
