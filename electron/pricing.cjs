// Estimated cost of an agent's session: list prices in US$ per 1M tokens, matched by model-name prefix
// (longest prefix wins). Subscriptions (Claude Pro/Max, ChatGPT Plus…) do not bill per token, so this is
// "what it would cost on the API", shown as an estimate. Users can override any row in Settings → Custo.
//   in = fresh input, out = output (incl. reasoning), cw = cache write, cr = cache read
const PRICES = {
  // Anthropic (first-party API list prices; cache write = 1.25 × input)
  'claude-fable-5': { in: 10, out: 50, cw: 12.5, cr: 0.25 },
  'claude-mythos-5': { in: 10, out: 50, cw: 12.5, cr: 0.25 },
  'claude-opus-5-5': { in: 4, out: 20, cw: 5, cr: 0.2 },
  'claude-opus-5': { in: 5, out: 25, cw: 6.25, cr: 0.5 },
  'claude-opus-4': { in: 5, out: 25, cw: 6.25, cr: 0.5 },
  'claude-sonnet-5': { in: 2, out: 10, cw: 2.5, cr: 0.2 },
  'claude-sonnet-4': { in: 3, out: 15, cw: 3.75, cr: 0.3 },
  'claude-haiku-5': { in: 0.1, out: 0.5, cw: 0.125, cr: 0.01 },
  'claude-haiku-4': { in: 1, out: 5, cw: 1.25, cr: 0.1 },
  // OpenAI (Codex)
  'gpt-6': { in: 2, out: 10, cw: 2, cr: 0.2 },
  'gpt-6.1': { in: 2, out: 10, cw: 2, cr: 0.1 },
  // Google (Gemini CLI), prompts up to 200K
  'gemini-3.1-pro': { in: 2, out: 12, cw: 2, cr: 0.2 },
  'gemini-2.5-pro': { in: 1.25, out: 10, cw: 1.25, cr: 0.125 },
  'gemini-3.5-flash': { in: 1.5, out: 9, cw: 1.5, cr: 0.15 },
  'gemini-3': { in: 0.75, out: 3.75, cw: 0.75, cr: 0.075 }, // 3.6–3.8 Flash
  'gemini-2.5-flash': { in: 0.3, out: 2.5, cw: 0.3, cr: 0.03 },
}

// overrides: { prefix: { in, out, cw, cr } } from settings; a null value removes a default row.
function table(overrides = {}) {
  const t = { ...PRICES }
  for (const [k, v] of Object.entries(overrides || {})) {
    if (v === null) delete t[k]
    else if (v && typeof v === 'object') t[k] = { ...(t[k] || {}), ...v }
  }
  return t
}

function priceFor(model, overrides) {
  const m = String(model || '').toLowerCase()
  if (!m) return null
  let best = null
  for (const [prefix, p] of Object.entries(table(overrides))) {
    if (m.startsWith(prefix.toLowerCase()) && (!best || prefix.length > best[0].length)) best = [prefix, p]
  }
  return best ? best[1] : null
}

// usage: { input, output, cacheWrite, cacheRead } in tokens. null when the model has no known price.
function costOf(model, u, overrides) {
  const p = priceFor(model, overrides)
  if (!p) return null
  return ((u.input || 0) * (p.in || 0) + (u.output || 0) * (p.out || 0) + (u.cacheWrite || 0) * (p.cw ?? p.in ?? 0) + (u.cacheRead || 0) * (p.cr || 0)) / 1e6
}

module.exports = { PRICES, table, priceFor, costOf }
