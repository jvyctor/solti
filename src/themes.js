// Canvas themes: each preset has a dark and a light palette. Any value can be overridden per-user via settings.custom.
export const PRESETS = [
  { id: 'classic', label: 'Grade clássica', gridStyle: 'lines', gap: 28, size: 1,
    dark: { canvas: '#0b0d11', grid: '#1a1d24', accent: '#7c9cff', edge: '#9aa0ab', comm: '#3ddc97' },
    light: { canvas: '#f1f3f7', grid: '#dde1e9', accent: '#3b6bff', edge: '#6b7280', comm: '#12a36b' } },
  { id: 'dots', label: 'Pontos', gridStyle: 'dots', gap: 22, size: 1.6,
    dark: { canvas: '#0d0f14', grid: '#2a2f3a', accent: '#7c9cff', edge: '#9aa0ab', comm: '#3ddc97' },
    light: { canvas: '#f6f7fa', grid: '#c6ccd8', accent: '#3b6bff', edge: '#6b7280', comm: '#12a36b' } },
  { id: 'blueprint', label: 'Blueprint', gridStyle: 'lines', gap: 24, size: 1,
    dark: { canvas: '#0a2540', grid: '#1e4a7a', accent: '#5ec8ff', edge: '#8cc8ff', comm: '#ffd166' },
    light: { canvas: '#e8f1fb', grid: '#b9d3ee', accent: '#1a73c8', edge: '#4a78a8', comm: '#c27c00' } },
  { id: 'graph', label: 'Papel milimetrado', gridStyle: 'lines', gap: 16, size: 0.6,
    dark: { canvas: '#14120b', grid: '#2e2a17', accent: '#f2c230', edge: '#c9b46a', comm: '#ff6b4a' },
    light: { canvas: '#fbf6e3', grid: '#e7dfb8', accent: '#b8860b', edge: '#8a7a3a', comm: '#c2410c' } },
  { id: 'forest', label: 'Floresta', gridStyle: 'dots', gap: 24, size: 1.8,
    dark: { canvas: '#0c1410', grid: '#264636', accent: '#4cc38a', edge: '#7fbf9f', comm: '#ffd166' },
    light: { canvas: '#eef6f0', grid: '#bcd7c6', accent: '#1f8f5a', edge: '#4f8a68', comm: '#b7791f' } },
  { id: 'neon', label: 'Neon', gridStyle: 'cross', gap: 32, size: 2,
    dark: { canvas: '#0a0a12', grid: '#3a2466', accent: '#ff4fd8', edge: '#00e5ff', comm: '#7dff6b' },
    light: { canvas: '#f7f0ff', grid: '#d9c4ff', accent: '#c026a8', edge: '#0891b2', comm: '#15803d' } },
  { id: 'sunset', label: 'Pôr do sol', gridStyle: 'lines', gap: 32, size: 1,
    dark: { canvas: '#14100f', grid: '#3a2420', accent: '#ff8a4c', edge: '#ffb089', comm: '#5ec8ff' },
    light: { canvas: '#fff3ec', grid: '#f6d6c6', accent: '#d9561a', edge: '#b9744f', comm: '#0369a1' } },
  { id: 'graphite', label: 'Grafite', gridStyle: 'cross', gap: 40, size: 1.5,
    dark: { canvas: '#16181c', grid: '#2a2d34', accent: '#a3abba', edge: '#8b93a3', comm: '#ffb454' },
    light: { canvas: '#ececec', grid: '#cfcfcf', accent: '#4a5263', edge: '#6b7280', comm: '#b45309' } },
  { id: 'plain', label: 'Liso', gridStyle: 'none', gap: 28, size: 1,
    dark: { canvas: '#0e1015', grid: '#1a1d24', accent: '#7c9cff', edge: '#9aa0ab', comm: '#3ddc97' },
    light: { canvas: '#f7f8fa', grid: '#dde1e9', accent: '#3b6bff', edge: '#6b7280', comm: '#12a36b' } },
]

export const EDGE_DASH = { dashed: '10 8', dotted: '2 8', solid: 'none' }

// Effective theme = preset palette for the mode, overlaid with the user's custom values.
export function resolveTheme(settings, mode) {
  const p = PRESETS.find((x) => x.id === settings.theme) || PRESETS[0]
  const c = settings.custom || {}
  const pal = p[mode] || p.dark
  return {
    mode,
    preset: p.id,
    canvas: c.canvas || pal.canvas,
    grid: c.grid || pal.grid,
    accent: c.accent || pal.accent,
    edge: c.edge || pal.edge,
    comm: c.comm || pal.comm,
    commHighlight: c.commHighlight !== false,
    commSeconds: c.commSeconds || 6,
    gridStyle: c.gridStyle || p.gridStyle,
    gap: c.gap || p.gap,
    size: c.size || p.size,
    edgeStyle: c.edgeStyle || 'dashed',
    edgeWidth: c.edgeWidth || 2.5,
    edgeSag: c.edgeSag ?? 1,
    edgeFlow: !!c.edgeFlow,
    radius: c.radius ?? 14,
    shadow: c.shadow !== false,
    snap: !!c.snap,
    snapSize: c.snapSize || 28,
  }
}

// Push the effective theme into CSS variables; style.css reads them.
export function applyTheme(t) {
  const r = document.documentElement
  r.dataset.theme = t.mode
  const set = (k, v) => r.style.setProperty(k, v)
  set('--canvas-bg', t.canvas)
  set('--accent', t.accent)
  set('--edge-color', t.edge)
  set('--comm-color', t.comm)
  set('--edge-width', String(t.edgeWidth))
  set('--edge-dash', EDGE_DASH[t.edgeStyle] || EDGE_DASH.dashed)
  set('--r-node', t.radius + 'px')
  set('--node-shadow', t.shadow ? '0 6px 24px rgba(0, 0, 0, 0.35)' : 'none')
}
