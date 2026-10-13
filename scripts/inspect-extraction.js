/* eslint-disable */
const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const docId = 'f6e0293a-db99-43d2-8474-286c5a75fb9c';

  const { rows } = await client.query(
    `SELECT status, prompt_version,
            jsonb_array_length(COALESCE(structured_data->'lineItems','[]'::jsonb)) AS structured_lines,
            length(raw_response->>'text') AS raw_len,
            raw_response->>'text' AS raw_text
     FROM extractions WHERE document_id = $1`,
    [docId],
  );
  const row = rows[0];
  if (!row) {
    console.log('No extraction');
    await client.end();
    return;
  }
  console.log({
    status: row.status,
    prompt_version: row.prompt_version,
    structured_lines: row.structured_lines,
    raw_len: row.raw_len,
  });

  let parsed;
  try {
    parsed = JSON.parse(row.raw_text);
  } catch (e) {
    console.log('raw parse failed', e.message);
    console.log('tail:', row.raw_text?.slice(-800));
    await client.end();
    return;
  }

  const items = parsed.lineItems;
  console.log({
    lineItemsType: Array.isArray(items) ? 'array' : typeof items,
    lineItemsLength: Array.isArray(items) ? items.length : null,
    keys: Object.keys(parsed),
  });
  if (Array.isArray(items) && items.length) {
    console.log('first item', JSON.stringify(items[0], null, 2));
  } else {
    console.log('lineItems value:', JSON.stringify(items));
  }

  const { rows: events } = await client.query(
    `SELECT event_type, message, level
     FROM document_processing_events
     WHERE document_id = $1
     ORDER BY created_at ASC`,
    [docId],
  );
  console.log('events:');
  for (const e of events) {
    console.log(`- [${e.level}] ${e.event_type}: ${e.message}`);
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
