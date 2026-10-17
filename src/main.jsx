import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/700.css'
import '@xyflow/react/dist/style.css'
import '@xterm/xterm/css/xterm.css'
import './style.css'
import { resolveLang, setLang } from './i18n.js'

// The language must be known before any module builds its strings, so the app loads after the setting is read.
const s = await window.api.settingsGet()
setLang(resolveLang(s.language))
document.documentElement.lang = resolveLang(s.language) === 'en' ? 'en' : 'pt-BR'
const { default: App } = await import('./App.jsx')

createRoot(document.getElementById('root')).render(<App />)
