// App settings from the main process, the effective light/dark mode and the resolved theme (applied to the page).
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../shared.js'
import { applyTheme, resolveTheme } from '../themes.js'

export function useAppSettings() {
  const [settings, setSettings] = useState(null)
  const settingsRef = useRef(null)
  settingsRef.current = settings
  useEffect(() => {
    api.settingsGet().then(setSettings)
    return api.onSettings(setSettings)
  }, [])
  const [sysDark, setSysDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const m = window.matchMedia('(prefers-color-scheme: dark)')
    const h = (e) => setSysDark(e.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [])
  const mode = settings?.appearance === 'system' ? (sysDark ? 'dark' : 'light') : settings?.appearance || 'dark'
  const eff = useMemo(() => (settings ? resolveTheme(settings, mode) : null), [settings, mode])
  useEffect(() => { if (eff) applyTheme(eff) }, [eff])
  // What components read through SettingsCtx.
  const ctx = useMemo(() => (settings ? { ...settings, mode, eff } : null), [settings, mode, eff])
  return { settings, settingsRef, mode, ctx }
}
