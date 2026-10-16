// Git helpers for per-agent worktrees. Uses the system `git` and the user's own credentials (no secrets stored here).
const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')

const ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0' } // never hang on a console prompt
const git = (args, cwd) =>
  new Promise((res, rej) =>
    execFile('git', args, { cwd, env: ENV, timeout: 10 * 60 * 1000, maxBuffer: 20 * 1024 * 1024, windowsHide: true }, (err, out, errOut) =>
      err ? rej(new Error((errOut || err.message).trim().split('\n').slice(-2).join(' '))) : res(out.trim())),
  )

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'x'
const lines = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean)

async function info(dir) {
  try {
    const root = await git(['rev-parse', '--show-toplevel'], dir)
    const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], root)
    const local = lines(await git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], root))
    const remote = lines(await git(['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin'], root)).map((b) => b.replace(/^origin\//, '')).filter((b) => b !== 'HEAD' && b !== 'origin')
    return { isRepo: true, root, branch, branches: [...new Set([...local, ...remote])] }
  } catch {
    return { isRepo: false }
  }
}

// Branch names of a remote without cloning.
async function remoteBranches(url) {
  const out = await git(['ls-remote', '--heads', url])
  return lines(out).map((l) => l.split('refs/heads/')[1]).filter(Boolean)
}

const repoName = (url) => slug(url.replace(/[#?].*$/, '').replace(/\/+$/, '').split(/[/:]/).pop().replace(/\.git$/, ''))

// Clone once; a second agent on the same URL reuses the clone.
async function clone(url, destDir) {
  const dest = path.join(destDir, repoName(url))
  if (fs.existsSync(path.join(dest, '.git'))) {
    const origin = await git(['remote', 'get-url', 'origin'], dest).catch(() => '')
    if (origin !== url) throw new Error(`A pasta ${dest} já existe com outro repositório.`)
    await git(['fetch', '--prune', 'origin'], dest).catch(() => {})
    return dest
  }
  fs.mkdirSync(destDir, { recursive: true })
  await git(['clone', url, dest])
  return dest
}

// New branch `agentBranch` from `base` in its own folder, so agents never share a checkout.
async function addWorktree(repo, base, agentBranch) {
  const wt = path.join(path.dirname(repo), '.canvas-worktrees', `${slug(path.basename(repo))}-${slug(agentBranch)}`)
  if (fs.existsSync(wt)) return wt // already created (e.g. app restart)
  fs.mkdirSync(path.dirname(wt), { recursive: true })
  const local = lines(await git(['for-each-ref', '--format=%(refname:short)', `refs/heads/${agentBranch}`], repo))
  if (local.length) return git(['worktree', 'add', wt, agentBranch], repo).then(() => wt) // branch survived an earlier worktree
  const start = lines(await git(['for-each-ref', '--format=%(refname:short)', `refs/heads/${base}`], repo)).length ? base : `origin/${base}`
  await git(['worktree', 'add', '-b', agentBranch, wt, start], repo)
  return wt
}

const dirty = async (dir) => (await git(['status', '--porcelain'], dir).catch(() => '')) !== ''

// Removes the folder only when clean; the branch always stays, so no work is lost.
async function removeWorktree(wt) {
  if (!fs.existsSync(wt)) return { removed: true }
  if (await dirty(wt)) return { removed: false, reason: 'dirty' }
  const common = await git(['rev-parse', '--git-common-dir'], wt)
  await git(['worktree', 'remove', wt], path.resolve(wt, common, '..'))
  return { removed: true }
}

// Everything the "new terminal" dialog needs in one call.
// src: { dir } or { url, dest }; base: branch to start from; isolate: make a worktree; agent: agent name.
async function prepare({ dir, url, dest, base, isolate, agent }) {
  const repo = url ? await clone(url, dest) : dir
  const i = await info(repo)
  if (!i.isRepo) return { cwd: repo, git: null }
  const start = base || i.branch
  if (!isolate) {
    if (base && base !== i.branch) await git(['checkout', base], i.root)
    return { cwd: i.root, git: { repo: i.root, branch: start, worktree: false } }
  }
  const branch = `canvas/${slug(agent)}`
  const wt = await addWorktree(i.root, start, branch)
  return { cwd: wt, git: { repo: i.root, branch, base: start, worktree: true } }
}

module.exports = { info, remoteBranches, clone, prepare, removeWorktree, dirty }
