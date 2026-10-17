import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { PRESETS, resolveTheme, TERM_SCHEMES, termOptions } from './themes.js'
import { SlidersHorizontal, Palette, SquareTerminal, Bot, Keyboard, Database, Info, RefreshCw, Smartphone, CalendarClock, Stethoscope, X } from 'lucide-react'
import { UpdatesTab } from './Updates.jsx'
import RemoteTab from './RemoteTab.jsx'
import RoutinesTab from './RoutinesTab.jsx'
import { DiagTab } from './Diagnostics.jsx'
import { tr } from './i18n.js'

const TABS = [
  { id: 'geral', label: tr("Geral"), Icon: SlidersHorizontal },
  { id: 'tela', label: tr("Tela"), Icon: Palette },
  { id: 'terminal', label: tr("Terminal"), Icon: SquareTerminal },
  { id: 'agentes', label: tr("Agentes"), Icon: Bot },
  { id: 'atalhos', label: tr("Atalhos"), Icon: Keyboard },
  { id: 'diag', label: tr("Diagnóstico"), Icon: Stethoscope },
  { id: 'rotinas', label: tr("Rotinas"), Icon: CalendarClock },
  { id: 'remoto', label: tr("Controle remoto"), Icon: Smartphone },
  { id: 'updates', label: tr("Atualizações"), Icon: RefreshCw },
  { id: 'dados', label: tr("Dados"), Icon: Database },
  { id: 'sobre', label: tr("Sobre"), Icon: Info },
]
const SUBTABS = [
  { id: 'sistema', label: tr("Sistema") },
  { id: 'notificacoes', label: tr("Notificações") },
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
    {overridden && <button className="set-link" onClick={onReset}>{tr("padrão")}</button>}
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
    <Color label={tr(label)} value={t[k]} overridden={over(k)} onChange={(v) => setC({ [k]: v })} onReset={() => setC({ [k]: null })} />
  )
  return (
    <>
      <Section title={tr("APARÊNCIA")}>
        <Row title={tr("Modo")} desc={tr("Claro, escuro ou seguir o sistema operacional.")}>
          <Select label={tr("Modo")} value={s.appearance} onChange={(v) => set({ appearance: v })} options={[['system', tr("Sistema")], ['light', tr("Claro")], ['dark', tr("Escuro")]]} />
        </Row>
      </Section>
      <Section title={tr("TEMA DO CANVAS")}>
        <div className="swatches" role="radiogroup" aria-label={tr("Tema do canvas")}>
          {PRESETS.map((p) => (
            <button key={p.id} role="radio" aria-checked={s.theme === p.id} className={'swatch-card' + (s.theme === p.id ? ' on' : '')} onClick={() => set({ theme: p.id, custom: null })}>
              <Swatch p={p} mode={mode} />
              <span>{p.label}</span>
            </button>
          ))}
        </div>
        <p className="set-hint">{tr("Escolher um tema limpa as personalizações abaixo.")}</p>
      </Section>
      <Section title={tr("GRADE")}>
        <Row title={tr("Estilo")}>
          <Select label={tr("Estilo da grade")} value={t.gridStyle} onChange={(v) => setC({ gridStyle: v })} options={[['lines', tr("Linhas")], ['dots', tr("Pontos")], ['cross', tr("Cruzes")], ['none', tr("Nenhuma")]]} />
        </Row>
        <Row title={tr("Espaçamento")}><Range label={tr("Espaçamento da grade")} value={t.gap} min={8} max={80} step={2} unit=" px" onChange={(v) => setC({ gap: v })} /></Row>
        <Row title={tr("Espessura")}><Range label={tr("Espessura da grade")} value={t.size} min={0.5} max={4} step={0.5} unit=" px" onChange={(v) => setC({ size: v })} /></Row>
        <Row title={tr("Cor da grade")}>{color('grid', 'Cor da grade')}</Row>
        <Row title={tr("Cor do fundo")}>{color('canvas', 'Cor do fundo')}</Row>
        <Row title={tr("Encaixar à grade")} desc={tr("Os nós se alinham ao arrastar.")}>
          <Switch label={tr("Encaixar à grade")} checked={t.snap} onChange={(v) => setC({ snap: v })} />
        </Row>
        {t.snap && (
          <Row title={tr("Tamanho do encaixe")}><Range label={tr("Tamanho do encaixe")} value={t.snapSize} min={8} max={80} step={4} unit=" px" onChange={(v) => setC({ snapSize: v })} /></Row>
        )}
      </Section>
      <Section title={tr("CORDAS")}>
        <Row title={tr("Cor")}>{color('edge', 'Cor das cordas')}</Row>
        <Row title={tr("Estilo")}>
          <Select label={tr("Estilo das cordas")} value={t.edgeStyle} onChange={(v) => setC({ edgeStyle: v })} options={[['dashed', tr("Tracejada")], ['dotted', tr("Pontilhada")], ['solid', tr("Sólida")]]} />
        </Row>
        <Row title={tr("Espessura")}><Range label={tr("Espessura das cordas")} value={t.edgeWidth} min={1} max={6} step={0.5} unit=" px" onChange={(v) => setC({ edgeWidth: v })} /></Row>
        <Row title={tr("Folga")} desc={tr("Quanto a corda cai entre os nós. 0 = reta.")}>
          <Range label={tr("Folga das cordas")} value={t.edgeSag} min={0} max={2} step={0.1} onChange={(v) => setC({ edgeSag: v })} />
        </Row>
        <Row title={tr("Destacar comunicação")} desc={tr("A corda muda de cor e corre enquanto dois agentes trocam mensagens, e volta ao normal quando param.")}>
          <Switch label={tr("Destacar comunicação")} checked={t.commHighlight} onChange={(v) => setC({ commHighlight: v })} />
        </Row>
        {t.commHighlight && (
          <>
            <Row title={tr("Cor durante a comunicação")}>{color('comm', 'Cor durante a comunicação')}</Row>
            <Row title={tr("Manter destacada após a última mensagem")}>
              <Select label={tr("Tempo de destaque")} value={String(t.commSeconds)} onChange={(v) => setC({ commSeconds: Number(v) })} options={[['3', '3 s'], ['6', '6 s'], ['10', '10 s'], ['20', '20 s']]} />
            </Row>
          </>
        )}
        <Row title={tr("Animar")} desc={tr("Faz o tracejado correr ao longo da corda.")}>
          <Switch label={tr("Animar cordas")} checked={t.edgeFlow} onChange={(v) => setC({ edgeFlow: v })} />
        </Row>
      </Section>
      <Section title={tr("CARTÕES E DESTAQUE")}>
        <Row title={tr("Cor de destaque")}>{color('accent', 'Cor de destaque')}</Row>
        <Row title={tr("Arredondamento")}><Range label={tr("Arredondamento dos cartões")} value={t.radius} min={0} max={28} step={2} unit=" px" onChange={(v) => setC({ radius: v })} /></Row>
        <Row title={tr("Sombra nos cartões")}>
          <Switch label={tr("Sombra nos cartões")} checked={t.shadow} onChange={(v) => setC({ shadow: v })} />
        </Row>
        <Row title={tr("Minimapa ao abrir")} desc={tr("Abre a navegação em miniatura junto com o canvas.")}>
          <Switch label={tr("Minimapa ao abrir")} checked={s.showMinimap} onChange={(v) => set({ showMinimap: v })} />
        </Row>
      </Section>
      <Section title={tr("PERSONALIZAÇÃO")}>
        <Row title={tr("Voltar ao padrão do tema")} desc={tr("Remove todos os valores alterados acima.")}>
          <button className="set-btn" onClick={() => set({ custom: null })}>{tr("Redefinir")}</button>
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
          <Section title={tr("APARÊNCIA")}>
            <Row title="Idioma / Language" desc={tr("O app recarrega ao trocar (os terminais continuam rodando).")}>
              <Select label="Idioma / Language" value={s.language} onChange={(v) => set({ language: v }).then(() => location.reload())} options={[['auto', tr('Automático')], ['pt', 'Português'], ['en', 'English']]} />
            </Row>
            <Row title={tr("Aparência")} desc={tr("Sistema segue a configuração do seu sistema operacional.")}>
              <Select label={tr("Aparência")} value={s.appearance} onChange={(v) => set({ appearance: v })} options={[['system', tr("Sistema")], ['light', tr("Claro")], ['dark', tr("Escuro")]]} />
            </Row>
          </Section>
          <Section title={tr("ENERGIA")}>
            <Row title={tr("Impedir a suspensão")} desc={tr("Mantém o computador acordado para os agentes continuarem trabalhando sem supervisão.")}>
              <Select label={tr("Impedir a suspensão")} value={s.powerSave} onChange={(v) => set({ powerSave: v })} options={[['agents', tr("Enquanto os agentes trabalham")], ['always', tr("Sempre")], ['never', tr("Nunca")]]} />
            </Row>
          </Section>
          <Section title={tr("SAÍDA DO APLICATIVO")}>
            <Row title={tr("Pedir confirmação para sair")} desc={tr("Pergunta antes de fechar a janela, para não interromper os agentes em execução por engano.")}>
              <Switch label={tr("Pedir confirmação para sair")} checked={s.confirmQuit} onChange={(v) => set({ confirmQuit: v })} />
            </Row>
          </Section>
          <Section title={tr("INTERFACE")}>
            <Row title={tr("Cursor de mão ao passar o mouse")} desc={tr("Mostra o cursor de mão sobre botões e menus, como em um navegador web.")}>
              <Switch label={tr("Cursor de mão")} checked={s.handCursor} onChange={(v) => set({ handCursor: v })} />
            </Row>
          </Section>
        </>
      )}
      {sub === 'notificacoes' && (
        <Section title={tr("ATIVIDADE")}>
          <Row title={tr("Avisar quando um agente parar")} desc={tr("Notificação do sistema para terminais com “Monitorar atividade” ligado.")}>
            <Switch label={tr("Avisar quando um agente parar")} checked={s.notifyIdle} onChange={(v) => set({ notifyIdle: v })} />
          </Row>
          <Row title={tr("Considerar parado após")} desc={tr("Segundos sem saída no terminal.")}>
            <Select label={tr("Tempo para considerar parado")} value={String(s.idleSeconds)} onChange={(v) => set({ idleSeconds: Number(v) })} options={[['3', '3 s'], ['6', '6 s'], ['15', '15 s'], ['30', '30 s'], ['60', '60 s']]} />
          </Row>
        </Section>
      )}
    </>
  )
}

function TerminalTab({ s, set, mode }) {
  const eff = termOptions(s, mode).theme
  const tc = (k, key, label) => (
    <Color label={tr(label)} value={eff[k]} overridden={!!s[key]} onChange={(v) => set({ [key]: v })} onReset={() => set({ [key]: '' })} />
  )
  return (
    <>
      <Section title={tr("CORES")}>
        <Row title={tr("Esquema")} desc={tr("Paleta de 16 cores ANSI + base. Os ajustes abaixo sobrepõem o esquema.")}>
          <Select label={tr("Esquema de cores")} value={s.termScheme} onChange={(v) => set({ termScheme: v, termBg: '', termFg: '', termCursor: '', termSelection: '' })} options={Object.entries(TERM_SCHEMES).map(([k, v]) => [k, v.label])} />
        </Row>
        <Row title={tr("Fundo")}>{tc('background', 'termBg', 'Cor de fundo do terminal')}</Row>
        <Row title={tr("Texto")}>{tc('foreground', 'termFg', 'Cor do texto')}</Row>
        <Row title={tr("Cursor")}>{tc('cursor', 'termCursor', 'Cor do cursor')}</Row>
        <Row title={tr("Seleção")}>{tc('selectionBackground', 'termSelection', 'Cor da seleção')}</Row>
      </Section>
      <Section title={tr("FONTE")}>
        <Row title={tr("Família")} desc={tr("Qualquer fonte monoespaçada instalada. Aplica-se imediatamente.")}>
          <input className="set-input" list="term-fonts" aria-label={tr("Família da fonte")} value={s.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })} />
          <datalist id="term-fonts">{['JetBrains Mono', 'Cascadia Code', 'Cascadia Mono', 'Consolas', 'Fira Code', 'Source Code Pro', 'Courier New', 'monospace'].map((f) => <option key={f} value={f} />)}</datalist>
        </Row>
        <Row title={tr("Tamanho")}>
          <Range label={tr("Tamanho da fonte")} value={s.fontSize} min={9} max={28} step={1} unit=" px" onChange={(v) => set({ fontSize: v })} />
        </Row>
        <Row title={tr("Peso")}>
          <Select label={tr("Peso da fonte")} value={s.fontWeight} onChange={(v) => set({ fontWeight: v })} options={[['normal', tr("Normal")], ['500', tr("Médio")], ['600', tr("Seminegrito")]]} />
        </Row>
        <Row title={tr("Altura da linha")}>
          <Range label={tr("Altura da linha")} value={s.lineHeight} min={1} max={1.6} step={0.1} onChange={(v) => set({ lineHeight: v })} />
        </Row>
        <Row title={tr("Espaço entre letras")}>
          <Range label={tr("Espaço entre letras")} value={s.letterSpacing} min={0} max={4} step={1} unit=" px" onChange={(v) => set({ letterSpacing: v })} />
        </Row>
      </Section>
      <Section title={tr("CURSOR E MARGEM")}>
        <Row title={tr("Formato do cursor")}>
          <Select label={tr("Formato do cursor")} value={s.cursorStyle} onChange={(v) => set({ cursorStyle: v })} options={[['block', tr("Bloco")], ['bar', tr("Barra")], ['underline', tr("Sublinhado")]]} />
        </Row>
        <Row title={tr("Margem lateral")}>
          <Range label={tr("Margem lateral")} value={s.termPadding} min={0} max={32} step={2} unit=" px" onChange={(v) => set({ termPadding: v })} />
        </Row>
      </Section>
      <Section title={tr("COMPORTAMENTO")}>
        <Row title={tr("Cursor piscando")}>
          <Switch label={tr("Cursor piscando")} checked={s.cursorBlink} onChange={(v) => set({ cursorBlink: v })} />
        </Row>
        <Row title={tr("Histórico (linhas)")} desc={tr("Quantas linhas cada terminal guarda para rolagem.")}>
          <Select label={tr("Histórico")} value={String(s.scrollback)} onChange={(v) => set({ scrollback: Number(v) })} options={[['1000', '1.000'], ['5000', '5.000'], ['20000', '20.000'], ['50000', '50.000']]} />
        </Row>
        <Row title={tr("Shell")} desc={tr("Programa iniciado em cada terminal. Vazio usa o padrão do sistema (vale para novos terminais).")}>
          <input className="set-input" aria-label={tr("Shell")} placeholder={tr("powershell.exe")} value={s.shell} onChange={(e) => set({ shell: e.target.value })} />
        </Row>
      </Section>
    </>
  )
}

const AGENT_LABELS = { claude: 'Claude Code', codex: 'Codex', gemini: 'Gemini', antigravity: 'Antigravity', opencode: 'OpenCode' }

function AgentesTab({ s, set }) {
  return (
    <>
      <Section title={tr("INICIALIZAÇÃO")}>
        <Row title={tr("Enviar briefing do papel ao iniciar")} desc={tr("Instrui cada agente (Maestro ou Agente) sobre quem comanda e como delegar, e instala as skills do canvas.")}>
          <Switch label={tr("Enviar briefing")} checked={s.sendBriefing} onChange={(v) => set({ sendBriefing: v })} />
        </Row>
      </Section>
      <Section title={tr("SEGURANÇA")}>
        <Row title={tr("Pedir sua aprovação")} desc={tr("Protege contra um agente que seguiu uma instrução maliciosa de uma página ou arquivo. Sem resposta em 2 minutos, o pedido é negado.")}>
          <Select label={tr("Aprovação")} value={s.approval} onChange={(v) => set({ approval: v })} options={[['off', tr("Nunca (tudo liberado)")], ['spawn', tr("Ao criar agentes")], ['all', tr("Em tudo (mensagens, agentes, navegador)")]]} />
        </Row>
      </Section>
      <Section title={tr("LIMITES")}>
        <Row title={tr("Limite de tokens por agente")} desc={tr("Ao atingir, o agente é interrompido (Esc + Ctrl+C) e você é avisado. Vale para Claude Code, Codex e Gemini. No Codex a contagem é da sessão mais recente da pasta do agente.")}>
          <Select label={tr("Limite de tokens")} value={String(s.tokenLimit)} onChange={(v) => set({ tokenLimit: Number(v) })} options={[['0', tr("Desligado")], ['200000', tr("200 mil")], ['500000', tr("500 mil")], ['1000000', tr("1 milhão")], ['5000000', tr("5 milhões")]]} />
        </Row>
      </Section>
      <Section title={tr("COMANDOS")}>
        {Object.entries(AGENT_LABELS).map(([k, label]) => (
          <Row key={k} title={label} desc={k === 'claude' ? tr("Comando digitado no terminal ao criar este agente. Vale para novos terminais.") : undefined}>
            <input className="set-input" aria-label={tr("Comando de {0}", [label])} value={s.commands[k] || ''} onChange={(e) => set({ commands: { [k]: e.target.value } })} />
          </Row>
        ))}
      </Section>
    </>
  )
}

const SHORTCUTS = [
  [tr('Botão direito no fundo'), tr('Adicionar terminal, nota, portal, árvore de arquivos, texto, grupo')],
  [tr('Botão direito num nó'), tr('Copiar, colar, renomear, recarregar, duplicar, bloquear, apagar')],
  [tr('Arrastar a borda de um nó'), tr('Ligar a outro nó (solte em qualquer lugar do alvo)')],
  ['Delete / Backspace', tr('Excluir nó ou corda selecionada')],
  [tr('Duplo clique numa nota'), tr('Editar o texto')],
  [tr('Ctrl + roda do mouse'), tr('Zoom no canvas')],
  ['Ctrl + K', tr('Paleta: ir para workspace ou terminal, buscar na saída dos terminais, executar ações')],
  ['Ctrl + Z / Ctrl + Shift + Z (ou Ctrl + Y)'.replace('ou', tr('ou')), tr('Desfazer / refazer no canvas (fora de terminais e campos de texto)')],
  [tr('Arrastar um Grupo'), tr('Leva junto os nós que estão dentro dele')],
  ['Esc', tr('Fechar menus, diálogos e o painel de uso')],
]

// On a Mac the shortcuts use Cmd.
const MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
const platformKeys = (s) => (MAC ? s.replace(/Ctrl/g, '⌘') : s)

function Atalhos() {
  return (
    <Section title={tr("ATALHOS E GESTOS")}>
      {SHORTCUTS.map(([k0, v]) => { const k = platformKeys(k0); return (
        <div key={k} className="set-row">
          <div className="set-text"><div className="set-title">{k}</div></div>
          <div className="set-ctl set-note">{v}</div>
        </div>
      ) })}
    </Section>
  )
}

function Dados({ api, onReset, io }) {
  const [armed, setArmed] = useState(false)
  const [msg, setMsg] = useState('')
  return (
    <>
      <Section title={tr("ARMAZENAMENTO")}>
        <Row title={tr("Pasta de dados")} desc={tr("Workspaces, configurações e briefings ficam em arquivos locais.")}>
          <button className="set-btn" onClick={() => api.openData()}>{tr("Abrir pasta")}</button>
        </Row>
      </Section>
      <Section title={tr("BACKUP E TRANSFERÊNCIA")}>
        <Row title={tr("Backups automáticos")} desc={tr("Uma cópia dos workspaces a cada 10 minutos (as 20 últimas). Se o arquivo principal estragar, o app restaura sozinho a última cópia boa.")}>
          <button className="set-btn" onClick={() => api.openBackups()}>{tr("Abrir pasta")}</button>
        </Row>
        <Row title={tr("Exportar / importar workspaces")} desc={msg || tr("Salva todos os workspaces em um arquivo. Ao importar, terminais começam do zero (sem conversa nem worktree) e nada existente é sobrescrito.")}>
          <span className="set-confirm">
            <button className="set-btn" onClick={() => io.export().then((m) => m && setMsg(m))}>{tr("Exportar…")}</button>
            <button className="set-btn" onClick={() => io.import().then((m) => m && setMsg(m))}>{tr("Importar…")}</button>
          </span>
        </Row>
      </Section>
      <Section title={tr("REDEFINIR")}>
        <Row title={tr("Restaurar configurações padrão")} desc={tr("Não apaga workspaces nem terminais.")}>
          {armed ? (
            <span className="set-confirm">
              <button className="set-btn danger" onClick={() => { onReset(); setArmed(false) }}>{tr("Confirmar")}</button>
              <button className="set-btn" onClick={() => setArmed(false)}>{tr("Cancelar")}</button>
            </span>
          ) : (
            <button className="set-btn" onClick={() => setArmed(true)}>{tr("Restaurar")}</button>
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
    <Section title={tr("AGENT CANVAS")}>
      <Row title={tr("Versão")}>{info?.version || '…'}</Row>
      <Row title={tr("Electron")}>{info?.electron || '…'}</Row>
      <Row title={tr("Node")}>{info?.node || '…'}</Row>
      <Row title={tr("Dados")}>
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
          <Dialog.Title className="visually-hidden">{tr("Configurações")}</Dialog.Title>
          <div className="set-tabs" role="tablist">
            {TABS.map(({ id, label, Icon }) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
                <Icon size={15} /> {label}
              </button>
            ))}
            <Dialog.Close asChild><button className="set-close" aria-label={tr("Fechar")}><X size={16} /></button></Dialog.Close>
          </div>
          <div className="set-body">
            {tab === 'geral' && <Geral s={settings} set={set} />}
            {tab === 'tela' && <Tela s={settings} set={set} mode={mode} />}
            {tab === 'terminal' && <TerminalTab s={settings} set={set} mode={mode} />}
            {tab === 'agentes' && <AgentesTab s={settings} set={set} />}
            {tab === 'atalhos' && <Atalhos />}
            {tab === 'diag' && <DiagTab ui={{ Section }} />}
            {tab === 'rotinas' && <RoutinesTab targets={update.targets} ui={{ Section, Row, Switch }} />}
            {tab === 'remoto' && <RemoteTab s={settings} set={set} ui={{ Section, Row, Switch }} />}
            {tab === 'updates' && <UpdatesTab s={settings} set={set} api={api} state={update.state} onOpen={update.open} ui={{ Section, Row, Switch }} />}
            {tab === 'dados' && <Dados api={api} onReset={() => api.settingsReset()} io={update.io} />}
            {tab === 'sobre' && <Sobre api={api} />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
