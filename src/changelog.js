// CHANGELOG.md (bundled with the app) → structured releases for the "What's new" dialog. Pure, so it is unit-tested.

// "1.2.3" vs "1.10.0": -1, 0, 1.
export function cmpVersion(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d < 0 ? -1 : 1
  }
  return 0
}

// → [{ version, date, intro: [lines], groups: [{ title, items: [text] }] }], newest first. Ranges like
// "[0.6.0] – [0.6.2]" keep the last version. Nested bullets are folded into their parent item.
export function parseChangelog(md) {
  const releases = []
  let cur = null, group = null
  for (const raw of String(md).split(/\r?\n/)) {
    const h2 = /^## \[([^\]]+)\](?:\s*[–-]\s*\[([^\]]+)\])?(?:\s*-\s*(\S+))?/.exec(raw)
    if (h2) {
      if (h2[1].toLowerCase() === 'unreleased') { cur = null; continue }
      cur = { version: h2[2] || h2[1], date: h2[3] || '', intro: [], groups: [] }
      group = null
      releases.push(cur)
      continue
    }
    if (!cur) continue
    if (/^\[[^\]]+\]:\s*http/.test(raw)) continue // link references at the end
    const h3 = /^### (.+)/.exec(raw)
    if (h3) { group = { title: h3[1].trim(), items: [] }; cur.groups.push(group); continue }
    const item = /^- (.+)/.exec(raw)
    const sub = /^\s{2,}- (.+)/.exec(raw)
    if (item) { (group || (group = { title: '', items: [] }, cur.groups.push(group), group)).items.push(item[1].trim()); continue }
    if (sub && group?.items.length) { group.items[group.items.length - 1] += ' · ' + sub[1].trim(); continue }
    if (raw.trim() && !group) cur.intro.push(raw.trim())
  }
  return releases
}

// Releases after `from` up to and including `to` (what an update from `from` to `to` brought).
export const releasesBetween = (releases, from, to) => releases.filter((r) => cmpVersion(r.version, from) > 0 && cmpVersion(r.version, to) <= 0)

// Inline markdown → plain segments: **bold**, `code`, [text](url). Returns [{ t, bold?, code?, href? }].
export function inline(text) {
  const out = []
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g
  let last = 0, m
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: text.slice(last, m.index) })
    if (m[1]) out.push({ t: m[1], bold: true })
    else if (m[2]) out.push({ t: m[2], code: true })
    else out.push({ t: m[3], href: m[4] })
    last = re.lastIndex
  }
  if (last < text.length) out.push({ t: text.slice(last) })
  return out
}
