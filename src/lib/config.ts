// All environment-specific values come from .env (see .env.example), so no hostnames or IDs live in code.
import os from 'node:os';
import path from 'node:path';

const req = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing ${k}. Copy .env.example to .env and fill it in.`);
  return v;
};
const expandHome = (p: string) => (p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);

export const dataDir = () => path.resolve(process.env.DATA_DIR || 'data/private');
export const n8n = () => ({ url: req('N8N_API_URL').replace(/\/$/, ''), key: req('N8N_API_KEY') });
export const workflows = () => ({ clean: req('WF_CLEAN'), translate: req('WF_TRANSLATE'), categorise: req('WF_CATEGORISE') });
export const db = () => ({
  sshTarget: req('DB_SSH_TARGET'),
  sshKey: process.env.DB_SSH_KEY ? expandHome(process.env.DB_SSH_KEY) : undefined,
  container: req('DB_CONTAINER'),
  user: req('DB_USER'),
  name: req('DB_NAME'),
});
