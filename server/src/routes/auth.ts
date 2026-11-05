import { Router } from 'express';
import { get, run, nowIso, audit } from '../db.js';
import { HttpError } from '../services.js';
import { parse, h, z } from '../validate.js';
import {
  hashPassword, verifyPassword, issueSession, clearSession, requireAuth, optionalAuth, publicUser, throttle, recordFailure, clearFailures, passwordProblems, type AuthUser,
} from '../auth.js';

export const authRouter = Router();

const email = z.string().trim().toLowerCase().email('Enter a valid email address.');
const password = z.string().min(1, 'Enter your password.');

authRouter.post('/register', h(async (req, res) => {
  const body = parse(
    z.object({
      name: z.string().trim().min(2, 'Enter your full name.').max(80),
      email,
      password: z.string().superRefine((v, ctx) => { const p = passwordProblems(v); if (p) ctx.addIssue({ code: 'custom', message: p }); }),
      phone: z.string().trim().regex(/^(\+?91[\s-]?)?[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number.').or(z.literal('')).optional(),
      preferredLang: z.enum(['en', 'hi', 'te']).default('en'),
    }),
    req.body,
  );
  if (get('SELECT 1 FROM users WHERE email = ?', body.email)) {
    throw new HttpError(409, 'An account with this email already exists.', { fields: { email: 'This email is already registered — try signing in.' } });
  }
  const { lastId } = run(
    "INSERT INTO users (name, email, password_hash, role, phone, preferred_lang, last_login_at) VALUES (?,?,?,'citizen',?,?,?)",
    body.name, body.email, await hashPassword(body.password), body.phone ?? '', body.preferredLang, nowIso(),
  );
  const user = get<AuthUser>('SELECT * FROM users WHERE id = ?', lastId)!;
  audit(user.id, 'user.register', `user:${user.id}`);
  issueSession(res, user);
  res.status(201).json({ user: publicUser(user) });
}));

async function login(portal: 'citizen' | 'staff', reqBody: unknown, ip: string, res: any) {
  const body = parse(z.object({ email, password }), reqBody);
  const key = `${body.email}|${ip}`;
  throttle(key);
  const user = get<AuthUser & { password_hash: string }>('SELECT * FROM users WHERE email = ?', body.email);
  const ok = user ? await verifyPassword(body.password, user.password_hash) : false;
  if (!user || !ok) {
    recordFailure(key);
    throw new HttpError(401, 'That email and password combination is not recognised.');
  }
  if (user.status !== 'active') throw new HttpError(403, 'This account is suspended. Contact the grievance cell.');
  if (portal === 'citizen' && user.role !== 'citizen') throw new HttpError(403, 'Staff accounts sign in through the staff portal.', { redirect: '/staff/login' });
  if (portal === 'staff' && user.role === 'citizen') throw new HttpError(403, 'This portal is for officials only. Citizens sign in on the main page.', { redirect: '/login' });
  clearFailures(key);
  run('UPDATE users SET last_login_at = ? WHERE id = ?', nowIso(), user.id);
  audit(user.id, `auth.login.${portal}`, `user:${user.id}`, { ip });
  issueSession(res, user);
  return { user: publicUser(user) };
}

authRouter.post('/login', h(async (req, res) => res.json(await login('citizen', req.body, req.ip ?? '', res))));
authRouter.post('/staff/login', h(async (req, res) => res.json(await login('staff', req.body, req.ip ?? '', res))));

authRouter.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

authRouter.post('/logout-all', requireAuth, (req, res) => {
  run('UPDATE users SET token_version = token_version + 1 WHERE id = ?', req.user!.id);
  audit(req.user!.id, 'auth.logout_all', `user:${req.user!.id}`);
  clearSession(res);
  res.json({ ok: true });
});

// Non-throwing session probe for anonymous visitors (avoids 401 noise).
authRouter.get('/session', optionalAuth, (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));

authRouter.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user!) }));

authRouter.patch('/me', requireAuth, h((req, res) => {
  const body = parse(
    z.object({
      name: z.string().trim().min(2, 'Enter your full name.').max(80).optional(),
      phone: z.string().trim().regex(/^(\+?91[\s-]?)?[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number.').or(z.literal('')).optional(),
      preferredLang: z.enum(['en', 'hi', 'te']).optional(),
    }),
    req.body,
  );
  const u = req.user!;
  run('UPDATE users SET name = ?, phone = ?, preferred_lang = ? WHERE id = ?', body.name ?? u.name, body.phone ?? u.phone, body.preferredLang ?? u.preferred_lang, u.id);
  res.json({ user: publicUser(get<AuthUser>('SELECT * FROM users WHERE id = ?', u.id)!) });
}));

authRouter.post('/me/password', requireAuth, h(async (req, res) => {
  const body = parse(
    z.object({
      current: z.string().min(1, 'Enter your current password.'),
      next: z.string().superRefine((v, ctx) => { const p = passwordProblems(v); if (p) ctx.addIssue({ code: 'custom', message: p }); }),
    }),
    req.body,
  );
  const row = get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', req.user!.id)!;
  if (!(await verifyPassword(body.current, row.password_hash))) throw new HttpError(422, 'Current password is incorrect.', { fields: { current: 'Current password is incorrect.' } });
  run('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', await hashPassword(body.next), req.user!.id);
  audit(req.user!.id, 'auth.password_change', `user:${req.user!.id}`);
  const fresh = get<AuthUser>('SELECT * FROM users WHERE id = ?', req.user!.id)!;
  issueSession(res, fresh); // keep this device signed in, revoke others
  res.json({ ok: true });
}));
