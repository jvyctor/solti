import { useEffect, useState } from 'react'
import { TriangleAlert, X } from 'lucide-react'
import { tr } from './i18n.js'

const api = window.api

// Versions, agent checks and the recent error log as text, ready to paste into a bug report.
export async function copyReport() {
  const text = await api.diagReport()
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

// A main-process error that used to pop Electron's blocking dialog: a dismissable notice instead.
// Renderer errors are only logged (they rarely mean anything to the user).
export function ErrorToast() {
  const [err, setErr] = useState(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    const onErr = (e) => api.logError(`${e.message} (${e.filename}:${e.lineno})\n${e.error?.stack || ''}`)
    const onRej = (e) => api.logError(`unhandled rejection: ${e.reason?.stack || e.reason}`)
    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onRej)
    const off = api.onAppError((e) => { setErr(e); setCopied(false) })
    return () => { off(); window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onRej) }
  }, [])
  if (!err) return null
  return (
    <div className="toast error" role="alert">
      <TriangleAlert size={18} />
      <div className="toast-main">
        <b>{tr("Ocorreu um erro interno (foi registrado).")}</b>
        <span>{err.message}</span>
        <button className="link" onClick={async () => setCopied(await copyReport())}>{copied ? tr("Diagnóstico copiado") : tr("Copiar diagnóstico")}</button>
      </div>
      <button className="toast-x" aria-label={tr("Fechar")} onClick={() => setErr(null)}><X size={14} /></button>
    </div>
  )
}
