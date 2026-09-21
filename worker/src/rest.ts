// REST mirror of the tools (POST /api/tools/{name}) plus the OpenAPI document
// that a ChatGPT custom GPT reads to call them as "actions".
import { runTool, TOOLS, ToolError, type ToolContext } from './tools';
import { inputJsonSchema } from './schema-json';

export async function handleRest(request: Request, ctx: ToolContext): Promise<Response> {
  const url = new URL(request.url);
  const m = /^\/api\/tools\/([a-z_]+)$/.exec(url.pathname);
  if (!m) return Response.json({ ok: false, error: 'Not found' }, { status: 404 });
  if (request.method !== 'POST') return Response.json({ ok: false, error: 'Use POST' }, { status: 405 });

  let args: unknown = {};
  const raw = await request.text();
  if (raw.trim()) {
    try {
      args = JSON.parse(raw);
    } catch {
      return Response.json({ ok: false, error: 'Body must be JSON' }, { status: 400 });
    }
  }
  try {
    const result = await runTool(m[1], args, ctx);
    return Response.json({ ok: true, result });
  } catch (e) {
    if (e instanceof ToolError) return Response.json({ ok: false, error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ ok: false, error: `Something went wrong: ${(e as Error).message}` }, { status: 500 });
  }
}

export function openApiDocument(serviceUrl: string, tokenEndpoint: string, authorizeEndpoint: string) {
  const paths: Record<string, unknown> = {};
  for (const t of TOOLS) {
    paths[`/api/tools/${t.name}`] = {
      post: {
        operationId: t.name,
        summary: t.description.split('. ')[0],
        description: t.description,
        ...(t.readOnly ? {} : { 'x-openai-isConsequential': false }),
        requestBody: {
          required: true,
          content: { 'application/json': { schema: inputJsonSchema(t.input) } },
        },
        responses: {
          '200': {
            description: 'Result',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { ok: { type: 'boolean' }, result: { type: 'object' }, error: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Connected PNW website editor',
      version: '1.0.0',
      description: 'Edit the text of connectedpnw.com and its blog. Every write goes live within about two minutes and can be undone with undo_change.',
    },
    servers: [{ url: serviceUrl }],
    security: [{ oauth: [] }],
    components: {
      securitySchemes: {
        oauth: {
          type: 'oauth2',
          flows: {
            authorizationCode: {
              authorizationUrl: `${serviceUrl}${authorizeEndpoint}`,
              tokenUrl: `${serviceUrl}${tokenEndpoint}`,
              scopes: {},
            },
          },
        },
      },
    },
    paths,
  };
}
