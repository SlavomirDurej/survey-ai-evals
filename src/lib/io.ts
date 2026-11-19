import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

export const readJson = <T>(p: string): T => JSON.parse(fs.readFileSync(p, 'utf8')) as T;
export const writeJson = (p: string, v: unknown) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 1)); };
export const readXlsx = (p: string, opts: XLSX.ParsingOptions = {}) => XLSX.read(fs.readFileSync(p), opts);
export function writeSheet(p: string, rows: object[], sheet = 'Sheet1') {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheet);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
export { XLSX };
