-- Runs on first Postgres container boot (docker-entrypoint-initdb.d).
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
