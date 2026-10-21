import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import * as path from 'path';

// Load local .env files only for missing keys — never override Docker/Compose
// env (override:true used to replace postgres://…@postgres with localhost).
loadEnv({ path: path.resolve(__dirname, '../../../../.env') });
loadEnv({ path: path.resolve(__dirname, '../../../.env') });

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
