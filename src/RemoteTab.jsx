import { useEffect, useState } from 'react'

const api = window.api
const when = (t) => (t ? new Date(t).toLocaleString('pt-BR') : '—')

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
      <Section title="CONTROLE REMOTO">
        <Row title="Ativar" desc="Abre um servidor seguro (HTTPS) na sua rede Wi-Fi para controlar os agentes pelo celular: ver terminais, digitar, aprovar pedidos e interromper. Só celulares pareados entram.">
          <Switch label="Ativar controle remoto" checked={s.remoteEnabled} onChange={(v) => set({ remoteEnabled: v })} />
        </Row>
        <Row title="Aceitar também HTTP (sem criptografia)" desc="Use só se o navegador do celular recusar o HTTPS (o Safari do iPhone costuma recusar certificados autoassinados). Quem estiver no mesmo Wi-Fi poderia ler o que passa; ligue só em rede de confiança, pareie e desligue.">
          <Switch label="Aceitar HTTP" checked={s.remoteHttp} onChange={(v) => set({ remoteHttp: v })} />
        </Row>
        <Row title="Porta" desc="Vale ao ligar o controle remoto. O HTTP usa a porta seguinte.">
          <input className="set-input" type="number" min="1024" max="65535" aria-label="Porta" value={s.remotePort} disabled={s.remoteEnabled} onChange={(e) => set({ remotePort: Number(e.target.value) || 7443 })} />
        </Row>
        {st?.error && <p className="err" style={{ margin: '0 0 8px' }}>{st.error}</p>}
      </Section>

      {st?.listening && (
        <Section title="PAREAR UM CELULAR">
          <Row title="Novo celular" desc="Gera um QR code que vale por 2 minutos e serve uma única vez. Escaneie com a câmera do celular (conectado ao mesmo Wi-Fi).">
            <button className="set-btn" onClick={startPair}>Gerar QR code</button>
          </Row>
          {pair?.error && <p className="err">{pair.error}</p>}
          {pair?.qr && (
            <div className="remote-pair">
              <img src={pair.qr} alt="QR code de pareamento" width={220} height={220} />
              <div>
                <p>Expira em <b>{Math.max(left, 0)} s</b>.</p>
                <p className="set-note-left">Se a câmera não abrir sozinha, digite no navegador do celular:</p>
                {pair.urls.map((u) => <code key={u} className="remote-url">{u}</code>)}
                <p className="set-note-left">{pair.urls[0].startsWith('http:') ? 'O QR code aponta para o endereço HTTP (sem criptografia). ' : ''}O navegador vai avisar que o certificado não é confiável: é esperado, o app cria o próprio certificado. Confira que a impressão digital (SHA-256) mostrada na página de detalhes do certificado é <code className="remote-url">{st.fingerprint}</code></p>
              </div>
            </div>
          )}
          <Row title="Endereços" desc="Acesso depois de pareado.">
            <span className="set-note">{st.addresses.flatMap((ip) => [`https://${ip}:${st.port}`, ...(st.httpPort ? [`http://${ip}:${st.httpPort}`] : [])]).join('  ·  ') || 'sem rede'}</span>
          </Row>
        </Section>
      )}

      <Section title="CELULARES PAREADOS">
        {(st?.devices || []).length === 0 && <p className="set-note-left">Nenhum celular pareado.</p>}
        {(st?.devices || []).map((d) => (
          <Row key={d.id} title={d.name} desc={`Pareado em ${when(d.created)} · último acesso ${when(d.lastSeen)}`}>
            <button className="set-btn danger" onClick={() => revoke(d.id)}>Revogar</button>
          </Row>
        ))}
      </Section>

      <Section title="SEGURANÇA">
        <p className="set-note-left">
          Use só em redes em que você confia. A conexão é criptografada, o pareamento exige o QR code (uso único, 2 minutos) e cada celular recebe uma credencial própria e revogável.
          O celular pode ver e digitar nos terminais, aprovar pedidos e interromper agentes; não pode mudar configurações nem criar ou apagar nada. Após 10 tentativas inválidas o endereço é bloqueado por 10 minutos.
          Tudo que o celular faz aparece na linha do tempo de Atividade.
        </p>
      </Section>
    </>
  )
}
