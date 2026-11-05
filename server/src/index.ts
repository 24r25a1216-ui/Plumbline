import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from './config.js';
import { get } from './db.js';
import { HttpError } from './services.js';
import { authRouter } from './routes/auth.js';
import { complaintsRouter } from './routes/complaints.js';
import { adminRouter } from './routes/admin.js';
import { metaRouter, liveRouter } from './routes/meta.js';
import { startScheduler } from './jobs/escalation.js';
import { trainLocalModel } from './ai/classifier.js';
import { aiActive } from './settings.js';
import { seedIfEmpty } from './seed.js';

await seedIfEmpty();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// Reject cross-site state-changing requests (cookies are SameSite=Lax; this adds defence in depth).
app.use('/api', (req, _res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host && !/localhost|127\.0\.0\.1/.test(origin)) {
      return next(new HttpError(403, 'Cross-origin request blocked.'));
    }
  }
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, engine: aiActive() ? 'openai' : 'local', complaints: get<{ n: number }>('SELECT COUNT(*) AS n FROM complaints')!.n }));
app.use('/api/auth', authRouter);
app.use('/api/meta', metaRouter);
app.use('/api/complaints', complaintsRouter);
app.use('/api/admin', adminRouter);
app.use('/api', liveRouter);
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

if (fs.existsSync(config.webDist)) {
  app.use(express.static(config.webDist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(config.webDist, 'index.html')));
}

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? `Each file must be under ${config.maxUploadBytes / 1024 / 1024} MB.` : err.code === 'LIMIT_FILE_COUNT' ? `Attach at most ${config.maxUploadFiles} files at a time.` : err.message;
    return res.status(413).json({ error: msg });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.details as object | undefined) });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

trainLocalModel('startup');
startScheduler();

app.listen(config.port, () => {
  console.log(`\n  ⟂ Plumbline API  →  http://localhost:${config.port}`);
  console.log(`    AI engine: ${aiActive() ? 'OpenAI + local' : 'local NLP (set OPENAI_API_KEY or use Admin → Settings)'}\n`);
});
