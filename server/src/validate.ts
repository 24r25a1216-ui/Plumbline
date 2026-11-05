import type { NextFunction, Request, Response } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { HttpError } from './services.js';

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const fields: Record<string, string> = {};
    for (const issue of r.error.issues) {
      const k = issue.path.join('.') || '_';
      if (!fields[k]) fields[k] = issue.message;
    }
    throw new HttpError(422, 'Please correct the highlighted fields.', { fields });
  }
  return r.data;
}

/** Wraps async handlers so thrown errors reach the error middleware. */
export const h =
  (fn: (req: Request, res: Response, next: NextFunction) => unknown) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

export const idParam = (req: Request, name = 'id') => {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Invalid id');
  return n;
};

export { z };
