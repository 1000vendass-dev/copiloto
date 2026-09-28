import { z } from "zod";

/**
 * Converte FormData em objeto para validar com `schema`.
 * Campos do schema ausentes no formulário viram `null` (evita erro de campo obrigatório),
 * exceto os que têm valor padrão (`.default()`), que ficam `undefined` para o padrão valer.
 */
export function formValues(fd: FormData, schema: { shape: Record<string, unknown> }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    const v = fd.get(key);
    if (typeof v === "string") out[key] = v;
    else out[key] = field instanceof z.ZodDefault ? undefined : null;
  }
  return out;
}
