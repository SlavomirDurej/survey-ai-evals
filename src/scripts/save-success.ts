// Sets saveDataSuccessExecution=all on workflows so token usage can be read from executions, then republishes.
// n8n 2.x: PUT saves a draft and POST /activate publishes it. The public API only accepts whitelisted settings keys
// and rejects some node keys (e.g. rewireOutputLogTo), so both are filtered.
// Usage: npm run save-success -- <workflowId> [<workflowId> ...]
import { api } from '../lib/n8n.ts';

const ALLOWED = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution',
  'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder', 'callerPolicy', 'callerIds'];

for (const id of process.argv.slice(2)) {
  const w = await api('GET', `/workflows/${id}`);
  const settings = Object.fromEntries(Object.entries({ ...w.settings, saveDataSuccessExecution: 'all' }).filter(([k]) => ALLOWED.includes(k)));
  const nodes = w.nodes.map(({ rewireOutputLogTo, ...n }: any) => n);
  await api('PUT', `/workflows/${id}`, { name: w.name, nodes, connections: w.connections, settings });
  if (w.active) await api('POST', `/workflows/${id}/activate`);
  const after = await api('GET', `/workflows/${id}`);
  console.log(after.name, '| active:', after.active, '| saveDataSuccessExecution:', after.settings.saveDataSuccessExecution);
}
