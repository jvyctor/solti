import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { PRESETS, resolveTheme, TERM_SCHEMES, termOptions } from './themes.js'
import { SlidersHorizontal, Palette, SquareTerminal, Bot, Keyboard, Database, Info, RefreshCw, X } from 'lucide-react'
import { UpdatesTab } from './Updates.jsx'

const TABS = [
  { id: 'geral', label: 'Geral', Icon: SlidersHorizontal },
  { id: 'tela', label: 'Tela', Icon: Palette },
  { id: 'terminal', label: 'Terminal', Icon: SquareTerminal },
  { id: 'agentes', label: 'Agentes', Icon: Bot },
  { id: 'atalhos', label: 'Atalhos', Icon: Keyboard },
  { id: 'updates', label: 'Atualizações', Icon: RefreshCw },
  { id: 'dados', label: 'Dados', Icon: Database },
  { id: 'sobre', label: 'Sobre', Icon: Info },
]
const SUBTABS = [
  { id: 'sistema', label: 'Sistema' },
  { id: 'notificacoes', label: 'Notificações' },
]

function Section({ title, children }) {
  return (
    <section className="set-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function Row({ title, desc, children }) {
  return (
    <div className="set-row">
      <div className="set-text">
        <div className="set-title">{title}</div>
        {desc && <p>{desc}</p>}
      </div>
      <div className="set-ctl">{children}</div>
    </div>
  )
}

const Switch = ({ checked, onChange, label }) => (
  <button type="button" role="switch" aria-checked={checked} aria-label={label} className={'switch' + (checked ? ' on' : '')} onClick={() => onChange(!checked)}>
    <i />
  </button>
)

const Select = ({ value, onChange, options, label }) => (
  <select className="set-select" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
    {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>
)

const Range = ({ value, min, max, step, onChange, label, unit = '' }) => (
  <span className="set-range">
    <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    <output>{Number(value).toFixed(step < 1 ? 1 : 0)}{unit}</output>
  </span>
)

// Colour picker that shows the effective colour and offers a per-value reset to the preset.
const Color = ({ value, overridden, onChange, onReset, label }) => (
  <span className="set-color">
    <input type="color" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
    <code>{value}</code>
    {overridden && <button className="set-link" onClick={onReset}>padrão</button>}
  </span>
)

// Mini preview of a preset: its canvas colour, grid pattern and accent.
function Swatch({ p, mode }) {
  const pal = p[mode] || p.dark
  const g = pal.grid
  const lines = `linear-gradient(${g} 1px, transparent 1px), linear-gradient(90deg, ${g} 1px, transparent 1px)`
  const bg = { lines, dots: `radial-gradient(${g} 1.5px, transparent 1.6px)`, cross: lines, none: 'none' }[p.gridStyle]
  const size = p.gridStyle === 'cross' ? '16px 16px' : '10px 10px'
  return (
    <span className="swatch" style={{ background: pal.canvas }}>
      <span className="swatch-grid" style={{ backgroundImage: bg, backgroundSize: size }} />
      <i style={{ background: pal.accent }} />
      <b style={{ borderColor: pal.edge }} />
    </span>
  )
}

function Tela({ s, set, mode }) {
  const t = resolveTheme(s, mode)
  const c = s.custom || {}
  const over = (k) => c[k] !== undefined
  const setC = (patch) => set({ custom: patch })
  const color = (k, label) => (
    <Color label={label} value={t[k]} overridden={over(k)} onChange={(v) => setC({ [k]: v })} onReset={() => setC({ [k]: null })} />
  )
  return (
    <>
      <Section title="APARÊNCIA">
        <Row title="Modo" desc="Claro, escuro ou seguir o sistema operacional.">
          <Select label="Modo" value={s.appearance} onChange={(v) => set({ appearance: v })} options={[['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Escuro']]} />
        </Row>
      </Section>
      <Section title="TEMA DO CANVAS">
        <div className="swatches" role="radiogroup" aria-label="Tema do canvas">
          {PRESETS.map((p) => (
            <button key={p.id} role="radio" aria-checked={s.theme === p.id} className={'swatch-card' + (s.theme === p.id ? ' on' : '')} onClick={() => set({ theme: p.id, custom: null })}>
              <Swatch p={p} mode={mode} />
              <span>{p.label}</span>
            </button>
          ))}
        </div>
        <p className="set-hint">Escolher um tema limpa as personalizações abaixo.</p>
      </Section>
      <Section title="GRADE">
        <Row title="Estilo">
          <Select label="Estilo da grade" value={t.gridStyle} onChange={(v) => setC({ gridStyle: v })} options={[['lines', 'Linhas'], ['dots', 'Pontos'], ['cross', 'Cruzes'], ['none', 'Nenhuma']]} />
        </Row>
        <Row title="Espaçamento"><Range label="Espaçamento da grade" value={t.gap} min={8} max={80} step={2} unit=" px" onChange={(v) => setC({ gap: v })} /></Row>
        <Row title="Espessura"><Range label="Espessura da grade" value={t.size} min={0.5} max={4} step={0.5} unit=" px" onChange={(v) => setC({ size: v })} /></Row>
        <Row title="Cor da grade">{color('grid', 'Cor da grade')}</Row>
        <Row title="Cor do fundo">{color('canvas', 'Cor do fundo')}</Row>
        <Row title="Encaixar à grade" desc="Os nós se alinham ao arrastar.">
          <Switch label="Encaixar à grade" checked={t.snap} onChange={(v) => setC({ snap: v })} />
        </Row>
        {t.snap && (
          <Row title="Tamanho do encaixe"><Range label="Tamanho do encaixe" value={t.snapSize} min={8} max={80} step={4} unit=" px" onChange={(v) => setC({ snapSize: v })} /></Row>
        )}
      </Section>
      <Section title="CORDAS">
        <Row title="Cor">{color('edge', 'Cor das cordas')}</Row>
        <Row title="Estilo">
          <Select label="Estilo das cordas" value={t.edgeStyle} onChange={(v) => setC({ edgeStyle: v })} options={[['dashed', 'Tracejada'], ['dotted', 'Pontilhada'], ['solid', 'Sólida']]} />
        </Row>
        <Row title="Espessura"><Range label="Espessura das cordas" value={t.edgeWidth} min={1} max={6} step={0.5} unit=" px" onChange={(v) => setC({ edgeWidth: v })} /></Row>
        <Row title="Folga" desc="Quanto a corda cai entre os nós. 0 = reta.">
          <Range label="Folga das cordas" value={t.edgeSag} min={0} max={2} step={0.1} onChange={(v) => setC({ edgeSag: v })} />
        </Row>
        <Row title="Destacar comunicação" desc="A corda muda de cor e corre enquanto dois agentes trocam mensagens, e volta ao normal quando param.">
          <Switch label="Destacar comunicação" checked={t.commHighlight} onChange={(v) => setC({ commHighlight: v })} />
        </Row>
        {t.commHighlight && (
          <>
            <Row title="Cor durante a comunicação">{color('comm', 'Cor durante a comunicação')}</Row>
            <Row title="Manter destacada após a última mensagem">
              <Select label="Tempo de destaque" value={String(t.commSeconds)} onChange={(v) => setC({ commSeconds: Number(v) })} options={[['3', '3 s'], ['6', '6 s'], ['10', '10 s'], ['20', '20 s']]} />
            </Row>
          </>
        )}
        <Row title="Animar" desc="Faz o tracejado correr ao longo da corda.">
          <Switch label="Animar cordas" checked={t.edgeFlow} onChange={(v) => setC({ edgeFlow: v })} />
        </Row>
      </Section>
      <Section title="CARTÕES E DESTAQUE">
        <Row title="Cor de destaque">{color('accent', 'Cor de destaque')}</Row>
        <Row title="Arredondamento"><Range label="Arredondamento dos cartões" value={t.radius} min={0} max={28} step={2} unit=" px" onChange={(v) => setC({ radius: v })} /></Row>
        <Row title="Sombra nos cartões">
          <Switch label="Sombra nos cartões" checked={t.shadow} onChange={(v) => setC({ shadow: v })} />
        </Row>
        <Row title="Minimapa ao abrir" desc="Abre a navegação em miniatura junto com o canvas.">
          <Switch label="Minimapa ao abrir" checked={s.showMinimap} onChange={(v) => set({ showMinimap: v })} />
        </Row>
      </Section>
      <Section title="PERSONALIZAÇÃO">
        <Row title="Voltar ao padrão do tema" desc="Remove todos os valores alterados acima.">
          <button className="set-btn" onClick={() => set({ custom: null })}>Redefinir</button>
        </Row>
      </Section>
    </>
  )
}

function Geral({ s, set }) {
  const [sub, setSub] = useState('sistema')
  return (
    <>
      <div className="set-subtabs" role="tablist">
        {SUBTABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={sub === t.id} className={sub === t.id ? 'on' : ''} onClick={() => setSub(t.id)}>{t.label}</button>
        ))}
      </div>
      {sub === 'sistema' && (
        <>
          <Section title="APARÊNCIA">
            <Row title="Aparência" desc="Sistema segue a configuração do seu sistema operacional.">
              <Select label="Aparência" value={s.appearance} onChange={(v) => set({ appearance: v })} options={[['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Escuro']]} />
            </Row>
          </Section>
          <Section title="ENERGIA">
            <Row title="Impedir a suspensão" desc="Mantém o computador acordado para os agentes continuarem trabalhando sem supervisão.">
              <Select label="Impedir a suspensão" value={s.powerSave} onChange={(v) => set({ powerSave: v })} options={[['agents', 'Enquanto os agentes trabalham'], ['always', 'Sempre'], ['never', 'Nunca']]} />
            </Row>
          </Section>
          <Section title="SAÍDA DO APLICATIVO">
            <Row title="Pedir confirmação para sair" desc="Pergunta antes de fechar a janela, para não interromper os agentes em execução por engano.">
              <Switch label="Pedir confirmação para sair" checked={s.confirmQuit} onChange={(v) => set({ confirmQuit: v })} />
            </Row>
          </Section>
          <Section title="INTERFACE">
            <Row title="Cursor de mão ao passar o mouse" desc="Mostra o cursor de mão sobre botões e menus, como em um navegador web.">
              <Switch label="Cursor de mão" checked={s.handCursor} onChange={(v) => set({ handCursor: v })} />
            </Row>
          </Section>
        </>
      )}
      {sub === 'notificacoes' && (
        <Section title="ATIVIDADE">
          <Row title="Avisar quando um agente parar" desc="Notificação do sistema para terminais com “Monitorar atividade” ligado.">
            <Switch label="Avisar quando um agente parar" checked={s.notifyIdle} onChange={(v) => set({ notifyIdle: v })} />
          </Row>
          <Row title="Considerar parado após" desc="Segundos sem saída no terminal.">
            <Select label="Tempo para considerar parado" value={String(s.idleSeconds)} onChange={(v) => set({ idleSeconds: Number(v) })} options={[['3', '3 s'], ['6', '6 s'], ['15', '15 s'], ['30', '30 s'], ['60', '60 s']]} />
          </Row>
        </Section>
      )}
    </>
  )
}

function TerminalTab({ s, set, mode }) {
  const eff = termOptions(s, mode).theme
  const tc = (k, key, label) => (
    <Color label={label} value={eff[k]} overridden={!!s[key]} onChange={(v) => set({ [key]: v })} onReset={() => set({ [key]: '' })} />
  )
  return (
    <>
      <Section title="CORES">
        <Row title="Esquema" desc="Paleta de 16 cores ANSI + base. Os ajustes abaixo sobrepõem o esquema.">
          <Select label="Esquema de cores" value={s.termScheme} onChange={(v) => set({ termScheme: v, termBg: '', termFg: '', termCursor: '', termSelection: '' })} options={Object.entries(TERM_SCHEMES).map(([k, v]) => [k, v.label])} />
        </Row>
        <Row title="Fundo">{tc('background', 'termBg', 'Cor de fundo do terminal')}</Row>
        <Row title="Texto">{tc('foreground', 'termFg', 'Cor do texto')}</Row>
        <Row title="Cursor">{tc('cursor', 'termCursor', 'Cor do cursor')}</Row>
        <Row title="Seleção">{tc('selectionBackground', 'termSelection', 'Cor da seleção')}</Row>
      </Section>
      <Section title="FONTE">
        <Row title="Família" desc="Qualquer fonte monoespaçada instalada. Aplica-se imediatamente.">
          <input className="set-input" list="term-fonts" aria-label="Família da fonte" value={s.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })} />
          <datalist id="term-fonts">{['JetBrains Mono', 'Cascadia Code', 'Cascadia Mono', 'Consolas', 'Fira Code', 'Source Code Pro', 'Courier New', 'monospace'].map((f) => <option key={f} value={f} />)}</datalist>
        </Row>
        <Row title="Tamanho">
          <Range label="Tamanho da fonte" value={s.fontSize} min={9} max={28} step={1} unit=" px" onChange={(v) => set({ fontSize: v })} />
        </Row>
        <Row title="Peso">
          <Select label="Peso da fonte" value={s.fontWeight} onChange={(v) => set({ fontWeight: v })} options={[['normal', 'Normal'], ['500', 'Médio'], ['600', 'Seminegrito']]} />
        </Row>
        <Row title="Altura da linha">
          <Range label="Altura da linha" value={s.lineHeight} min={1} max={1.6} step={0.1} onChange={(v) => set({ lineHeight: v })} />
        </Row>
        <Row title="Espaço entre letras">
          <Range label="Espaço entre letras" value={s.letterSpacing} min={0} max={4} step={1} unit=" px" onChange={(v) => set({ letterSpacing: v })} />
        </Row>
      </Section>
      <Section title="CURSOR E MARGEM">
        <Row title="Formato do cursor">
          <Select label="Formato do cursor" value={s.cursorStyle} onChange={(v) => set({ cursorStyle: v })} options={[['block', 'Bloco'], ['bar', 'Barra'], ['underline', 'Sublinhado']]} />
        </Row>
        <Row title="Margem lateral">
          <Range label="Margem lateral" value={s.termPadding} min={0} max={32} step={2} unit=" px" onChange={(v) => set({ termPadding: v })} />
        </Row>
      </Section>
      <Section title="COMPORTAMENTO">
        <Row title="Cursor piscando">
          <Switch label="Cursor piscando" checked={s.cursorBlink} onChange={(v) => set({ cursorBlink: v })} />
        </Row>
        <Row title="Histórico (linhas)" desc="Quantas linhas cada terminal guarda para rolagem.">
          <Select label="Histórico" value={String(s.scrollback)} onChange={(v) => set({ scrollback: Number(v) })} options={[['1000', '1.000'], ['5000', '5.000'], ['20000', '20.000'], ['50000', '50.000']]} />
        </Row>
        <Row title="Shell" desc="Programa iniciado em cada terminal. Vazio usa o padrão do sistema (vale para novos terminais).">
          <input className="set-input" aria-label="Shell" placeholder="powershell.exe" value={s.shell} onChange={(e) => set({ shell: e.target.value })} />
        </Row>
      </Section>
    </>
  )
}

const AGENT_LABELS = { claude: 'Claude Code', codex: 'Codex', gemini: 'Gemini', antigravity: 'Antigravity', opencode: 'OpenCode' }

function AgentesTab({ s, set }) {
  return (
    <>
      <Section title="INICIALIZAÇÃO">
        <Row title="Enviar briefing do papel ao iniciar" desc="Instrui cada agente (Maestro ou Agente) sobre quem comanda e como delegar, e instala as skills do canvas.">
          <Switch label="Enviar briefing" checked={s.sendBriefing} onChange={(v) => set({ sendBriefing: v })} />
        </Row>
      </Section>
      <Section title="LIMITES">
        <Row title="Limite de tokens por agente" desc="Ao atingir, o agente é interrompido (Esc + Ctrl+C) e você é avisado. Só Claude Code informa o uso.">
          <Select label="Limite de tokens" value={String(s.tokenLimit)} onChange={(v) => set({ tokenLimit: Number(v) })} options={[['0', 'Desligado'], ['200000', '200 mil'], ['500000', '500 mil'], ['1000000', '1 milhão'], ['5000000', '5 milhões']]} />
        </Row>
      </Section>
      <Section title="COMANDOS">
        {Object.entries(AGENT_LABELS).map(([k, label]) => (
          <Row key={k} title={label} desc={k === 'claude' ? 'Comando digitado no terminal ao criar este agente. Vale para novos terminais.' : undefined}>
            <input className="set-input" aria-label={`Comando de ${label}`} value={s.commands[k] || ''} onChange={(e) => set({ commands: { [k]: e.target.value } })} />
          </Row>
        ))}
      </Section>
    </>
  )
}

const SHORTCUTS = [
  ['Botão direito no fundo', 'Adicionar terminal, nota, portal, árvore de arquivos, texto, grupo'],
  ['Botão direito num nó', 'Copiar, colar, renomear, recarregar, duplicar, bloquear, apagar'],
  ['Arrastar a borda de um nó', 'Ligar a outro nó (solte em qualquer lugar do alvo)'],
  ['Delete / Backspace', 'Excluir nó ou corda selecionada'],
  ['Duplo clique numa nota', 'Editar o texto'],
  ['Ctrl + roda do mouse', 'Zoom no canvas'],
  ['Esc', 'Fechar menus, diálogos e o painel de uso'],
]

function Atalhos() {
  return (
    <Section title="ATALHOS E GESTOS">
      {SHORTCUTS.map(([k, v]) => (
        <div key={k} className="set-row">
          <div className="set-text"><div className="set-title">{k}</div></div>
          <div className="set-ctl set-note">{v}</div>
        </div>
      ))}
    </Section>
  )
}

function Dados({ api, onReset }) {
  const [armed, setArmed] = useState(false)
  return (
    <>
      <Section title="ARMAZENAMENTO">
        <Row title="Pasta de dados" desc="Workspaces, configurações e briefings ficam em arquivos locais.">
          <button className="set-btn" onClick={() => api.openData()}>Abrir pasta</button>
        </Row>
      </Section>
      <Section title="REDEFINIR">
        <Row title="Restaurar configurações padrão" desc="Não apaga workspaces nem terminais.">
          {armed ? (
            <span className="set-confirm">
              <button className="set-btn danger" onClick={() => { onReset(); setArmed(false) }}>Confirmar</button>
              <button className="set-btn" onClick={() => setArmed(false)}>Cancelar</button>
            </span>
          ) : (
            <button className="set-btn" onClick={() => setArmed(true)}>Restaurar</button>
          )}
        </Row>
      </Section>
    </>
  )
}

function Sobre({ api }) {
  const [info, setInfo] = useState(null)
  useEffect(() => { api.appInfo().then(setInfo) }, [])
  return (
    <Section title="AGENT CANVAS">
      <Row title="Versão">{info?.version || '…'}</Row>
      <Row title="Electron">{info?.electron || '…'}</Row>
      <Row title="Node">{info?.node || '…'}</Row>
      <Row title="Dados">
        <span className="set-note" title={info?.dataDir}>{info?.dataDir || '…'}</span>
      </Row>
    </Section>
  )
}

export default function SettingsDialog({ open, onOpenChange, settings, api, mode, update }) {
  const [tab, setTab] = useState('geral')
  const set = (patch) => api.settingsSet(patch)
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dlg-back" />
        <Dialog.Content className="set" aria-describedby={undefined}>
          <Dialog.Title className="visually-hidden">Configurações</Dialog.Title>
          <div className="set-tabs" role="tablist">
            {TABS.map(({ id, label, Icon }) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
                <Icon size={15} /> {label}
              </button>
            ))}
            <Dialog.Close asChild><button className="set-close" aria-label="Fechar"><X size={16} /></button></Dialog.Close>
          </div>
          <div className="set-body">
            {tab === 'geral' && <Geral s={settings} set={set} />}
            {tab === 'tela' && <Tela s={settings} set={set} mode={mode} />}
            {tab === 'terminal' && <TerminalTab s={settings} set={set} mode={mode} />}
            {tab === 'agentes' && <AgentesTab s={settings} set={set} />}
            {tab === 'atalhos' && <Atalhos />}
            {tab === 'updates' && <UpdatesTab s={settings} set={set} api={api} state={update.state} onOpen={update.open} ui={{ Section, Row, Switch }} />}
            {tab === 'dados' && <Dados api={api} onReset={() => api.settingsReset()} />}
            {tab === 'sobre' && <Sobre api={api} />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
