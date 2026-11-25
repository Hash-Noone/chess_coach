export type Mode = 'play' | 'library' | 'coach'
export type Route = { mode: 'play' | 'library' } | { mode: 'coach'; gameId?: string }

export function readRoute(hash: string): Route {
  if (hash === '#library') return { mode: 'library' }
  if (hash === '#coach') return { mode: 'coach' }
  const match = /^#coach\/([^/]+)$/.exec(hash)
  if (match) {
    try { return { mode: 'coach', gameId: decodeURIComponent(match[1]) } } catch { return { mode: 'coach' } }
  }
  return { mode: 'play' }
}

export function routeHash(route: Route) {
  return route.mode === 'coach' && route.gameId ? `#coach/${encodeURIComponent(route.gameId)}` : `#${route.mode}`
}
