// Pipelines run here, not inside their node, so a run survives opening another workspace (see pipelineRunner.js).
// Also starts the pipelines scheduled by routines.
import { useEffect, useMemo } from 'react'
import { api } from '../shared.js'
import { runPipeline, stopPipeline } from '../pipelineRunner.js'
import { wsCost } from '../costs.js'
import { notify } from '../notify.js'
import { tr } from '../i18n.js'

// ws: { findNode, wsOf, patchNode, stateRef }; usageRef: current byNode; settingsRef: current settings.
export function usePipelines({ findNode, wsOf, patchNode, stateRef }, usageRef, settingsRef) {
  const pipe = useMemo(() => ({
    start: (id) => {
      const w = wsOf(id)
      if (w?.budget > 0 && wsCost(w, usageRef.current).total >= w.budget) {
        patchNode(id, { state: 'stopped', note: tr("Orçamento do workspace atingido. Aumente o orçamento no painel de uso para executar.") })
        return
      }
      return runPipeline(id, {
        api,
        getNode: findNode,
        patch: patchNode,
        agentExists: (aid) => findNode(aid)?.type === 'terminal',
        agentName: (aid) => findNode(aid)?.data.name || aid,
        cost: (aid) => usageRef.current[aid]?.cost ?? 0,
        snapshot: (label) => stateRef.current && api.pointCreate(label, stateRef.current),
        notify: (title, body) => settingsRef.current?.notifyPipeline && notify(title, body, { nodeId: id }),
        // "Wait for my OK" steps use the same approval dialog as agent requests (and the phone remote).
        approve: ({ key, title, step, text, timeoutMs }) => api.approvalAsk({ key, from: tr('Fluxo “{0}” · passo {1}', [title, step]), text, timeoutMs }),
        cancelApproval: (key) => api.approvalCancel(key),
        // Files an agent changed in its worktree, for the run report.
        changes: async (aid) => {
          const n = findNode(aid)
          const g = n?.data.git
          if (!g?.worktree || !n.data.cwd) return null
          const r = await api.gitChanges(n.data.cwd, g.base)
          return r.error ? null : { branch: g.branch, base: g.base, files: r.files || [] }
        },
      })
    },
    stop: stopPipeline,
  }), [patchNode])
  useEffect(() => api.onRoutinePipeline(({ id }) => pipe.start(id)), [pipe])
  return pipe
}
