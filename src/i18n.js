// UI strings are written in Portuguese and passed through tr(); the English table (locales/en.js) maps each one.
// tr("texto {0}", [valor]) fills {0}, {1}... A missing translation falls back to the Portuguese original.
import en from './locales/en.js'

let lang = 'pt'
export const setLang = (l) => { lang = l === 'en' ? 'en' : 'pt' }
export const getLang = () => lang

// 'auto' follows the system language: Portuguese stays Portuguese, anything else gets English.
export const resolveLang = (setting, systemLang = (typeof navigator !== 'undefined' ? navigator.language : 'pt')) =>
  setting === 'pt' || setting === 'en' ? setting : /^pt/i.test(systemLang || '') ? 'pt' : 'en'

export const tr = (s, args = []) => {
  const base = lang === 'en' ? en[s] ?? s : s
  return args.length ? base.replace(/\{(\d+)\}/g, (_m, i) => String(args[Number(i)] ?? '')) : base
}
