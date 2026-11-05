/**
 * Thin OpenAI client (fetch-based, no SDK): structured JSON chat completions
 * and embeddings, with timeouts and readable errors.
 */
import { config } from '../config.js';
import { getSettings, openaiKey } from '../settings.js';

export class OpenAIError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function call(path: string, body: unknown, timeoutMs = 45_000) {
  const key = openaiKey();
  if (!key) throw new OpenAIError('OpenAI API key is not configured');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${config.openai.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = text;
      try {
        msg = JSON.parse(text).error?.message ?? text;
      } catch {}
      throw new OpenAIError(`OpenAI ${res.status}: ${msg.slice(0, 300)}`, res.status);
    }
    return JSON.parse(text);
  } catch (e: any) {
    if (e.name === 'AbortError') throw new OpenAIError(`OpenAI request timed out after ${timeoutMs / 1000}s`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export async function chatJSON<T>(opts: { system: string; user: string; schemaName: string; schema: object; model?: string }): Promise<{ data: T; model: string; tokens: number }> {
  const model = opts.model ?? getSettings().openai_model;
  const res = await call('/chat/completions', {
    model,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    response_format: { type: 'json_schema', json_schema: { name: opts.schemaName, strict: true, schema: opts.schema } },
  });
  const content = res.choices?.[0]?.message?.content;
  if (!content) throw new OpenAIError('OpenAI returned an empty response');
  return { data: JSON.parse(content) as T, model: res.model ?? model, tokens: res.usage?.total_tokens ?? 0 };
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const model = getSettings().openai_embed_model;
  const res = await call('/embeddings', { model, input: texts.map((t) => t.slice(0, 8000)) });
  return (res.data as { embedding: number[]; index: number }[]).sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function testConnection() {
  const started = Date.now();
  const r = await chatJSON<{ ok: boolean }>({
    system: 'You are a health check.',
    user: 'Reply with ok=true.',
    schemaName: 'health',
    schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false },
  });
  return { ok: r.data.ok, model: r.model, latencyMs: Date.now() - started };
}
