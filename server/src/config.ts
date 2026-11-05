import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');

dotenv.config({
  path: path.join(ROOT, '.env'),
  override: true,
});
console.log('Gmail configuration check:', {
  envFileExists: fs.existsSync(path.join(ROOT, '.env')),
  gmailUserLoaded: Boolean(process.env.GMAIL_USER?.trim()),
  appPasswordLoaded: Boolean(process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '')),
  emailFromLoaded: Boolean(process.env.EMAIL_FROM?.trim()),
});

const dataDir = path.join(ROOT, 'data');
const uploadDir = path.join(dataDir, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

export const config = {
  port: Number(process.env.PORT ?? 4000),
  isProd: process.env.NODE_ENV === 'production',
  jwtSecret: process.env.JWT_SECRET || 'plumbline-dev-secret-do-not-use-in-production',
  dbFile: process.env.DB_FILE || path.join(dataDir, 'plumbline.db'),
  uploadDir,
  webDist: path.join(ROOT, 'web', 'dist'),
  cookieName: 'plb_session',
  sessionDays: 7,
  maxUploadBytes: 10 * 1024 * 1024,
  maxUploadFiles: 5,
  email: {
  user: process.env.GMAIL_USER || '',
  appPassword: process.env.GMAIL_APP_PASSWORD || '',
  from: process.env.EMAIL_FROM || process.env.GMAIL_USER || '',
},
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    embedModel: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
    baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
  },
};
