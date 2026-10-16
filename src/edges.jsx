import { BaseEdge, Position, useInternalNode } from '@xyflow/react'
import { useContext } from 'react'
import { CommCtx, SettingsCtx } from './shared.js'

// Edge that leaves each node on the side facing the other node, so lines look natural wherever nodes sit.
export function FloatingEdge({ id, source, target, markerEnd, style }) {
  const { eff } = useContext(SettingsCtx)
  const sagK = eff.edgeSag // hooks stay above any early return: fixed order
  const pairs = useContext(CommCtx)
  const talking = eff.commHighlight && pairs.has([source, target].sort().join('|'))
  const s = useInternalNode(source)
  const t = useInternalNode(target)
  if (!s?.measured?.width || !t?.measured?.width) return null
  const box = (n) => ({ x: n.internals.positionAbsolute.x, y: n.internals.positionAbsolute.y, w: n.measured.width, h: n.measured.height })
  const edgePoint = (a, b) => {
    const cx = a.x + a.w / 2, cy = a.y + a.h / 2
    const dx = b.x + b.w / 2 - cx, dy = b.y + b.h / 2 - cy
    const horizontal = Math.abs(dx) / a.w > Math.abs(dy) / a.h
    const k = 0.5 / Math.max(Math.abs(dx) / a.w, Math.abs(dy) / a.h || 1e-6)
    const pos = horizontal ? (dx > 0 ? Position.Right : Position.Left) : dy > 0 ? Position.Bottom : Position.Top
    return { x: cx + dx * k, y: cy + dy * k, pos }
  }
  const a = box(s), b = box(t)
  const p1 = edgePoint(a, b), p2 = edgePoint(b, a)
  // Hanging rope: both control points are pulled down by "gravity"; longer span = deeper sag.
  const dx = p2.x - p1.x, dy = p2.y - p1.y
  const sag = Math.min(220, 30 + Math.hypot(dx, dy) * 0.28) * sagK
  const drop = sag * 1.33 // cubic midpoint sits at 0.75 of the control offset
  const path = `M ${p1.x},${p1.y} C ${p1.x + dx * 0.12},${p1.y + drop} ${p2.x - dx * 0.12},${p2.y + drop} ${p2.x},${p2.y}`
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} className={talking ? 'comm' : undefined} interactionWidth={28} />
}
export const edgeTypes = { floating: FloatingEdge }
