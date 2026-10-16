// Agent control of a Portal (<webview>): navigate, click, type, press keys, scroll, screenshot.
// No arbitrary script execution: every action runs a fixed snippet with JSON-encoded arguments.
const j = JSON.stringify

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function act(wc, a) {
  const run = (code) => wc.executeJavaScript(code)
  switch (a.action) {
    case 'go': {
      if (!/^https?:\/\//i.test(a.url || '')) throw new Error('url must start with http:// or https://')
      await wc.loadURL(a.url)
      return { ok: true, url: wc.getURL(), title: wc.getTitle() }
    }
    case 'back': wc.goBack(); await sleep(500); return { ok: true, url: wc.getURL() }
    case 'reload': wc.reload(); await sleep(500); return { ok: true }
    case 'click': {
      const found = await run(`(() => { const e = document.querySelector(${j(a.selector || '')}); if (!e) return false; e.scrollIntoView({ block: 'center' }); e.click(); return true })()`)
      if (!found) throw new Error('element not found: ' + a.selector)
      await sleep(300)
      return { ok: true }
    }
    case 'clicktext': {
      const found = await run(`(() => { const t = ${j(String(a.text || '').toLowerCase())}; const e = [...document.querySelectorAll('a,button,[role=button],input[type=submit],input[type=button],summary')].find(x => (x.innerText || x.value || '').trim().toLowerCase().includes(t)); if (!e) return false; e.scrollIntoView({ block: 'center' }); e.click(); return true })()`)
      if (!found) throw new Error('no clickable element with text: ' + a.text)
      await sleep(300)
      return { ok: true }
    }
    case 'type': {
      // Native setter + events, so React/Vue controlled inputs notice the change.
      const found = await run(`(() => { const e = document.querySelector(${j(a.selector || '')}); if (!e) return false; e.focus(); const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; const set = Object.getOwnPropertyDescriptor(proto, 'value')?.set; set ? set.call(e, ${j(String(a.value ?? ''))}) : (e.value = ${j(String(a.value ?? ''))}); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
      if (!found) throw new Error('element not found: ' + a.selector)
      return { ok: true }
    }
    case 'press': {
      const key = String(a.key || 'Enter')
      wc.focus()
      wc.sendInputEvent({ type: 'keyDown', keyCode: key })
      if (key.length === 1) wc.sendInputEvent({ type: 'char', keyCode: key })
      wc.sendInputEvent({ type: 'keyUp', keyCode: key })
      await sleep(300)
      return { ok: true }
    }
    case 'scroll': await run(`window.scrollBy(0, ${Number(a.dy) || 600})`); return { ok: true }
    case 'screenshot': {
      let img = await wc.capturePage()
      const { width } = img.getSize()
      if (width > 1280) img = img.resize({ width: 1280 }) // keeps the image a sane size for an agent to look at
      return { ok: true, png: img.toPNG(), url: wc.getURL() }
    }
    default: throw new Error('unknown action: ' + a.action)
  }
}

module.exports = { act }
