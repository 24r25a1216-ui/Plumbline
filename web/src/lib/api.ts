export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;
  redirect?: string;
  constructor(status: number, message: string, fields: Record<string, string> = {}, redirect?: string) {
    super(message);
    this.status = status;
    this.fields = fields;
    this.redirect = redirect;
  }
}

type Body = Record<string, unknown> | FormData | undefined;

async function request<T>(method: string, url: string, body?: Body): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(`/api${url}`, init);
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/')) window.dispatchEvent(new CustomEvent('plb:unauthorized'));
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.fields ?? {}, data?.redirect);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: Body) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: Body) => request<T>('PUT', url, body ?? {}),
  patch: <T>(url: string, body?: Body) => request<T>('PATCH', url, body ?? {}),
  delete: <T>(url: string) => request<T>('DELETE', url),
};

export function qs(params: Record<string, string | number | boolean | undefined | null | string[]>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    p.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}
