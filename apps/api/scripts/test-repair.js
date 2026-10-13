/* eslint-disable */
const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

// Mirror gemini.provider repairTruncatedJson (simplified copy for diagnosis)
function escapeControlCharsInStrings(input) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        out += ch;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        out += ch;
        continue;
      }
      if (ch === '"') {
        inString = false;
        out += ch;
        continue;
      }
      if (ch === '\n') {
        out += '\\n';
        continue;
      }
      if (ch === '\r') {
        out += '\\r';
        continue;
      }
      if (ch === '\t') {
        out += '\\t';
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

function repairTruncatedJson(text) {
  let cleaned = escapeControlCharsInStrings(text.trim());
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  let inString = false;
  let escaped = false;
  cleaned = cleaned.replace(/,\s*"[^"]*"\s*:\s*("([^"\\]|\\.)*)?$/, '');
  cleaned = cleaned.replace(/,\s*\{[^}]*$/, '');
  cleaned = cleaned.replace(/,\s*$/, '');

  // Incomplete key without value at end: "quantity":
  cleaned = cleaned.replace(/,\s*"[^"]*"\s*:\s*$/, '');
  cleaned = cleaned.replace(/"[^"]*"\s*:\s*$/, '');

  if (inString) cleaned += '"';

  const stack2 = [];
  inString = false;
  escaped = false;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') stack2.push('{');
    else if (ch === '[') stack2.push('[');
    else if (ch === '}') {
      if (stack2[stack2.length - 1] === '{') stack2.pop();
    } else if (ch === ']') {
      if (stack2[stack2.length - 1] === '[') stack2.pop();
    }
  }
  if (inString) cleaned += '"';
  cleaned = cleaned.replace(/,\s*$/, '');
  while (stack2.length) {
    const open = stack2.pop();
    cleaned += open === '{' ? '}' : ']';
  }
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
  return cleaned;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query(
    `SELECT raw_response->>'text' AS raw_text,
            structured_data
     FROM extractions WHERE document_id = $1`,
    ['f6e0293a-db99-43d2-8474-286c5a75fb9c'],
  );
  const raw = rows[0].raw_text;
  console.log('raw ends with:', JSON.stringify(raw.slice(-80)));
  const repaired = repairTruncatedJson(raw);
  console.log('repaired ends with:', repaired.slice(-120));
  try {
    const parsed = JSON.parse(repaired);
    console.log('repaired lineItems length', parsed.lineItems?.length);
    console.log('first', JSON.stringify(parsed.lineItems?.[0], null, 2)?.slice(0, 500));
  } catch (e) {
    console.log('repair still invalid', e.message);
  }

  console.log(
    'structured lineItems',
    Array.isArray(rows[0].structured_data?.lineItems)
      ? rows[0].structured_data.lineItems.length
      : rows[0].structured_data?.lineItems,
  );

  const { rows: events } = await client.query(
    `SELECT step, message, level FROM document_processing_events
     WHERE document_id = $1 ORDER BY created_at ASC`,
    ['f6e0293a-db99-43d2-8474-286c5a75fb9c'],
  );
  for (const e of events) {
    console.log(`- [${e.level}] ${e.step}: ${e.message}`);
  }
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
