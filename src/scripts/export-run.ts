// Exports one survey's pipeline output from the app DB: per row the cleaned text, translation, sentiment,
// row-level categories and segments with their categories. Writes <DATA_DIR>/runs/<run>/outputs.json.
// Scoring is a separate step (score-run), so a run is exported once and can be re-scored under new rules.
// Usage: npm run export-run -- --survey <uuid> --run <name>
import path from 'node:path';
import { parseArgs } from 'node:util';
import { dataDir } from '../lib/config.ts';
import { assertUuid, psqlJson } from '../lib/db.ts';
import { writeJson } from '../lib/io.ts';
import type { OutputRow } from '../lib/types.ts';

const { values: a } = parseArgs({ options: { survey: { type: 'string' }, run: { type: 'string' } } });
if (!a.survey || !a.run) throw new Error('need --survey <uuid> --run <name>');
const sid = assertUuid(a.survey);

const rows = psqlJson<OutputRow[]>(`
select coalesce(json_agg(r order by r.row_order), '[]')::text from (
  select sr.row_order, sr.processing_status, sr.processing_error, sr.quote_cleaned, sr.translation,
    sr.sentiment::text as sentiment, sr.processing_started_at, sr.processing_completed_at,
    (select coalesce(json_agg(json_build_object('n', c.category_number, 'conf', rc.confidence_score, 'ai', rc.is_ai_suggested)
        order by c.category_number), '[]')
       from row_categories rc join categories c on c.id = rc.category_id where rc.row_id = sr.id) as row_categories,
    (select coalesce(json_agg(json_build_object('order', s.segment_order, 'text', s.text, 'source', s.source_field,
        'categories', (select coalesce(json_agg(json_build_object('n', c.category_number, 'conf', sc.confidence_score)
            order by c.category_number), '[]')
          from segment_categories sc join categories c on c.id = sc.category_id where sc.segment_id = s.id))
        order by s.segment_order), '[]')
       from row_segments s where s.row_id = sr.id) as segments
  from survey_rows sr where sr.survey_id = '${sid}'
) r;`);

const file = path.join(dataDir(), 'runs', a.run, 'outputs.json');
writeJson(file, { survey_id: sid, exported: new Date().toISOString(), rows });
const status = rows.reduce((m, r) => ((m[r.processing_status] = (m[r.processing_status] || 0) + 1), m), {} as Record<string, number>);
console.log(`${rows.length} rows -> ${file}`, status);
