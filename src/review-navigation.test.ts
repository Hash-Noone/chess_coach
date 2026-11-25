import { expect, it, vi } from 'vitest'
import { listenForReviewForward } from './review-navigation'

it('consumes the mouse Forward button and advances once per click until unsubscribed', () => {
  const target = new EventTarget()
  const advance = vi.fn()
  const remove = listenForReviewForward(target, advance)
  const dispatch = (type: string, button: number) =>
    target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { button }))

  expect(dispatch('mouseup', 3)).toBe(true)
  expect(dispatch('mousedown', 4)).toBe(false)
  expect(advance).not.toHaveBeenCalled()
  expect(dispatch('mouseup', 4)).toBe(false)
  expect(dispatch('auxclick', 4)).toBe(false)
  expect(advance).toHaveBeenCalledOnce()
  remove()
  expect(dispatch('mouseup', 4)).toBe(true)
  expect(advance).toHaveBeenCalledOnce()
})
