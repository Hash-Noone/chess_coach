export function listenForReviewNavigation(target: EventTarget, step: (direction: -1 | 1) => void) {
  const events = ['mousedown', 'mouseup', 'auxclick', 'keydown']
  const options = { capture: true }
  function handle(event: Event) {
    if (event.type === 'keydown') {
      const key = event as KeyboardEvent
      const focused = key.target as HTMLElement | null
      if (key.defaultPrevented || key.altKey || key.ctrlKey || key.metaKey || key.shiftKey || key.isComposing
        || focused?.isContentEditable || focused?.matches?.('input, textarea, select')) return
      if (key.key !== 'ArrowLeft' && key.key !== 'ArrowRight') return
      key.preventDefault()
      step(key.key === 'ArrowLeft' ? -1 : 1)
      return
    }
    const { button } = event as MouseEvent
    if (button !== 3 && button !== 4) return
    event.preventDefault()
    if (event.type === 'mouseup') step(button === 3 ? -1 : 1)
  }
  for (const type of events) target.addEventListener(type, handle, options)
  return () => {
    for (const type of events) target.removeEventListener(type, handle, options)
  }
}
