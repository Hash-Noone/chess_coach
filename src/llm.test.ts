import { Chess } from 'chess.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reviewMove, summarize } from './coach'
import { moveFacts, movePrompt, providerUrl, questionPrompt, requestCoach, summaryPrompt, type CoachConnection } from './llm'

const connection: CoachConnection = { provider: 'openai', baseUrl: 'https://provider.example/v1/', model: 'example-model', apiKey: 'unit-test-only' }
const board = new Chess()
board.move('f3')
board.move('e5')
const played = board.move('g4')
const before = { cp: -92, bestMove: 'e2e4', pv: ['e2e4', 'g8f6'] }
const after = { cp: -10000, mate: -1, bestMove: 'd8h4', pv: ['d8h4'] }
const review = reviewMove(played, before, after)
const facts = moveFacts(played, review, before, after)

afterEach(() => vi.unstubAllGlobals())

describe('grounded coach prompts', () => {
  it('sends the legal SAN principal variations, FENs, and mate evidence to an OpenAI-compatible model', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: 'Moving g4 allows Qh4#.' } }] }))
    vi.stubGlobal('fetch', fetch)
    expect(await requestCoach(connection, movePrompt(facts))).toBe('Moving g4 allows Qh4#.')
    const [endpoint, request] = fetch.mock.calls[0]
    expect(endpoint).toBe('https://provider.example/v1/chat/completions')
    expect(request.headers.Authorization).toBe('Bearer unit-test-only')
    expect(request.redirect).toBe('error')
    const body = JSON.parse(request.body)
    expect(body.model).toBe('example-model')
    expect(body.messages[0].content).toContain('Do not invent variations')
    const payload = body.messages[1].content
    for (const entry of [played.before, played.after, 'g4', 'Blunder', 'Qh4#', '"principalVariationSAN":["e4","Nf6"]']) expect(payload).toContain(entry)
    expect(facts.evaluationAfter.mate).toMatchObject({ winningSide: 'Black', moves: 1 })
  })

  it('includes summary facts and sends position questions to Anthropic with explicit browser access', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ content: [{ type: 'text', text: 'Look at the h4 diagonal.' }] }))
    vi.stubGlobal('fetch', fetch)
    const recap = summaryPrompt(summarize([played], [review]), [facts])
    expect(recap.user).toContain('"practiceThemes"')
    expect(recap.user).toContain('"playedSAN":"g4"')
    const question = questionPrompt('How can Black mate?', played.after, after, facts)
    expect(await requestCoach({ ...connection, provider: 'anthropic' }, question)).toBe('Look at the h4 diagonal.')
    const [endpoint, request] = fetch.mock.calls[0]
    expect(endpoint).toBe('https://api.anthropic.com/v1/messages')
    expect(request.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
    const body = JSON.parse(request.body)
    expect(body.messages[0].content).toContain('"question":"How can Black mate?"')
    expect(body.messages[0].content).toContain(played.after)
  })

  it('rejects insecure remote endpoints and keeps provider response details private on failures', async () => {
    expect(() => providerUrl({ ...connection, baseUrl: 'http://provider.example/v1' })).toThrow('HTTPS')
    const fetch = vi.fn().mockResolvedValue(new Response('private diagnostic', { status: 401 }))
    vi.stubGlobal('fetch', fetch)
    await expect(requestCoach(connection, movePrompt(facts))).rejects.toThrow('rejected the API key')
  })
})
