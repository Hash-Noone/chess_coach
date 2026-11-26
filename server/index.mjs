import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { createCoachHandler } from './coach.mjs'

const root = fileURLToPath(new URL('../dist', import.meta.url))
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
}
const coach = createCoachHandler()

async function serve(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end()
    return
  }
  try {
    const path = decodeURIComponent(req.url.split('?')[0])
    const file = resolve(root, path === '/' ? 'index.html' : '.' + path)
    if (!file.startsWith(root + sep)) throw new Error()
    const info = await stat(file)
    if (!info.isFile()) throw new Error()
    res.writeHead(200, {
      'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
      'Content-Length': info.size,
    })
    if (req.method === 'HEAD') res.end()
    else pipeline(createReadStream(file), res, () => {})
  } catch {
    res.writeHead(404).end('Not found')
  }
}

const port = Number(process.env.PORT ?? 5173)
createServer({ requestTimeout: 20_000 }, (req, res) => {
  void coach(req, res, () => void serve(req, res))
}).listen(port, process.env.HOST ?? '0.0.0.0', function () {
  console.log(`Chess Coach listening on port ${this.address().port}`)
})
