import { renderToStaticMarkup } from 'react-dom/server'
import { DEFAULT_POSITION } from 'chess.js'
import { expect, it } from 'vitest'
import { Analysis, initialReview } from './Analysis'
import { Board } from './Board'
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

it('keeps the white share on board flip and labels a previous position score', () => {
  const render = (orientation: 'w' | 'b', previousEvaluation = false) => renderToStaticMarkup(
    <Board id="test-board" fen={DEFAULT_POSITION} orientation={orientation} bottomName="Bottom" topName="Top"
      evaluation={{ cp: -1580, pv: [] }} previousEvaluation={previousEvaluation} onFlip={() => {}} />,
  )
  const white = render('w')
  const black = render('b', true)
  expect(white).toContain('aria-label="White evaluation: −15.8"')
  expect(black).toContain('aria-label="Last White evaluation (previous position): −15.8"')
  expect(white).toContain('class="eval-fill" style="transform:scaleY(0.04)"')
  expect(black).toContain('class="eval-fill" style="transform:scaleY(0.04)"')
  expect(white).toContain('class="eval-value favor-black ">−15.8<')
  expect(black).toContain('class="eval-value favor-black at-bottom">−15.8*<')
})
