import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { Chess } from 'chess.js'
import { rolldown } from 'rolldown'

const bundle = await rolldown({ input: './src/learned-search.ts', platform: 'node' })
const [{ code }] = (await bundle.generate({ format: 'es' })).output
const { search, openingMove } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
await bundle.close()
const evalBundle = await rolldown({ input: './src/learned-evaluation.ts', platform: 'node' })
const [{ code: evalCode }] = (await evalBundle.generate({ format: 'es' })).output
const { decodeModel } = await import('data:text/javascript;base64,' + Buffer.from(evalCode).toString('base64'))
await evalBundle.close()

const evaluate = decodeModel(Uint8Array.from(await readFile('public/lichess-engine/model.bin')).buffer)
const book = JSON.parse(await readFile('public/lichess-engine/book.json', 'utf8'))
let seed = 7331
function random() {
  seed = (1664525 * seed + 1013904223) >>> 0
  return seed / 4294967296
}

const cpu = spawn(process.execPath, ['node_modules/stockfish/bin/stockfish-18-lite-single.js'])
const lines = createInterface({ input: cpu.stdout })
function command(input, pattern) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      lines.off('line', scan)
      reject(new Error('Stockfish took too long: ' + input))
    }, 10000)
    function scan(line) {
      const match = line.trim().match(pattern)
      if (!match) return
      clearTimeout(timeout)
      lines.off('line', scan)
      resolve(match[1])
    }
    lines.on('line', scan)
    cpu.stdin.write(input + '\n')
  })
}

async function match(side, opponent, maxPlies) {
  const board = new Chess()
  for (let ply = 0; ply < maxPlies && !board.isGameOver(); ply++) {
    const moves = board.moves({ verbose: true })
    let move
    if (board.turn() === side) {
      move = (ply < 10 && openingMove(board, book, random)) || search(board, evaluate, { depth: 4, nodes: 2800, timeMs: 200 }).bestMove
    } else if (opponent === 'random') {
      move = moves[Math.floor(random() * moves.length)].lan
    } else {
      const history = board.history({ verbose: true }).map(move => move.lan).join(' ')
      move = await command(`position startpos${history ? ' moves ' + history : ''}\ngo depth 5`, /^bestmove (\S+)/)
    }
    board.move(move)
  }
  let whiteMaterial = 0
  for (const piece of board.board().flat()) {
    if (piece) whiteMaterial += (piece.color === 'w' ? 1 : -1) * { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }[piece.type]
  }
  const result = board.isCheckmate() ? (board.turn() === side ? 'loss by mate' : 'win by mate') : board.isDraw() ? 'draw' : 'unfinished'
  console.log(`${side === 'w' ? 'White' : 'Black'} vs ${opponent}: ${result} at ply ${board.history().length}; trained engine material margin ${whiteMaterial * (side === 'w' ? 1 : -1)}`)
  console.log(`  First 12 plies: ${board.history().slice(0, 12).join(' ')}`)
}

try {
  await command('uci', /^uciok$/)
  cpu.stdin.write('setoption name Skill Level value 0\n')
  await command('isready', /^readyok$/)
  await match('w', 'random', 120)
  await match('b', 'random', 120)
  await match('w', 'Stockfish skill 0', 90)
  await command('ucinewgame\nisready', /^readyok$/)
  await match('b', 'Stockfish skill 0', 90)
} finally {
  cpu.stdin.end('quit\n')
  lines.close()
}
