// Measured cost of a run: reads saved executions of the clean/translate/categorise workers since a timestamp,
// sums the token usage reported by each OpenRouter chat-model node, and prices it with config/openrouter-prices.json.
// Prints counts only, never quote text. The n8n instance must save successful executions (see save-success).
// Usage: npm run run-cost -- --since <ISO time> [--until <ISO time>] [--out <file.json>]
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { workflows } from '../lib/config.ts';
import { readJson, writeJson } from '../lib/io.ts';
import { api } from '../lib/n8n.ts';

const { values: a } = parseArgs({ options: { since: { type: 'string' }, until: { type: 'string' }, out: { type: 'string' } } });
if (!a.since) throw new Error('need --since <ISO time>');
const SINCE = new Date(a.since), UNTIL = a.until ? new Date(a.until) : new Date(8.64e15);
const prices = readJson<{ fetched: string; models: Record<string, [number, number]> }>(fileURLToPath(new URL('../../config/openrouter-prices.json', import.meta.url)));

interface ModelUse { calls: number; prompt: number; completion: number; estimated: number; usd: number | null }
const report = { since: SINCE.toISOString(), until: a.until ?? null, prices_fetched: prices.fetched, stages: {} as Record<string, any>, total_usd: 0 };

for (const [stage, id] of Object.entries(workflows())) {
  const wf = await api('GET', `/workflows/${id}`);
  const modelOf: Record<string, string> = Object.fromEntries(wf.nodes.filter((n: any) => /lmChatOpenRouter/.test(n.type))
    .map((n: any) => [n.name, n.parameters.model?.value ?? n.parameters.model]));
  const st = { executions: 0, by_status: {} as Record<string, number>, models: {} as Record<string, ModelUse>, usd: 0 };
  let cursor: string | undefined;
  do {
    const page = await api('GET', `/executions?workflowId=${id}&limit=100&includeData=true${cursor ? `&cursor=${cursor}` : ''}`);
    let reachedOlder = false;
    for (const ex of page.data) {
      const t = new Date(ex.startedAt);
      if (t < SINCE) { reachedOlder = true; continue; }
      if (t > UNTIL) continue;
      st.executions++; st.by_status[ex.status] = (st.by_status[ex.status] || 0) + 1;
      for (const [node, runs] of Object.entries<any[]>(ex.data?.resultData?.runData ?? {})) {
        if (!modelOf[node]) continue;
        for (const run of runs) for (const it of run.data?.ai_languageModel?.flat() ?? []) {
          const tu = it.json?.tokenUsage ?? it.json?.tokenUsageEstimate;
          if (!tu) continue;
          const m = (st.models[modelOf[node]] ||= { calls: 0, prompt: 0, completion: 0, estimated: 0, usd: 0 });
          m.calls++; m.prompt += tu.promptTokens || 0; m.completion += tu.completionTokens || 0;
          if (!it.json.tokenUsage) m.estimated++;
        }
      }
    }
    cursor = reachedOlder ? undefined : page.nextCursor;
  } while (cursor);
  for (const [model, u] of Object.entries(st.models)) {
    const p = prices.models[model];
    u.usd = p ? Number(((u.prompt * p[0] + u.completion * p[1]) / 1e6).toFixed(4)) : null;
    st.usd += u.usd ?? 0;
  }
  st.usd = Number(st.usd.toFixed(4));
  report.stages[stage] = st;
  report.total_usd += st.usd;
}
report.total_usd = Number(report.total_usd.toFixed(4));
if (a.out) writeJson(a.out, report);
for (const [s, v] of Object.entries<any>(report.stages)) {
  console.log(`${s.padEnd(11)} executions ${v.executions} ${JSON.stringify(v.by_status)}`);
  for (const [m, u] of Object.entries<ModelUse>(v.models)) console.log(`   ${m.padEnd(30)} calls ${u.calls}  in ${u.prompt}  out ${u.completion}  estimated ${u.estimated}  $${u.usd}`);
}
console.log(`TOTAL $${report.total_usd}`);
