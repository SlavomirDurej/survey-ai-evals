// Runs one SQL statement against the app's Postgres over SSH (docker exec psql) and returns stdout.
// The SQL goes in on stdin, so nothing is interpolated into the shell command.
import { execFileSync } from 'node:child_process';
import { db } from './config.ts';

export function psql(sql: string): string {
  const c = db();
  const args = [...(c.sshKey ? ['-i', c.sshKey, '-o', 'IdentitiesOnly=yes'] : []), c.sshTarget,
    `docker exec -i ${c.container} psql -v ON_ERROR_STOP=1 -U ${c.user} -d ${c.name} -At`];
  return execFileSync('ssh', args, { input: sql, maxBuffer: 1 << 28 }).toString();
}

/** Runs a query that returns a single JSON value (e.g. json_agg(...)) and parses it. */
export const psqlJson = <T>(sql: string): T => JSON.parse(psql(sql)) as T;

export const assertUuid = (s: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) throw new Error(`not a uuid: ${s}`);
  return s;
};
