// A small, stateless MCP server over Streamable HTTP (JSON responses only).
// Each POST carries one JSON-RPC message; no sessions, no SSE stream.
import { runTool, SERVER_INSTRUCTIONS, TOOLS, ToolError, type ToolContext } from './tools';
import { inputJsonSchema } from './schema-json';

const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const DEFAULT_VERSION = '2025-06-18';

interface RpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const toolList = TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: inputJsonSchema(t.input),
  annotations: { readOnlyHint: t.readOnly, destructiveHint: !t.readOnly, openWorldHint: false },
}));

function rpcResult(id: RpcRequest['id'], result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function rpcError(id: RpcRequest['id'], code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

export async function handleMcp(request: Request, ctx: ToolContext): Promise<Response> {
  if (request.method === 'GET' || request.method === 'DELETE') {
    // No server-initiated stream and no sessions: nothing to open or close.
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  }
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let msg: RpcRequest;
  try {
    msg = (await request.json()) as RpcRequest;
  } catch {
    return Response.json(rpcError(null, -32700, 'Parse error'), { status: 400 });
  }
  if (Array.isArray(msg)) return Response.json(rpcError(null, -32600, 'Batches are not supported'), { status: 400 });
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return Response.json(rpcError(null, -32600, 'Invalid request'), { status: 400 });
  }

  // Notifications and responses from the client need no reply.
  if (msg.id === undefined || msg.id === null) return new Response(null, { status: 202 });

  const result = await dispatch(msg, ctx);
  return Response.json(result);
}

async function dispatch(msg: RpcRequest, ctx: ToolContext) {
  const { id, method, params = {} } = msg;
  switch (method) {
    case 'initialize': {
      const requested = String(params.protocolVersion ?? '');
      const protocolVersion = SUPPORTED_VERSIONS.includes(requested) ? requested : DEFAULT_VERSION;
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'connectedpnw-content', title: 'Connected PNW website', version: '1.0.0' },
        instructions: SERVER_INSTRUCTIONS,
      });
    }
    case 'ping':
      return rpcResult(id, {});
    case 'tools/list':
      return rpcResult(id, { tools: toolList });
    case 'tools/call': {
      const name = String(params.name ?? '');
      try {
        const out = await runTool(name, params.arguments, ctx);
        return rpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
          structuredContent: out,
        });
      } catch (e) {
        const text = e instanceof ToolError ? e.message : `Something went wrong: ${(e as Error).message}`;
        return rpcResult(id, { content: [{ type: 'text', text }], isError: true });
      }
    }
    case 'resources/list':
      return rpcResult(id, { resources: [] });
    case 'prompts/list':
      return rpcResult(id, { prompts: [] });
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}
