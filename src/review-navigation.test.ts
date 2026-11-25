import { expect, it, vi } from 'vitest'
import { listenForReviewNavigation } from './review-navigation'

it('consumes mouse side buttons and steps once per click until unsubscribed', () => {
  const target = new EventTarget()
  const step = vi.fn()
  const remove = listenForReviewNavigation(target, step)
  const dispatch = (type: string, button: number) =>
    target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { button }))

  expect(dispatch('mouseup', 0)).toBe(true)
  expect(dispatch('mousedown', 3)).toBe(false)
  expect(dispatch('mousedown', 4)).toBe(false)
  expect(step).not.toHaveBeenCalled()
  expect(dispatch('mouseup', 4)).toBe(false)
  expect(dispatch('auxclick', 4)).toBe(false)
  expect(dispatch('mouseup', 3)).toBe(false)
  expect(dispatch('auxclick', 3)).toBe(false)
  expect(step.mock.calls).toEqual([[1], [-1]])
  remove()
  expect(dispatch('mouseup', 4)).toBe(true)
  expect(step).toHaveBeenCalledTimes(2)
})

it('steps with unmodified arrow keys without taking over text entry', () => {
  const target = Object.assign(new EventTarget(), { isContentEditable: false })
  const step = vi.fn()
  const remove = listenForReviewNavigation(target, step)
  const dispatch = (key: string, modifiers?: KeyboardEventInit) =>
    target.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key, ...modifiers }))

  expect(dispatch('ArrowRight')).toBe(false)
  expect(dispatch('ArrowLeft')).toBe(false)
  expect(dispatch('ArrowLeft', { altKey: true })).toBe(true)
  target.isContentEditable = true
  expect(dispatch('ArrowRight')).toBe(true)
  expect(step.mock.calls).toEqual([[1], [-1]])
  remove()
})
