// Pure budget helpers (no app imports, so the tests can load them).
// Agents whose own spending reached their budget (node.data.budget, US$; 0/empty = none). Ids, across all workspaces.
export const agentsOverBudget = (state, byNode) =>
  (state?.list || []).flatMap((w) => w.nodes.filter((n) => n.type === 'terminal' && Number(n.data.budget) > 0 && (byNode[n.id]?.cost ?? 0) >= Number(n.data.budget)).map((n) => n.id))
