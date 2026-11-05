/**
 * FR1 / FR2 — sessions as signed JWTs in an httpOnly cookie; role-based guards.
 * token_version lets a user revoke every session at once.
 */
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { get } from './db.js';
import { HttpError } from './services.js';

export type Role = 'citizen' | 'officer' | 'admin';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  department_id: number | null;
  phone: string;
  preferred_lang: string;
  status: string;
  token_version: number;
  last_login_at: string | null;
  created_at: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 11);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export function issueSession(res: Response, user: Pick<AuthUser, 'id' | 'role' | 'token_version'>) {
  const token = jwt.sign({ sub: user.id, role: user.role, tv: user.token_version }, config.jwtSecret, { expiresIn: `${config.sessionDays}d` });
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: config.sessionDays * 86_400_000,
    path: '/',
  });
}

export function clearSession(res: Response) {
  res.clearCookie(config.cookieName, { path: '/' });
}

export function publicUser(u: AuthUser) {
  const dept = u.department_id ? get<{ id: number; code: string; name: string }>('SELECT id, code, name FROM departments WHERE id = ?', u.department_id) : null;
  return { id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone, preferredLang: u.preferred_lang, department: dept ?? null, createdAt: u.created_at, lastLoginAt: u.last_login_at };
}

function readUser(req: Request): AuthUser | null {
  const token = req.cookies?.[config.cookieName];
  if (!token) return null;
  try {
    const p = jwt.verify(token, config.jwtSecret) as unknown as { sub: number; tv: number };
    const u = get<AuthUser>('SELECT * FROM users WHERE id = ?', p.sub);
    if (!u || u.status !== 'active' || u.token_version !== p.tv) return null;
    return u;
  } catch {
    return null;
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  req.user = readUser(req) ?? undefined;
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const u = readUser(req);
  if (!u) {
    clearSession(res);
    return next(new HttpError(401, 'Your session has ended. Please sign in again.'));
  }
  req.user = u;
  next();
}

export const requireRole = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new HttpError(401, 'Not signed in'));
  if (!roles.includes(req.user.role)) return next(new HttpError(403, 'You do not have permission to do that.'));
  next();
};

/* Login throttling: 6 failures per email+ip per 15 minutes. */
const attempts = new Map<string, { n: number; until: number }>();
export function throttle(key: string) {
  const a = attempts.get(key);
  if (a && a.until > Date.now() && a.n >= 6) {
    const mins = Math.ceil((a.until - Date.now()) / 60000);
    throw new HttpError(429, `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
  }
}
export function recordFailure(key: string) {
  const a = attempts.get(key);
  if (!a || a.until < Date.now()) attempts.set(key, { n: 1, until: Date.now() + 15 * 60000 });
  else a.n++;
}
export function clearFailures(key: string) {
  attempts.delete(key);
}

export function passwordProblems(pw: string): string | null {
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Use a mix of letters and numbers.';
  return null;
}
