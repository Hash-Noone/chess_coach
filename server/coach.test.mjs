import { createServer } from 'node:http'
import { expect, it, vi } from 'vitest'
import { createCoachHandler } from './coach.mjs'

const testKey = 'unit-test-server-key'
const prompt = { system: 'Use only the engine facts.', user: 'Explain d4.' }

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
      send: (body = prompt) => fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    })
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

it('reports availability and sends grounded prompts with the key only in Anthropic headers', async () => {
  const fetchUpstream = vi.fn().mockResolvedValue(Response.json({ content: [{ type: 'text', text: 'Take the center.' }] }))
  await withCoach({ apiKey: testKey, model: 'claude-configured', fetchUpstream }, async ({ status, send }) => {
    expect(await (await status()).json()).toEqual({ available: true })
    expect(await (await send()).json()).toEqual({ answer: 'Take the center.' })
    expect(fetchUpstream).toHaveBeenCalledOnce()
    const [url, request] = fetchUpstream.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(request.headers['x-api-key']).toBe(testKey)
    expect(request.redirect).toBe('error')
    expect(JSON.parse(request.body)).toMatchObject({
      model: 'claude-configured', system: prompt.system, messages: [{ role: 'user', content: prompt.user }],
    })
    expect(request.body).not.toContain(testKey)
  })
})

it('does not call Anthropic when no key is configured', async () => {
  const fetchUpstream = vi.fn()
  await withCoach({ apiKey: '', fetchUpstream }, async ({ status, send }) => {
    expect(await (await status()).json()).toEqual({ available: false })
    expect((await send()).status).toBe(503)
    expect(fetchUpstream).not.toHaveBeenCalled()
  })
})

it('returns the same safe fallback on upstream errors and accidental credential echoes', async () => {
  const fetchUpstream = vi.fn()
    .mockResolvedValueOnce(new Response(testKey, { status: 401 }))
    .mockResolvedValueOnce(Response.json({ content: [{ type: 'text', text: testKey }] }))
  await withCoach({ apiKey: testKey, fetchUpstream }, async ({ send }) => {
    for (const _ of [0, 1]) {
      const response = await send()
      expect(response.status).toBe(502)
      expect(await response.json()).toEqual({ error: 'Built-in coach unavailable.' })
    }
  })
})

it('rejects oversized bodies and caps upstream requests per client', async () => {
  const fetchUpstream = vi.fn(() => Response.json({ content: [{ type: 'text', text: 'Take the center.' }] }))
  await withCoach({ apiKey: testKey, fetchUpstream }, async ({ send }) => {
    expect((await send({ ...prompt, user: 'x'.repeat(33 * 1024) })).status).toBe(413)
    expect(fetchUpstream).not.toHaveBeenCalled()
    for (let i = 0; i < 14; i++) expect((await send()).status).toBe(200)
    expect((await send()).status).toBe(429)
    expect(fetchUpstream).toHaveBeenCalledTimes(14)
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
