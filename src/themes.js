import { tr } from './i18n.js'
// Canvas themes: each preset has a dark and a light palette. Any value can be overridden per-user via settings.custom.
export const PRESETS = [
  { id: 'classic', label: tr("Grade clássica"), gridStyle: 'lines', gap: 28, size: 1,
    dark: { canvas: '#0b0d11', grid: '#1a1d24', accent: '#7c9cff', edge: '#9aa0ab', comm: '#3ddc97' },
    light: { canvas: '#f1f3f7', grid: '#dde1e9', accent: '#3b6bff', edge: '#6b7280', comm: '#12a36b' } },
  { id: 'dots', label: tr("Pontos"), gridStyle: 'dots', gap: 22, size: 1.6,
    dark: { canvas: '#0d0f14', grid: '#2a2f3a', accent: '#7c9cff', edge: '#9aa0ab', comm: '#3ddc97' },
    light: { canvas: '#f6f7fa', grid: '#c6ccd8', accent: '#3b6bff', edge: '#6b7280', comm: '#12a36b' } },
  { id: 'blueprint', label: tr("Blueprint"), gridStyle: 'lines', gap: 24, size: 1,
    dark: { canvas: '#0a2540', grid: '#1e4a7a', accent: '#5ec8ff', edge: '#8cc8ff', comm: '#ffd166' },
    light: { canvas: '#e8f1fb', grid: '#b9d3ee', accent: '#1a73c8', edge: '#4a78a8', comm: '#c27c00' } },
  { id: 'graph', label: tr("Papel milimetrado"), gridStyle: 'lines', gap: 16, size: 0.6,
    dark: { canvas: '#14120b', grid: '#2e2a17', accent: '#f2c230', edge: '#c9b46a', comm: '#ff6b4a' },
    light: { canvas: '#fbf6e3', grid: '#e7dfb8', accent: '#b8860b', edge: '#8a7a3a', comm: '#c2410c' } },
  { id: 'forest', label: tr("Floresta"), gridStyle: 'dots', gap: 24, size: 1.8,
    dark: { canvas: '#0c1410', grid: '#264636', accent: '#4cc38a', edge: '#7fbf9f', comm: '#ffd166' },
    light: { canvas: '#eef6f0', grid: '#bcd7c6', accent: '#1f8f5a', edge: '#4f8a68', comm: '#b7791f' } },
  { id: 'neon', label: tr("Neon"), gridStyle: 'cross', gap: 32, size: 2,
    dark: { canvas: '#0a0a12', grid: '#3a2466', accent: '#ff4fd8', edge: '#00e5ff', comm: '#7dff6b' },
    light: { canvas: '#f7f0ff', grid: '#d9c4ff', accent: '#c026a8', edge: '#0891b2', comm: '#15803d' } },
  { id: 'sunset', label: tr("Pôr do sol"), gridStyle: 'lines', gap: 32, size: 1,
    dark: { canvas: '#14100f', grid: '#3a2420', accent: '#ff8a4c', edge: '#ffb089', comm: '#5ec8ff' },
    light: { canvas: '#fff3ec', grid: '#f6d6c6', accent: '#d9561a', edge: '#b9744f', comm: '#0369a1' } },
  { id: 'graphite', label: tr("Grafite"), gridStyle: 'cross', gap: 40, size: 1.5,
    dark: { canvas: '#16181c', grid: '#2a2d34', accent: '#a3abba', edge: '#8b93a3', comm: '#ffb454' },
    light: { canvas: '#ececec', grid: '#cfcfcf', accent: '#4a5263', edge: '#6b7280', comm: '#b45309' } },
  { id: 'plain', label: tr("Liso"), gridStyle: 'none', gap: 28, size: 1,
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

// Terminal colour schemes (ANSI 16 + base). 'auto' follows the app mode.
const ansi = (a) => ({ black: a[0], red: a[1], green: a[2], yellow: a[3], blue: a[4], magenta: a[5], cyan: a[6], white: a[7], brightBlack: a[8], brightRed: a[9], brightGreen: a[10], brightYellow: a[11], brightBlue: a[12], brightMagenta: a[13], brightCyan: a[14], brightWhite: a[15] })
export const TERM_SCHEMES = {
  auto: { label: tr("Automático (segue o modo)") },
  dracula: { label: tr("Dracula"), background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', selectionBackground: '#44475a', ...ansi(['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2', '#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff']) },
  nord: { label: tr("Nord"), background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9', selectionBackground: '#434c5e', ...ansi(['#3b4252', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0', '#4c566a', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#8fbcbb', '#eceff4']) },
  gruvbox: { label: tr("Gruvbox"), background: '#282828', foreground: '#ebdbb2', cursor: '#ebdbb2', selectionBackground: '#504945', ...ansi(['#282828', '#cc241d', '#98971a', '#d79921', '#458588', '#b16286', '#689d6a', '#a89984', '#928374', '#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#ebdbb2']) },
  tokyo: { label: tr("Tokyo Night"), background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5', selectionBackground: '#33467c', ...ansi(['#15161e', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6', '#414868', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#c0caf5']) },
  solarized: { label: tr("Solarized Dark"), background: '#002b36', foreground: '#839496', cursor: '#93a1a1', selectionBackground: '#073642', ...ansi(['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5', '#002b36', '#cb4b16', '#586e75', '#657b83', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3']) },
  monokai: { label: tr("Monokai"), background: '#272822', foreground: '#f8f8f2', cursor: '#f8f8f0', selectionBackground: '#49483e', ...ansi(['#272822', '#f92672', '#a6e22e', '#f4bf75', '#66d9ef', '#ae81ff', '#a1efe4', '#f8f8f2', '#75715e', '#f92672', '#a6e22e', '#f4bf75', '#66d9ef', '#ae81ff', '#a1efe4', '#f9f8f5']) },
}
const TERM_AUTO = {
  dark: { background: '#0d0f13', foreground: '#e8eaf0', cursor: '#e8eaf0', selectionBackground: '#3a4a7a' },
  // Darker ANSI colours: the xterm defaults are unreadable on white.
  light: { background: '#fbfbfd', foreground: '#161a22', cursor: '#161a22', selectionBackground: '#bcd0ff', ...ansi(['#161a22', '#cd3131', '#107c10', '#8a7500', '#0451a5', '#bc05bc', '#057a96', '#555555', '#666666', '#cd3131', '#107c10', '#8a7500', '#0451a5', '#bc05bc', '#057a96', '#a5a5a5']) },
}

// xterm options derived from settings; empty colour fields fall back to the scheme.
export function termOptions(s, mode) {
  const { label, ...scheme } = TERM_SCHEMES[s.termScheme] || {}
  const theme = { ...(s.termScheme === 'auto' || !TERM_SCHEMES[s.termScheme] ? TERM_AUTO[mode] : scheme) }
  if (s.termBg) theme.background = s.termBg
  if (s.termFg) theme.foreground = s.termFg
  if (s.termCursor) theme.cursor = s.termCursor
  if (s.termSelection) theme.selectionBackground = s.termSelection
  return {
    theme,
    fontSize: s.fontSize,
    fontFamily: `'${s.fontFamily}', 'Cascadia Code', Consolas, monospace`,
    fontWeight: s.fontWeight,
    fontWeightBold: s.fontWeight === 'normal' ? 'bold' : '900',
    cursorStyle: s.cursorStyle,
    cursorBlink: s.cursorBlink,
    lineHeight: s.lineHeight,
    letterSpacing: s.letterSpacing,
    scrollback: s.scrollback,
  }
}
