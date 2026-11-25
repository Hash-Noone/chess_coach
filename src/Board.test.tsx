import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { Analysis, initialReview } from './Analysis'
import { library } from './games'
import { loadCoachSettings } from './llm'
import { Play } from './Play'

it('renders distinct Play and Review boards, with Review pieces at the selected ply', () => {
  const noop = () => {}
  const html = renderToStaticMarkup(<>
    <div hidden><Play active={false} onReview={noop} /></div>
    <Analysis active selected={library.find(game => game.id === 'fools-mate')!} onLibrary={noop}
      state={{ ...initialReview, selection: { ply: 3 } }} update={noop}
      level="beginner" onLevel={noop} settings={loadCoachSettings()} onConnect={noop} onDisconnect={noop} />
  </>)
  const squareIds = [...html.matchAll(/id="([^"]+-square-[a-h][1-8])"/g)].map(match => match[1])
  expect(squareIds).toHaveLength(128)
  expect(new Set(squareIds).size).toBe(128)
  expect(html).toContain('id="play-board-piece-wP-g2"')
  expect(html).toContain('id="review-board-piece-wP-g4"')
  expect(html).toContain('id="review-board-piece-wP-f3"')
  expect(html).toContain('id="review-board-piece-bP-e5"')
  expect(html).not.toContain('id="review-board-piece-wP-g2"')
})
