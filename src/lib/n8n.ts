// Minimal client for the n8n public REST API (/api/v1).
import { n8n } from './config.ts';

export async function api<T = any>(method: string, p: string, body?: unknown): Promise<T> {
  const { url, key } = n8n();
  const r = await fetch(`${url}/api/v1${p}`, {
    method,
    headers: { 'X-N8N-API-KEY': key, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
