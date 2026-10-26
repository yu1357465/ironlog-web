import { useEffect, useRef, useState, type PointerEvent } from 'react'

/**
 * Pointer-based drag-to-reorder for vertical lists (works with mouse and touch, unlike HTML5 drag & drop).
 * Attach `handleProps(id)` to a drag handle and `itemRef(id)` to each row.
 */
export function useReorder<T>(items: T[], getId: (t: T) => number, onCommit: (ids: number[]) => void) {
  const [order, setOrder] = useState(items)
  const [dragging, setDragging] = useState<number | null>(null)
  const rows = useRef(new Map<number, HTMLElement>())
  const latest = useRef(order)
  latest.current = order

  // Follow server data, except while a drag is in progress.
  useEffect(() => { if (dragging === null) setOrder(items) }, [items, dragging])

  const onPointerMove = (e: PointerEvent) => {
    if (dragging === null) return
    const list = latest.current
    const from = list.findIndex(i => getId(i) === dragging)
    let to = from
    list.forEach((item, idx) => {
      const el = rows.current.get(getId(item))
      if (!el || idx === from) return
      const r = el.getBoundingClientRect()
      const mid = r.top + r.height / 2
      if (idx < from && e.clientY < mid) to = Math.min(to, idx)
      if (idx > from && e.clientY > mid) to = Math.max(to, idx)
    })
    if (to !== from) {
      const next = [...list]
      next.splice(to, 0, next.splice(from, 1)[0])
      setOrder(next)
      navigator.vibrate?.(8)
    }
  }

  const end = () => {
    if (dragging === null) return
    const before = items.map(getId).join()
    const after = latest.current.map(getId)
    setDragging(null)
    if (after.join() !== before) onCommit(after)
  }

  return {
    order,
    dragging,
    itemRef: (id: number) => (el: HTMLElement | null) => { if (el) rows.current.set(id, el); else rows.current.delete(id) },
    handleProps: (id: number) => ({
      onPointerDown: (e: PointerEvent) => {
        e.preventDefault()
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        setDragging(id)
      },
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
      style: { touchAction: 'none' as const, cursor: 'grab' },
    }),
  }
}
