import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { App } from './App'

it('links to the public source repository in a new tab', () => {
  vi.stubGlobal('window', { location: { hash: '' } })
  try {
    const html = renderToStaticMarkup(<App />)
    expect(html).toMatch(/<footer>.*<a href="https:\/\/github\.com\/Hash-Noone\/chess_coach" target="_blank" rel="noopener">.* Source<\/a><\/footer>/)
  } finally {
    vi.unstubAllGlobals()
  }
})
