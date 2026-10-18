// A pipeline run report (Markdown, see report.js): read, copy (e.g. as a PR description) or save as .md.
import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Copy, Download, FileText, X } from 'lucide-react'
import { tr } from './i18n.js'

const api = window.api

export default function ReportDialog({ title, report, onClose }) {
  const [note, setNote] = useState('')
  const copy = async () => {
    try { await navigator.clipboard.writeText(report); setNote(tr('Copiado.')) } catch { setNote(tr('Não foi possível copiar.')) }
  }
  const save = async () => {
    const r = await api.saveReport(`solti-${title}`, report)
    if (r?.path) setNote(tr('Salvo em {0}', [r.path]))
  }
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dlg-back" />
        <Dialog.Content className="dlg wide report-dlg" aria-describedby={undefined}>
          <Dialog.Title className="dlg-title"><FileText size={16} /> {tr('Relatório da execução')}</Dialog.Title>
          <pre className="report-md" tabIndex={0}>{report}</pre>
          {note && <p className="ok">{note}</p>}
          <div className="dlg-actions">
            <button onClick={save}><Download size={14} /> {tr('Salvar .md')}</button>
            <button className="primary" onClick={copy}><Copy size={14} /> {tr('Copiar Markdown')}</button>
          </div>
          <Dialog.Close asChild><button className="set-close" aria-label={tr('Fechar')}><X size={16} /></button></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
