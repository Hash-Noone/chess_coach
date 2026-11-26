import { useEffect, useRef, useState } from 'react'
import { Chess, type Color, type Move, type Square } from 'chess.js'
import { Chessboard, type ChessboardOptions } from 'react-chessboard'
import { ArrowUpDown, Crown } from 'lucide-react'
import { winChance } from './coach'
import type { Evaluation } from './engine'

type Props = {
  id: string
  fen: string
  orientation: Color
  bottomName: string
  topName: string
  showTurn?: boolean
  evaluation?: Evaluation
  previousEvaluation?: boolean
  highlight?: Pick<Move, 'from' | 'to'>
  arrow?: string
  animate?: boolean
  annotations?: { arrows: { from: Square; to: Square }[]; squares: Square[]; tone: 'move' | 'idea' | 'warning' | 'verdict' }
  canPlay?: boolean
  onMove?: (from: string, to: string, promotion?: string) => boolean
  onFlip: () => void
}

export function Board({ id, fen, orientation, bottomName, topName, showTurn, evaluation, previousEvaluation, highlight, arrow, animate = false, annotations, canPlay, onMove, onFlip }: Props) {
  const [selected, setSelected] = useState<{ fen: string; square: Square }>()
  const [pending, setPending] = useState<{ fen: string; from: string; to: string }>()
  const board = new Chess(fen)
  const active = canPlay && selected?.fen === fen ? selected.square : undefined
  const promotion = canPlay && pending?.fen === fen ? pending : undefined
  const legal = active ? board.moves({ square: active, verbose: true }) : []
  const squareStyles: ChessboardOptions['squareStyles'] = {}
  if (highlight) {
    squareStyles[highlight.from] = { backgroundColor: '#c1d67487' }
    squareStyles[highlight.to] = { backgroundColor: '#c1d674aa' }
  }
  const annotationColor = annotations?.tone === 'warning' ? '#ed987d' : annotations?.tone === 'idea' ? '#83cce0' : '#dfc477'
  for (const square of annotations?.squares ?? []) {
    squareStyles[square] = { ...squareStyles[square], boxShadow: `inset 0 0 0 4px ${annotationColor}` }
  }
  if (active) {
    squareStyles[active] = { backgroundColor: '#e8d173a8' }
    for (const move of legal) squareStyles[move.to] = {
      ...squareStyles[move.to], backgroundImage: move.captured
        ? 'radial-gradient(transparent 56%, #18291977 59%, #18291977 67%, transparent 70%)'
        : 'radial-gradient(#18291966 18%, transparent 20%)',
    }
  }

  function attempt(from: string, to: string) {
    const moves = board.moves({ square: from as Square, verbose: true }).filter(move => move.to === to)
    if (!moves.length) return false
    setSelected(undefined)
    if (moves[0].promotion) {
      setPending({ fen, from, to })
      return false
    }
    return onMove?.(from, to) ?? false
  }

  const whiteChance = evaluation ? Math.max(4, Math.min(96, winChance(evaluation.cp))) : 50
  const evalText = !evaluation ? '—' : evaluation.mate !== undefined ? (evaluation.mate === 0 ? 'Mate' : `M${Math.abs(evaluation.mate)}`)
    : `${evaluation.cp > 0 ? '+' : evaluation.cp < 0 ? '−' : ''}${(Math.abs(evaluation.cp) / 100).toFixed(1)}`
  const favorsBlack = (evaluation?.cp ?? 0) < 0
  const isPrevious = evaluation && previousEvaluation
  const evalLabel = !evaluation ? 'White evaluation unavailable'
    : isPrevious ? `Last White evaluation (previous position): ${evalText}` : `White evaluation: ${evalText}`

  return <section className="board-area" aria-label="Chess position">
    <div className="player top-player"><Crown size={16} /><span>{topName}</span><span className={`color-dot ${orientation === 'w' ? 'black' : 'white'}`} />
      {showTurn && board.turn() !== orientation && <small>To move</small>}
    </div>
    <div className="board-row">
      <div role="img" aria-label={evalLabel} title={evalLabel} className={`eval-bar ${orientation === 'w' ? 'white-bottom' : 'black-bottom'}`}>
        <div className="eval-fill" style={{ transform: `scaleY(${whiteChance / 100})` }} />
        <span className={`eval-value ${favorsBlack ? 'favor-black' : 'favor-white'} ${favorsBlack === (orientation === 'b') ? 'at-bottom' : ''}`}>{evalText}{isPrevious && '*'}</span>
      </div>
      <div className="board-frame">
        <Chessboard options={{
          id, position: fen, boardOrientation: orientation === 'w' ? 'white' : 'black',
          lightSquareStyle: { backgroundColor: '#dce3ce', color: '#455d49' },
          darkSquareStyle: { backgroundColor: '#68816a', color: '#edf0e4' },
          squareStyles, showAnimations: animate, animationDurationInMs: annotations ? 450 : 150, allowDragging: !!canPlay && !promotion,
          allowDrawingArrows: false, clearArrowsOnClick: false, clearArrowsOnPositionChange: false,
          arrows: annotations ? annotations.arrows.map(({ from, to }) => ({ startSquare: from, endSquare: to, color: annotationColor }))
            : arrow ? [{ startSquare: arrow.slice(0, 2), endSquare: arrow.slice(2, 4), color: '#dfad51' }] : [],
          canDragPiece: ({ piece }) => !!canPlay && piece.pieceType[0] === board.turn(),
          onPieceDrop: ({ sourceSquare, targetSquare }) => !!canPlay && !!targetSquare && attempt(sourceSquare, targetSquare),
          onSquareClick: ({ square }) => {
            if (!canPlay || promotion) return
            if (active && active !== square && legal.some(move => move.to === square)) { attempt(active, square); return }
            const piece = board.get(square as Square)
            setSelected(square !== active && piece?.color === board.turn() ? { fen, square: square as Square } : undefined)
          },
        }} />
        {promotion && <div className="promotion-overlay"><div className="promotion" role="dialog" aria-label="Promote pawn">
          <strong>Promote pawn</strong>
          <div>{[['q', 'Queen'], ['r', 'Rook'], ['b', 'Bishop'], ['n', 'Knight']].map(([piece, name]) =>
            <button key={piece} className="button secondary" onClick={() => { onMove?.(promotion.from, promotion.to, piece); setPending(undefined) }}>{name}</button>)}</div>
          <button className="link-button" onClick={() => setPending(undefined)}>Cancel</button>
        </div></div>}
      </div>
    </div>
    <div className="player bottom-player"><Crown size={16} /><span>{bottomName}</span><span className={`color-dot ${orientation === 'w' ? 'white' : 'black'}`} />
      {showTurn && board.turn() === orientation && <small>To move</small>}
      <button className="icon-button flip" title="Flip board" aria-label="Flip board" onClick={onFlip}><ArrowUpDown size={17} /></button>
    </div>
  </section>
}

export function gameLabel(game: Chess, human: Color, engineName: string) {
  if (game.isCheckmate()) return game.turn() === human ? `${engineName} wins by checkmate` : 'You win by checkmate!'
  if (game.isStalemate()) return 'Draw by stalemate'
  if (game.isInsufficientMaterial()) return 'Draw by insufficient material'
  if (game.isThreefoldRepetition()) return 'Draw by repetition'
  if (game.isDraw()) return 'Draw'
  return game.turn() === human ? (game.isCheck() ? 'Your king is in check' : 'Your turn to move') : `${engineName} is thinking…`
}

export function MoveTable({ moves, selection, onSelect, ratings }: {
  moves: Move[]
  selection?: { ply: number }
  onSelect?: (ply: number) => void
  ratings?: string[]
}) {
  const list = useRef<HTMLDivElement>(null)
  const active = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const item = active.current
    const container = list.current
    if (item && container) {
      const itemBounds = item.getBoundingClientRect()
      const listBounds = container.getBoundingClientRect()
      if (itemBounds.top < listBounds.top || itemBounds.bottom > listBounds.bottom) {
        const options = { block: 'nearest', container: 'nearest' } as const
        item.scrollIntoView(options)
      }
    }
  }, [selection])
  if (!moves.length) return <p className="empty-moves">The moves will appear here as the game progresses.</p>
  const rows: { number: number; w?: number; b?: number }[] = []
  moves.forEach((move, index) => {
    const number = Number(move.before.split(' ')[5])
    if (rows.at(-1)?.number !== number) rows.push({ number })
    rows.at(-1)![move.color] = index
  })
  const cell = (index?: number) => {
    if (index === undefined) return <span />
    const content = <>{moves[index].san}{ratings?.[index] && <i className={`rating-dot ${ratings[index].toLowerCase()}`} />}</>
    const selected = selection?.ply === index + 1
    return onSelect ? <button ref={selected ? active : undefined} className={`move ${selected ? 'current' : ''}`} aria-current={selected ? 'step' : undefined} onClick={() => onSelect(index + 1)}>{content}</button>
      : <span className="move">{content}</span>
  }
  return <div className="move-table" ref={list}>{rows.map(row =>
    <div className="move-row" key={row.number}><small>{row.number}.</small>{cell(row.w)}{cell(row.b)}</div>)}</div>
}
