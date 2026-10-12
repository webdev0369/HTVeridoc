-- Run as a PostgreSQL superuser, then update root .env DATABASE_URL.
-- Example (PowerShell):
--   & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -f scripts/create-database.sql

CREATE USER htveridoc WITH PASSWORD 'htveridoc';
CREATE DATABASE htveridoc OWNER htveridoc;
GRANT ALL PRIVILEGES ON DATABASE htveridoc TO htveridoc;

\c htveridoc
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
GRANT ALL ON SCHEMA public TO htveridoc;
