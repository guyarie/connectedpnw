export function htmlPage(title: string, body: string, status = 200, headers: Record<string, string> = {}, script = ''): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${title} · Connected PNW</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.25rem;color:#1f2a24;line-height:1.5}h1{font-size:1.4rem}</style>
</head><body><h1>${title}</h1>${body}${script ? `<script>${script}</script>` : ''}</body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers } });
}
