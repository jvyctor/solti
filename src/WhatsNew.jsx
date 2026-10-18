// "What's new": after an update, what changed since the version you had, from the bundled CHANGELOG.md.
// Also opened from Settings → About and Ctrl+K. A fresh install shows nothing (there is nothing "new" yet).
import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Sparkles, X } from 'lucide-react'
import changelog from '../CHANGELOG.md?raw'
import { cmpVersion, inline, parseChangelog, releasesBetween } from './changelog.js'
import { api } from './shared.js'
import { tr } from './i18n.js'

const RELEASES = parseChangelog(changelog)
// The CHANGELOG's section titles (Keep a Changelog) in the app's language.
const GROUP = { Added: 'Adicionado', Changed: 'Alterado', Fixed: 'Corrigido', Removed: 'Removido', Security: 'Segurança', Deprecated: 'Obsoleto' }

function Inline({ text }) {
  return inline(text).map((s, i) =>
    s.bold ? <b key={i}>{s.t}</b> : s.code ? <code key={i}>{s.t}</code> : s.href ? <span key={i} className="wn-link">{s.t}</span> : <span key={i}>{s.t}</span>,
  )
}

// settings.lastSeenVersion: the version whose notes were last shown (or the first version installed).
export function WhatsNew({ settings }) {
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState([])
  useEffect(() => {
    api.appInfo().then(({ version }) => {
      const seen = settings.lastSeenVersion
      if (seen && cmpVersion(version, seen) > 0) {
        const list = releasesBetween(RELEASES, seen, version)
        if (list.length) { setShown(list); setOpen(true) }
      } else if (!seen && settings.onboarded) {
        // Updated from a version that did not record this yet: show this version's notes once.
        const cur = RELEASES.find((r) => r.version === version)
        if (cur) { setShown([cur]); setOpen(true) }
      }
      if (seen !== version) api.settingsSet({ lastSeenVersion: version })
    })
    // Opened on request: the latest release.
    const h = () => { setShown(RELEASES.slice(0, 1)); setOpen(true) }
    window.addEventListener('ac:whats-new', h)
    return () => window.removeEventListener('ac:whats-new', h)
  }, [])
  if (!shown.length) return null
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="dlg-back" />
        <Dialog.Content className="dlg wide whats-new" aria-describedby={undefined}>
          <Dialog.Title className="dlg-title"><Sparkles size={16} /> {shown.length > 1 ? tr('Novidades desde a versão anterior') : tr('Novidades da versão {0}', [shown[0].version])}</Dialog.Title>
          <div className="wn-body">
            {shown.map((r) => (
              <section key={r.version}>
                {shown.length > 1 && <h3>{r.version}<small>{r.date}</small></h3>}
                {r.intro.map((p, i) => <p key={i}><Inline text={p} /></p>)}
                {r.groups.map((g, i) => (
                  <div key={i}>
                    {g.title && <h4>{GROUP[g.title] ? tr(GROUP[g.title]) : g.title}</h4>}
                    <ul>{g.items.map((it, k) => <li key={k}><Inline text={it} /></li>)}</ul>
                  </div>
                ))}
              </section>
            ))}
          </div>
          <div className="dlg-actions">
            <button onClick={() => api.openLink('changelog')}>{tr('Histórico completo de versões')}</button>
            <button className="primary" onClick={() => setOpen(false)}>{tr('Entendi')}</button>
          </div>
          <Dialog.Close asChild><button className="set-close" aria-label={tr('Fechar')}><X size={16} /></button></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
