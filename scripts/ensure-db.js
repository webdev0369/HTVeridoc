const { Client } = require('pg');

async function main() {
  const admin = new Client({
    connectionString: 'postgresql://postgres:1234@localhost:5432/postgres',
  });
  await admin.connect();
  console.log('Connected as postgres');

  const db = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname = 'htveridoc'",
  );
  if (!db.rowCount) {
    await admin.query('CREATE DATABASE htveridoc');
    console.log('Created database htveridoc');
  } else {
    console.log('Database htveridoc already exists');
  }
  await admin.end();

  const app = new Client({
    connectionString: 'postgresql://postgres:1234@localhost:5432/htveridoc',
  });
  await app.connect();
  await app.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  console.log('pgcrypto ready');
  await app.end();
}

main().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
