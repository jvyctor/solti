// Strings the main process shows to the user (dialogs, menus, error messages). Same scheme as src/i18n.js:
// Portuguese is the key, English the translation; a missing key falls back to Portuguese.
const EN = {
  'A pasta {0} já existe com outro repositório.': 'The folder {0} already exists with a different repository.',
  'Alterações do agente': 'Agent changes',
  'A pasta principal tem alterações não salvas. Salve ou descarte antes de fazer o merge.': 'The main folder has unsaved changes. Save or discard them before merging.',
  'Conflitos no merge; nada foi alterado. Resolva no terminal do agente. ': 'Merge conflicts; nothing was changed. Resolve them in the agent\'s terminal. ',
  'O remoto não é do GitHub: abra o PR manualmente.': 'The remote is not on GitHub: open the PR manually.',
  'agente não está rodando (abra o workspace dele)': 'agent is not running (open its workspace)',
  'enviado a {0}': 'sent to {0}',
  'fluxo iniciado': 'pipeline started',
  'iniciou o fluxo': 'started the pipeline',
  'fluxo': 'pipeline',
  'janela fechada': 'window closed',
  'Não foi possível ler o arquivo.': 'Could not read the file.',
  'Arquivo': 'File',
  'Configurações…': 'Settings…',
  'Paleta de comandos': 'Command palette',
  'Editar': 'Edit',
  'Desfazer': 'Undo',
  'Refazer': 'Redo',
  'Versões e downloads': 'Releases and downloads',
  'Sair': 'Quit',
  'Cancelar': 'Cancel',
  'Sair do Solti?': 'Quit Solti?',
  'Os agentes em execução serão encerrados.': 'Running agents will be closed.',
  'Nenhuma versão publicada encontrada.': 'No published version found.',
  'Limite de consultas do GitHub atingido. Tente mais tarde.': 'GitHub rate limit reached. Try again later.',
  'Sem conexão com a internet.': 'No internet connection.',
  'Ative o controle remoto primeiro.': 'Turn on remote control first.',
  'Nenhuma rede local encontrada (conecte o computador ao Wi-Fi).': 'No local network found (connect the computer to Wi-Fi).',
  'Porta {0} em uso. Escolha outra.': 'Port {0} is in use. Choose another.',
  'celular pareado': 'phone paired',
  'permitiu: ': 'allowed: ',
  'negou: ': 'denied: ',
  'interrompeu': 'interrupted',
  'interrompeu todos os agentes': 'interrupted all agents',
  'você': 'you',
  'celular': 'phone',
}

let lang = 'pt'
const init = (setting, locale = '') => { lang = setting === 'pt' || setting === 'en' ? setting : /^pt/i.test(locale) ? 'pt' : 'en' }
const tr = (s, args = []) => {
  const base = lang === 'en' ? EN[s] ?? s : s
  return args.length ? base.replace(/\{(\d+)\}/g, (_m, i) => String(args[Number(i)] ?? '')) : base
}

// The effective language ('pt' | 'en'): also what agents are briefed in.
module.exports = { init, tr, lang: () => lang }
