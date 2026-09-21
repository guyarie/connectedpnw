import { describe, expect, it } from 'vitest';
import { handleMcp } from '../src/mcp';
import { handleRest, openApiDocument } from '../src/rest';
import { TOOLS, type ToolContext } from '../src/tools';
import { FakeGitHub } from './fake-github';

const ctx: ToolContext = {
  gh: new FakeGitHub({ 'src/content/site/home.md': '---\ntitle: "Home"\n---\n' }),
  editor: { email: 'nina@connectedpnw.com', name: 'Nina', client: 'ChatGPT' },
  siteUrl: 'https://connectedpnw.com',
};

const rpc = (body: unknown, method = 'POST') =>
  handleMcp(new Request('https://svc/mcp', { method, body: method === 'POST' ? JSON.stringify(body) : undefined }), ctx);

describe('MCP', () => {
  it('initializes, echoing a supported protocol version', async () => {
    const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
    const json = (await res.json()) as { result: { protocolVersion: string; instructions: string; capabilities: object } };
    expect(json.result.protocolVersion).toBe('2025-03-26');
    expect(json.result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(json.result.instructions).toContain('undo_change');
    const unknown = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
    expect(((await unknown.json()) as { result: { protocolVersion: string } }).result.protocolVersion).toBe('2025-06-18');
  });

  it('accepts notifications silently and refuses GET', async () => {
    expect((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
    expect((await rpc(null, 'GET')).status).toBe(405);
  });

  it('lists tools with JSON schemas', async () => {
    const res = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const { result } = (await res.json()) as { result: { tools: { name: string; inputSchema: { type: string; properties: object; required?: string[] } }[] } };
    expect(result.tools.map((t) => t.name)).toEqual(TOOLS.map((t) => t.name));
    const update = result.tools.find((t) => t.name === 'update_page')!;
    expect(update.inputSchema.type).toBe('object');
    expect(update.inputSchema.required).toEqual(['page', 'fields']);
    expect((update.inputSchema.properties as { page: { enum: string[] } }).page.enum).toContain('faq');
  });

  it('calls a tool and reports tool errors without failing the RPC', async () => {
    const ok = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_page', arguments: { page: 'home' } } });
    const okJson = (await ok.json()) as { result: { isError?: boolean; structuredContent: { fields: { title: string } } } };
    expect(okJson.result.isError).toBeUndefined();
    expect(okJson.result.structuredContent.fields.title).toBe('Home');

    const bad = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_page', arguments: { page: 'nope' } } });
    const badJson = (await bad.json()) as { result: { isError: boolean; content: { text: string }[] } };
    expect(badJson.result.isError).toBe(true);
    expect(badJson.result.content[0].text).toMatch(/Invalid input/);

    const missing = await rpc({ jsonrpc: '2.0', id: 5, method: 'nope' });
    expect(((await missing.json()) as { error: { code: number } }).error.code).toBe(-32601);
  });
});

describe('REST + OpenAPI', () => {
  it('describes every tool as an operation with OAuth security', () => {
    const doc = openApiDocument('https://svc', '/oauth/token', '/authorize') as { paths: Record<string, unknown>; components: { securitySchemes: { oauth: { flows: { authorizationCode: { tokenUrl: string } } } } } };
    expect(Object.keys(doc.paths)).toEqual(TOOLS.map((t) => `/api/tools/${t.name}`));
    expect(doc.components.securitySchemes.oauth.flows.authorizationCode.tokenUrl).toBe('https://svc/oauth/token');
  });

  it('runs a tool over REST and maps errors to 400', async () => {
    const ok = await handleRest(new Request('https://svc/api/tools/get_page', { method: 'POST', body: JSON.stringify({ page: 'home' }) }), ctx);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { ok: boolean }).ok).toBe(true);
    const bad = await handleRest(new Request('https://svc/api/tools/get_page', { method: 'POST', body: JSON.stringify({ page: 'x' }) }), ctx);
    expect(bad.status).toBe(400);
    const nf = await handleRest(new Request('https://svc/api/tools/nope', { method: 'POST', body: '{}' }), ctx);
    expect(nf.status).toBe(400);
    expect(((await nf.json()) as { error: string }).error).toMatch(/Unknown tool/);
  });
});
