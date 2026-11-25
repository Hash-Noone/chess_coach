import { expect, it } from 'vitest'
import { readRoute, routeHash, type Route } from './routes'

it('restores a tab and the saved review from the URL hash', () => {
  const routes: Route[] = [{ mode: 'play' }, { mode: 'library' }, { mode: 'coach', gameId: 'lichess-HqjDTU4A' }]
  expect(routes.map(route => readRoute(routeHash(route)))).toEqual(routes)
  expect(readRoute('')).toEqual({ mode: 'play' })
  expect(readRoute('#coach/%ZZ')).toEqual({ mode: 'coach' })
})
