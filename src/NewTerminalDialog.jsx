import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { PRESET_LABELS, api } from './shared.js'
import { tr } from './i18n.js'

// Modal for "Novo Terminal…": name, agent and project (local folder or git URL) with optional per-agent worktree.
export function NewTerminalDialog({ initialName, onCreate, onClose }) {
  const [name, setName] = useState(initialName)
  const [preset, setPreset] = useState('shell')
  const [src, setSrc] = useState('dir') // dir | url
  const [dir, setDir] = useState('')
  const [url, setUrl] = useState('')
  const [info, setInfo] = useState(null) // { isRepo, branches, branch }
  const [base, setBase] = useState('')
  const [isolate, setIsolate] = useState(true)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  const inspect = async (d) => {
    setErr(''); setInfo(null)
    if (!d) return
    const r = await api.gitInfo(d)
    setInfo(r)
    if (r.isRepo) setBase(r.branch)
  }
  const pick = async () => { const d = await api.pickFolder(); if (d) { setDir(d); inspect(d) } }
  const fetchBranches = async () => {
    setErr(''); setInfo(null); setBusy(tr("Buscando branches…"))
    const r = await api.gitRemoteBranches(url.trim())
    setBusy('')
    if (r.error) return setErr(r.error)
    setInfo({ isRepo: true, branches: r.branches })
    setBase(r.branches.includes('main') ? 'main' : r.branches.includes('master') ? 'master' : r.branches[0] || '')
  }
  const gitReady = info?.isRepo
  const submit = async (e) => {
    e.preventDefault()
    const n = name || initialName
    if (src === 'dir' && (!dir || !gitReady)) return onCreate({ name: n, preset, cwd: dir || undefined })
    if (src === 'url' && !gitReady) return setErr(tr("Clique em \"Buscar branches\" primeiro."))
    setErr(''); setBusy(src === 'url' ? tr("Clonando e preparando…") : tr("Preparando…"))
    const r = await api.gitPrepare({ ...(src === 'url' ? { url: url.trim() } : { dir }), base, isolate, agent: n })
    setBusy('')
    if (r.error) return setErr(r.error)
    onCreate({ name: n, preset, cwd: r.cwd, git: r.git || undefined })
  }
  return (
    <Dialog.Root open onOpenChange={(o) => !o && !busy && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dlg-back" />
        <Dialog.Content className="dlg wide" aria-describedby={undefined}>
          <form onSubmit={submit}>
            <Dialog.Title className="dlg-title">{tr("Novo terminal")}</Dialog.Title>
            <label>{tr("Nome")}<input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label>{tr("Agente")}
              <select value={preset} onChange={(e) => setPreset(e.target.value)}>
                {Object.entries(PRESET_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <div className="seg" role="tablist" aria-label={tr("Origem do projeto")}>
              <button type="button" role="tab" aria-selected={src === 'dir'} className={src === 'dir' ? 'on' : ''} onClick={() => { setSrc('dir'); setInfo(null); setErr(''); inspect(dir) }}>{tr("Pasta do computador")}</button>
              <button type="button" role="tab" aria-selected={src === 'url'} className={src === 'url' ? 'on' : ''} onClick={() => { setSrc('url'); setInfo(null); setErr('') }}>{tr("Link do Git")}</button>
            </div>
            {src === 'dir' ? (
              <label>{tr("Pasta do projeto (opcional)")}
                <span className="row"><input value={dir} placeholder={tr("C:\\projetos\\meu-app")} onChange={(e) => { setDir(e.target.value); setInfo(null) }} onBlur={() => inspect(dir)} /><button type="button" onClick={pick}>{tr("Escolher…")}</button></span>
              </label>
            ) : (
              <label>{tr("URL do repositório")}
                <span className="row"><input value={url} placeholder={tr("https://github.com/usuario/projeto.git")} onChange={(e) => { setUrl(e.target.value); setInfo(null) }} /><button type="button" disabled={!url.trim() || !!busy} onClick={fetchBranches}>{tr("Buscar branches")}</button></span>
              </label>
            )}
            {src === 'dir' && dir && info && !info.isRepo && <p className="hint">{tr("Não é um repositório git: o terminal abre direto na pasta, sem isolamento.")}</p>}
            {gitReady && (
              <>
                <label>{tr("Branch de partida")}
                  <select value={base} onChange={(e) => setBase(e.target.value)}>
                    {info.branches.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </label>
                <label className="check">
                  <input type="checkbox" checked={isolate} onChange={(e) => setIsolate(e.target.checked)} />
                  <span>{tr("Isolar em worktree")} <small>{tr("(branch própria")} <code>{tr("canvas/")}{(name || initialName).toLowerCase()}</code> {tr("a partir de")} {base || '…'})</small></span>
                </label>
                {!isolate && src === 'dir' && <p className="hint">{tr("Sem isolamento, o terminal troca a branch da pasta para")} <b>{base}</b>.</p>}
              </>
            )}
            {err && <p className="err">{err}</p>}
            <div className="dlg-actions">
              <Dialog.Close asChild><button type="button" disabled={!!busy}>{tr("Cancelar")}</button></Dialog.Close>
              <button type="submit" className="primary" disabled={!!busy}>{busy || tr("Criar")}</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
