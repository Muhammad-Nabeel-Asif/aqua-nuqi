import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToastStore } from './Toast'

describe('toast store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useToastStore.getState().clearAll()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('auto-dismisses success toasts', () => {
    useToastStore.getState().push({ title: 'Saved', variant: 'success' })

    expect(useToastStore.getState().items).toHaveLength(1)
    vi.advanceTimersByTime(2_000)
    expect(useToastStore.getState().items).toHaveLength(0)
  })

  it('keeps error toasts until they are explicitly cleared', () => {
    useToastStore.getState().push({ title: 'Failed', variant: 'error' })

    vi.advanceTimersByTime(10_000)
    expect(useToastStore.getState().items).toHaveLength(1)

    useToastStore.getState().dismiss(useToastStore.getState().items[0]!.id)
    expect(useToastStore.getState().items).toHaveLength(0)
  })

  it('clears errors without removing success feedback', () => {
    useToastStore.getState().push({ title: 'Saved', variant: 'success' })
    useToastStore.getState().push({ title: 'Failed', variant: 'error' })

    useToastStore.getState().clearErrors()

    expect(useToastStore.getState().items.map((item) => item.title)).toEqual(['Saved'])
  })

  it('clears all notifications for session transitions', () => {
    useToastStore.getState().push({ title: 'Saved', variant: 'success' })
    useToastStore.getState().push({ title: 'Failed', variant: 'error' })

    useToastStore.getState().clearAll()

    expect(useToastStore.getState().items).toEqual([])
  })
})
