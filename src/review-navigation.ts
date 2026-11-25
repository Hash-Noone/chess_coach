export function listenForReviewForward(target: EventTarget, advance: () => void) {
  const events = ['mousedown', 'mouseup', 'auxclick']
  const options = { capture: true }
  function handle(event: Event) {
    if ((event as MouseEvent).button !== 4) return
    event.preventDefault()
    if (event.type === 'mouseup') advance()
  }
  for (const type of events) target.addEventListener(type, handle, options)
  return () => {
    for (const type of events) target.removeEventListener(type, handle, options)
  }
}
