import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const source = 'node_modules/stockfish/bin'
const target = 'public/engine'
const engineFiles = readdirSync(source).filter(name => /^stockfish-.*lite-single(?:-.*)?\.(?:js|wasm)$/.test(name))
const worker = engineFiles.find(name => name.endsWith('.js'))
if (!worker || !engineFiles.some(name => name.endsWith('.wasm'))) throw new Error('Stockfish lite single-threaded build not found')

mkdirSync(target, { recursive: true })
for (const name of engineFiles) copyFileSync(join(source, name), join(target, name))
copyFileSync('node_modules/stockfish/Copying.txt', join(target, 'COPYING.txt'))
