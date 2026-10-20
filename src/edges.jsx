import { BaseEdge, Position, useInternalNode } from '@xyflow/react'
import { useContext, useEffect, useRef, useState } from 'react'
import { CommCtx, SettingsCtx } from './shared.js'

// Rope physics: the two control points chase their resting place like springs, so when a node is dragged the rope
// trails behind, swings and settles instead of staying rigid. Runs only while something moves.
const STIFF = 0.14, DAMP = 0.6, REST = 0.05 // close to critically damped: it trails and settles, it does not ring while you drag

// Edge that leaves each node on the side facing the other node, so lines look natural wherever nodes sit.
export function FloatingEdge({ id, source, target, markerEnd, style }) {
  const { eff } = useContext(SettingsCtx)
  const sagK = eff.edgeSag // hooks stay above any early return: fixed order
  const pairs = useContext(CommCtx)
  const talking = eff.commHighlight && pairs.has([source, target].sort().join('|'))
  const s = useInternalNode(source)
  const t = useInternalNode(target)
  const [, redraw] = useState(0)
  const sim = useRef(null) // { p: control points now [x1,y1,x2,y2], v: velocities, raf }
  const goal = useRef(null) // where the control points want to be
  const physics = eff.edgePhysics !== false

  const box = (n) => ({ x: n.internals.positionAbsolute.x, y: n.internals.positionAbsolute.y, w: n.measured.width, h: n.measured.height })
  const edgePoint = (a, b) => {
    const cx = a.x + a.w / 2, cy = a.y + a.h / 2
    const dx = b.x + b.w / 2 - cx, dy = b.y + b.h / 2 - cy
    const horizontal = Math.abs(dx) / a.w > Math.abs(dy) / a.h
    const k = 0.5 / Math.max(Math.abs(dx) / a.w, Math.abs(dy) / a.h || 1e-6)
    const pos = horizontal ? (dx > 0 ? Position.Right : Position.Left) : dy > 0 ? Position.Bottom : Position.Top
    return { x: cx + dx * k, y: cy + dy * k, pos }
  }
  let p1, p2, want = null
  if (s?.measured?.width && t?.measured?.width) {
    const a = box(s), b = box(t)
    p1 = edgePoint(a, b)
    p2 = edgePoint(b, a)
    // Hanging rope: both control points are pulled down by "gravity"; longer span = deeper sag.
    const dx = p2.x - p1.x, dy = p2.y - p1.y
    const sag = Math.min(220, 30 + Math.hypot(dx, dy) * 0.28) * sagK
    const drop = sag * 1.33 // cubic midpoint sits at 0.75 of the control offset
    want = [p1.x + dx * 0.12, p1.y + drop, p2.x - dx * 0.12, p2.y + drop]
  }
  goal.current = want
  const key = want ? want.join(',') : ''

  useEffect(() => {
    const g = goal.current
    if (!physics || !g) { sim.current = null; return }
    if (!sim.current) { sim.current = { p: [...g], v: [0, 0, 0, 0], raf: 0 }; return } // first sight: rest at the goal
    const S = sim.current
    if (S.raf) return // already swinging; the loop follows the latest goal
    const step = () => {
      const w = goal.current
      if (!w) { S.raf = 0; return }
      let moving = false
      for (let k = 0; k < 4; k++) {
        S.v[k] = (S.v[k] + (w[k] - S.p[k]) * STIFF) * DAMP
        S.p[k] += S.v[k]
        if (Math.abs(S.v[k]) > REST || Math.abs(w[k] - S.p[k]) > REST) moving = true
      }
      if (!moving) { S.p = [...w]; S.raf = 0 } else S.raf = requestAnimationFrame(step)
      redraw((n) => n + 1)
    }
    S.raf = requestAnimationFrame(step)
  }, [key, physics])
  useEffect(() => () => { if (sim.current?.raf) cancelAnimationFrame(sim.current.raf) }, [])

  if (!want) return null
  const c = physics && sim.current ? sim.current.p : want
  const path = `M ${p1.x},${p1.y} C ${c[0]},${c[1]} ${c[2]},${c[3]} ${p2.x},${p2.y}`
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} className={talking ? 'comm' : undefined} interactionWidth={28} />
}
export const edgeTypes = { floating: FloatingEdge }
