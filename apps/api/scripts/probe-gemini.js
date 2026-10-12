require('dotenv').config({ path: '.env' });
const { GoogleGenAI } = require('@google/genai');

async function main() {
  const key = process.env.GEMINI_API_KEY;
  console.log(
    'key prefix',
    key ? `${key.slice(0, 4)}...` : 'missing',
    'len',
    key?.length,
  );

  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const r = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
      contents: 'Reply with JSON only: {"ok":true}',
      config: { responseMimeType: 'application/json', temperature: 0 },
    });
    console.log('OK', (r.text || '').slice(0, 200));
  } catch (e) {
    console.log('ERR message:', e.message);
    console.log('ERR name:', e.name);
    console.log('ERR status:', e.status || e.code);
    console.log('ERR cause:', e.cause?.message || e.cause || null);
    if (e.error) console.log('ERR body:', JSON.stringify(e.error).slice(0, 500));
  }
}

main();
