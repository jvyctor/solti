// Optional outside notice when something waits for your approval: a Slack / Discord / Telegram webhook or an ntfy topic
// (the URL is yours; empty = off). Only the approval text goes out, never terminal output. Answering stays in the app or on the phone remote.

// What to POST for `url`: { url, headers, body }. Pure, so it is unit-tested.
function buildPush(url, title, text) {
  const u = new URL(url)
  const msg = `${title}\n${text}`.slice(0, 1500)
  const json = (o) => ({ url, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) })
  if (u.hostname === 'hooks.slack.com') return json({ text: msg })
  if (/(^|\.)discord(app)?\.com$/.test(u.hostname)) return json({ content: msg })
  if (u.hostname === 'api.telegram.org') return json({ chat_id: u.searchParams.get('chat_id'), text: msg })
  return { url, headers: { 'Content-Type': 'text/plain; charset=utf-8', Title: encodeURIComponent(title).slice(0, 200) }, body: msg } // ntfy and anything that takes plain text
}

const valid = (url) => { try { return new URL(url).protocol === 'https:' } catch { return false } }

function init({ activity, settings, tr }) {
  return activity.on('request', (r) => {
    const url = String(settings.get().pushUrl || '').trim()
    if (!url || !valid(url)) return
    const p = buildPush(url, tr('Solti: aprovação pedida'), `${r.from || ''}${r.to ? ' → ' + r.to : ''}\n${r.text || ''}`)
    fetch(p.url, { method: 'POST', headers: p.headers, body: p.body, signal: AbortSignal.timeout(8000) }).catch(() => {})
  })
}

module.exports = { init, buildPush, valid }
