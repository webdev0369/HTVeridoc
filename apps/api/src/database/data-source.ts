import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import * as path from 'path';

// Prefer apps/api/.env over repo-root .env (dotenv does not override by default).
loadEnv({ path: path.resolve(__dirname, '../../../../.env') });
loadEnv({ path: path.resolve(__dirname, '../../.env'), override: true });

export default new DataSource({
  type: 'postgres',
  url:
    process.env.DATABASE_URL ||
    'postgresql://postgres:1234@localhost:5432/htveridoc',
  entities: [path.join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});
