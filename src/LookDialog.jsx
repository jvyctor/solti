import * as Dialog from '@radix-ui/react-dialog'
import { TERM_SCHEMES, termOptions } from './themes.js'

// Per-terminal look: overrides the global Terminal settings for one node only (stored in node.data.look).
export default function LookDialog({ node, cfg, onChange, onClose }) {
  const look = node.data.look || {}
  const eff = termOptions({ ...cfg, ...look }, cfg.mode)
  const set = (patch) => onChange({ ...look, ...patch })
  const reset = (k) => { const { [k]: _gone, ...rest } = look; onChange(rest) }
  const color = (key, themeKey, label) => (
    <label className="look-row">{label}
      <span className="look-ctl">
        <input type="color" value={eff.theme[themeKey]} onChange={(e) => set({ [key]: e.target.value })} />
        <code>{eff.theme[themeKey]}</code>
        {look[key] && <button type="button" className="set-link" onClick={() => reset(key)}>padrão</button>}
      </span>
    </label>
  )
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dlg-back" />
        <Dialog.Content className="dlg" aria-describedby={undefined}>
          <Dialog.Title className="dlg-title">Aparência de “{node.data.name}”</Dialog.Title>
          <p className="hint">Vale só para este terminal. O que você não mudar segue Configurações → Terminal.</p>
          <label className="look-row">Esquema de cores
            <select value={look.termScheme || ''} onChange={(e) => (e.target.value ? set({ termScheme: e.target.value, termBg: undefined, termFg: undefined, termCursor: undefined }) : reset('termScheme'))}>
              <option value="">(global)</option>
              {Object.entries(TERM_SCHEMES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          {color('termBg', 'background', 'Fundo')}
          {color('termFg', 'foreground', 'Texto')}
          {color('termCursor', 'cursor', 'Cursor')}
          <label className="look-row">Tamanho da fonte
            <span className="look-ctl">
              <input type="range" min="9" max="28" value={eff.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} />
              <code>{eff.fontSize} px</code>
              {look.fontSize && <button type="button" className="set-link" onClick={() => reset('fontSize')}>padrão</button>}
            </span>
          </label>
          <label className="look-row">Fonte
            <input value={look.fontFamily ?? ''} placeholder={cfg.fontFamily} onChange={(e) => (e.target.value ? set({ fontFamily: e.target.value }) : reset('fontFamily'))} />
          </label>
          <div className="dlg-actions">
            <button type="button" onClick={() => onChange({})}>Usar o padrão global</button>
            <button type="button" className="primary" onClick={onClose}>Pronto</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
