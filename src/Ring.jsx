import { Handle, Position } from '@xyflow/react'

// Invisible handle laid over the node's border band: dragging from any point on the edge starts a rope.
export function Ring() {
  return <Handle id="ring" type="source" position={Position.Right} className="ring" />
}
