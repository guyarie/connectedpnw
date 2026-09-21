import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'astro/zod';

// zod-to-json-schema is typed against its own zod copy; the schemas here come
// from `astro/zod`. The runtime is version-compatible, so call it untyped.
const toJson = zodToJsonSchema as unknown as (schema: unknown, opts: object) => Record<string, unknown>;

/** JSON Schema for a tool input, in the plain shape MCP and OpenAPI both accept. */
export function inputJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const js = toJson(schema, { $refStrategy: 'none', target: 'jsonSchema7' });
  delete js.$schema;
  if (js.type !== 'object') return { type: 'object', properties: {} };
  if (!js.properties) js.properties = {};
  return js;
}
