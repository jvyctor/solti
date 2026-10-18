// The yes/no dialog behind ask() (shared.js): any component can await a confirmation.
import { useEffect, useState } from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { mem } from '../shared.js'
import { tr } from '../i18n.js'

export function ConfirmDialog() {
  const [confirm, setConfirm] = useState(null) // { msg, done }
  useEffect(() => {
    mem.askFn = (msg) => new Promise((done) => setConfirm({ msg, done }))
    return () => { mem.askFn = null }
  }, [])
  const answer = (v) => { confirm?.done(v); setConfirm(null) }
  return (
    <AlertDialog.Root open={!!confirm} onOpenChange={(o) => !o && answer(false)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dlg-back" />
        <AlertDialog.Content className="dlg">
          <AlertDialog.Title className="dlg-title">{tr("Confirmar exclusão")}</AlertDialog.Title>
          <AlertDialog.Description>{confirm?.msg}</AlertDialog.Description>
          <div className="dlg-actions">
            <AlertDialog.Cancel asChild><button>{tr("Não")}</button></AlertDialog.Cancel>
            <AlertDialog.Action asChild><button className="primary danger" onClick={() => answer(true)}>{tr("Sim")}</button></AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
