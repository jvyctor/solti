// Group drag: which nodes sit inside a group's frame (by their centre) and so travel with it.
const num = (v, d) => (typeof v === 'number' ? v : parseFloat(v) || d)
export const sizeOf = (n) => ({ w: n.measured?.width ?? n.width ?? num(n.style?.width, 200), h: n.measured?.height ?? n.height ?? num(n.style?.height, 120) })

export function kidsInside(group, nodes) {
  const g = sizeOf(group)
  return nodes.filter((n) => {
    if (n.id === group.id || n.type === 'group') return false
    const s = sizeOf(n)
    const cx = n.position.x + s.w / 2
    const cy = n.position.y + s.h / 2
    return cx >= group.position.x && cx <= group.position.x + g.w && cy >= group.position.y && cy <= group.position.y + g.h
  })
}

// Align / distribute the given nodes (2+; distribute needs 3+). mode: left | right | top | bottom | hcenter | vcenter | hspace | vspace.
// Returns Map id -> new position; nodes that do not move are left out.
export function arrange(nodes, mode) {
  const out = new Map()
  if (nodes.length < 2) return out
  const box = nodes.map((n) => ({ n, ...sizeOf(n) }))
  const minX = Math.min(...box.map((b) => b.n.position.x)), maxX = Math.max(...box.map((b) => b.n.position.x + b.w))
  const minY = Math.min(...box.map((b) => b.n.position.y)), maxY = Math.max(...box.map((b) => b.n.position.y + b.h))
  const put = (b, x, y) => { if (x !== b.n.position.x || y !== b.n.position.y) out.set(b.n.id, { x, y }) }
  if (mode === 'left') box.forEach((b) => put(b, minX, b.n.position.y))
  else if (mode === 'right') box.forEach((b) => put(b, maxX - b.w, b.n.position.y))
  else if (mode === 'top') box.forEach((b) => put(b, b.n.position.x, minY))
  else if (mode === 'bottom') box.forEach((b) => put(b, b.n.position.x, maxY - b.h))
  else if (mode === 'hcenter') box.forEach((b) => put(b, (minX + maxX) / 2 - b.w / 2, b.n.position.y))
  else if (mode === 'vcenter') box.forEach((b) => put(b, b.n.position.x, (minY + maxY) / 2 - b.h / 2))
  else if (mode === 'hspace' || mode === 'vspace') {
    if (nodes.length < 3) return out
    const h = mode === 'hspace'
    const sorted = [...box].sort((a, b) => (h ? a.n.position.x - b.n.position.x : a.n.position.y - b.n.position.y))
    const total = sorted.reduce((s, b) => s + (h ? b.w : b.h), 0)
    const gap = ((h ? maxX - minX : maxY - minY) - total) / (sorted.length - 1)
    let at = h ? minX : minY
    for (const b of sorted) {
      h ? put(b, at, b.n.position.y) : put(b, b.n.position.x, at)
      at += (h ? b.w : b.h) + gap
    }
  }
  return out
}
