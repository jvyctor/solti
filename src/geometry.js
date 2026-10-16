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
