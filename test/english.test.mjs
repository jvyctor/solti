// English mode must not show Portuguese anywhere on the main screens (settings tabs, menus, palette, dialogs).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, sleep } from './helpers.mjs'
import en from '../src/locales/en.js'
test('English mode shows no Portuguese text', async () => {
const prof = mkdtempSync(join(tmpdir(), 'ac-en-'))
const term = (id, name, x, extra = {}) => ({ id, type: 'terminal', position: { x, y: 0 }, style: { width: 520, height: 260 }, data: { name, preset: 'shell', ...extra } })
const nodes = [term('a', 'dev', 0), term('b', 'rev', 600), { id: 'd', type: 'diff', position: { x: 0, y: 320 }, style: { width: 500, height: 300 }, data: {} }, { id: 'k', type: 'knowledge', position: { x: 600, y: 320 }, style: { width: 300, height: 200 }, data: { text: '' } }, { id: 'p', type: 'pipeline', position: { x: 1000, y: 0 }, style: { width: 420, height: 480 }, data: { steps: [{ agent: 'a', prompt: '' }] } }, { id: 'f', type: 'files', position: { x: 1000, y: 520 }, style: { width: 260, height: 200 }, data: { path: prof } }, { id: 'po', type: 'portal', position: { x: 1500, y: 0 }, style: { width: 400, height: 300 }, data: { url: 'about:blank' } }, { id: 'n', type: 'note', position: { x: 1500, y: 400 }, style: { width: 220, height: 160 }, data: { text: '' } }]
writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [{ id: 'w1', name: 'A', nodes, edges: [] }, { id: 'w2', name: 'B', nodes: [], edges: [] }], active: 'w1' }))
writeFileSync(join(prof, 'settings.json'), JSON.stringify({ language: 'en', onboarded: true }))
const app = await launch(prof, 9540)
const PTKEYS = Object.keys(en).filter((k) => k.length > 3 && en[k] !== k)
const PT = /[áàâãéêíóôõúç]|\b(para|não|você|nenhum|nenhuma|com|uma|dos|das|pelo|este|esta|ainda|quando|todos|abrir|fechar|criar|salvar|ligar|digite|escolha)\b/i
const seen = new Map()
const grab = async (label) => {
  const lines = await app.ev(`(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const s = n.textContent.trim(); if (s.length > 1) out.push(s) } for (const e of document.querySelectorAll('[placeholder],[title],[aria-label]')) for (const a of ['placeholder','title','aria-label']) { const v = e.getAttribute(a); if (v && v.length > 1) out.push('@' + a + ': ' + v) } return out })()`)
  for (const l of lines) if ((PT.test(l) || PTKEYS.some((k) => l === k || l.replace(/^@[\w-]+: /, '') === k)) && !seen.has(l)) seen.set(l, label)
}
try {
  await app.until(`document.querySelectorAll('.react-flow__node').length >= 8`, 'nodes', 120)
  await sleep(1500)
  await grab('canvas')
  // settings tabs
  await app.ev(`document.querySelector('[aria-label="Settings"], [aria-label="Configurações"]').click()`)
  await app.until(`!!document.querySelector('.set')`, 'settings')
  const tabs = await app.ev(`[...document.querySelectorAll('.set [role=tab]')].map(b => b.textContent.trim())`)
  for (let i = 0; i < tabs.length; i++) {
    await app.ev(`[...document.querySelectorAll('.set [role=tab]')][${i}].click()`)
    await sleep(900)
    await grab('settings:' + tabs[i])
  }
  await app.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await sleep(500)
  // palette
  await app.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 2 })
  await sleep(1200); await grab('palette')
  await app.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await sleep(400)
  // template gallery (every built-in) and "What's new"
  await app.ev(`window.dispatchEvent(new Event('ac:templates'))`)
  await app.until(`document.querySelectorAll('.tpl-list li').length >= 3`, 'templates')
  for (let i = 0; i < 3; i++) { await app.ev(`document.querySelectorAll('.tpl-list li')[${i}].click()`); await sleep(400); await grab('templates ' + i) }
  await app.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(400)
  await app.ev(`window.dispatchEvent(new Event('ac:whats-new'))`)
  await app.until(`!!document.querySelector('.whats-new')`, "what's new")
  await grab("what's new")
  await app.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(400)
  // node menu on a terminal footer and pane menu
  const rc = async (x, y) => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await app.send('Input.dispatchMouseEvent', { type, x, y, button: 'right', clickCount: 1 }); await sleep(600) }
  const p = await app.ev(`(() => { const r = document.querySelector('.react-flow__node[data-id="a"] .tfoot').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
  await rc(p.x, p.y); await grab('node menu')
  await app.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(300)
  await rc(900, 800); await grab('pane menu')
  await app.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(300)
  // dock panels
  await app.ev(`document.querySelector('[aria-label="Agent usage"], [aria-label="Uso dos agentes"]')?.click()`); await sleep(800); await grab('usage')
  await app.ev(`document.querySelector('[aria-label="Agent activity"], [aria-label="Atividade dos agentes"]')?.click()`); await sleep(800); await grab('activity')
  // empty workspace + team dialog + new terminal dialog
  await app.ev(`[...document.querySelectorAll('.ws')].find(e => e.textContent.includes('B')).click()`); await sleep(1200); await grab('empty canvas')
  await app.ev(`[...document.querySelectorAll('.empty-actions button')][0].click()`); await sleep(1500); await grab('team dialog')
  await app.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(400)
  await app.ev(`[...document.querySelectorAll('.empty-actions button')][1].click()`); await sleep(1200); await grab('new terminal dialog')
} finally { app.close() }
seen.delete('Português') // the language's own name
assert.deepEqual([...seen].map(([l, w]) => `[${w}] ${l.slice(0, 100)}`), [])
})
