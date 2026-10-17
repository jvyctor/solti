import { useEffect, useState } from 'react'
import { getLang, tr } from './i18n.js'

const api = window.api
const when = (t) => (t ? new Date(t).toLocaleString(getLang() === 'en' ? 'en-US' : 'pt-BR') : '—')

// Settings → Controle remoto. Section/Row/Switch come from Settings.jsx.
export default function RemoteTab({ s, set, ui: { Section, Row, Switch } }) {
  const [st, setSt] = useState(null)
  const [pair, setPair] = useState(null) // { urls, qr, expires } | { error }
  const [left, setLeft] = useState(0)

  const load = () => api.remoteStatus().then(setSt)
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t) }, [s.remoteEnabled])
  useEffect(() => {
    if (!pair?.expires) return
    const t = setInterval(() => { const l = Math.round((pair.expires - Date.now()) / 1000); setLeft(l); if (l <= 0) setPair(null) }, 500)
    return () => clearInterval(t)
  }, [pair])

  const startPair = async () => { const r = await api.remotePair(); setPair(r); setLeft(r.expires ? Math.round((r.expires - Date.now()) / 1000) : 0) }
  const revoke = (id) => api.remoteRevoke(id).then(load)

  return (
    <>
      <Section title={tr("CONTROLE REMOTO")}>
        <Row title={tr("Ativar")} desc={tr("Abre um servidor seguro (HTTPS) na sua rede Wi-Fi para controlar os agentes pelo celular: ver terminais, digitar, aprovar pedidos e interromper. Só celulares pareados entram.")}>
          <Switch label={tr("Ativar controle remoto")} checked={s.remoteEnabled} onChange={(v) => set({ remoteEnabled: v })} />
        </Row>
        <Row title={tr("Aceitar também HTTP (sem criptografia)")} desc={tr("Use só se o navegador do celular recusar o HTTPS (o Safari do iPhone costuma recusar certificados autoassinados). Quem estiver no mesmo Wi-Fi poderia ler o que passa; ligue só em rede de confiança, pareie e desligue.")}>
          <Switch label={tr("Aceitar HTTP")} checked={s.remoteHttp} onChange={(v) => set({ remoteHttp: v })} />
        </Row>
        <Row title={tr("Porta")} desc={tr("Vale ao ligar o controle remoto. O HTTP usa a porta seguinte.")}>
          <input className="set-input" type="number" min="1024" max="65535" aria-label={tr("Porta")} value={s.remotePort} disabled={s.remoteEnabled} onChange={(e) => set({ remotePort: Number(e.target.value) || 7443 })} />
        </Row>
        {st?.error && <p className="err" style={{ margin: '0 0 8px' }}>{st.error}</p>}
      </Section>

      {st?.listening && (
        <Section title={tr("PAREAR UM CELULAR")}>
          <Row title={tr("Novo celular")} desc={tr("Gera um QR code que vale por 2 minutos e serve uma única vez. Escaneie com a câmera do celular (conectado ao mesmo Wi-Fi).")}>
            <button className="set-btn" onClick={startPair}>{tr("Gerar QR code")}</button>
          </Row>
          {pair?.error && <p className="err">{pair.error}</p>}
          {pair?.qr && (
            <div className="remote-pair">
              <img src={pair.qr} alt={tr("QR code de pareamento")} width={220} height={220} />
              <div>
                <p>{tr("Expira em")} <b>{Math.max(left, 0)} s</b>.</p>
                <p className="set-note-left">{tr("Se a câmera não abrir sozinha, digite no navegador do celular:")}</p>
                {pair.urls.map((u) => <code key={u} className="remote-url">{u}</code>)}
                <p className="set-note-left">{pair.urls[0].startsWith('http:') ? tr("O QR code aponta para o endereço HTTP (sem criptografia). ") : ''}{tr("O navegador vai avisar que o certificado não é confiável: é esperado, o app cria o próprio certificado. Confira que a impressão digital (SHA-256) mostrada na página de detalhes do certificado é")} <code className="remote-url">{st.fingerprint}</code></p>
              </div>
            </div>
          )}
          <Row title={tr("Endereços")} desc={tr("Acesso depois de pareado.")}>
            <span className="set-note">{st.addresses.flatMap((ip) => [`https://${ip}:${st.port}`, ...(st.httpPort ? [`http://${ip}:${st.httpPort}`] : [])]).join('  ·  ') || tr("sem rede")}</span>
          </Row>
        </Section>
      )}

      <Section title={tr("CELULARES PAREADOS")}>
        {(st?.devices || []).length === 0 && <p className="set-note-left">{tr("Nenhum celular pareado.")}</p>}
        {(st?.devices || []).map((d) => (
          <Row key={d.id} title={d.name} desc={tr("Pareado em {0} · último acesso {1}", [when(d.created), when(d.lastSeen)])}>
            <button className="set-btn danger" onClick={() => revoke(d.id)}>{tr("Revogar")}</button>
          </Row>
        ))}
      </Section>

      <Section title={tr("SEGURANÇA")}>
        <p className="set-note-left">
          {tr("Use só em redes em que você confia. A conexão é criptografada, o pareamento exige o QR code (uso único, 2 minutos) e cada celular recebe uma credencial própria e revogável. O celular pode ver e digitar nos terminais, aprovar pedidos e interromper agentes; não pode mudar configurações nem criar ou apagar nada. Após 10 tentativas inválidas o endereço é bloqueado por 10 minutos. Tudo que o celular faz aparece na linha do tempo de Atividade.")}
        </p>
      </Section>
    </>
  )
}
