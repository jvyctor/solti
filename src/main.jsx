import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/700.css'
import '@xyflow/react/dist/style.css'
import '@xterm/xterm/css/xterm.css'
import './style.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(<App />)
