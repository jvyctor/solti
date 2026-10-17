// System notifications. Only while the window is not focused (you are elsewhere); a click brings the app
// forward and pans the canvas to the node that caused it (App listens for 'ac:goto').
import { api } from './shared.js'

export function notify(title, body, { nodeId, always = false } = {}) {
  if (!always && document.hasFocus()) return null
  try {
    const n = new Notification(title, { body: String(body || '').slice(0, 240) })
    n.onclick = () => {
      api.focusWindow()
      if (nodeId) window.dispatchEvent(new CustomEvent('ac:goto', { detail: { nodeId } }))
      n.close()
    }
    return n
  } catch { return null }
}
