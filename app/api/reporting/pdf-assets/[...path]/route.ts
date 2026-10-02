import { readFile } from 'node:fs/promises';
import path from 'node:path';
export const runtime = 'nodejs';
const version = '6.3.289';
export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const parts = (await context.params).path;
  let relative = '', contentType = 'application/octet-stream';
  if (parts.length === 2 && parts[0] === version && parts[1] === 'pdf.worker.min.mjs') {
    relative = 'legacy/build/pdf.worker.min.mjs'; contentType = 'text/javascript';
  } else if (parts.length === 3 && parts[0] === version && ['cmaps', 'standard_fonts', 'wasm'].includes(parts[1]) && /^[a-zA-Z0-9_-]+\.(bcmap|pfb|ttf|wasm)$/.test(parts[2])) {
    relative = `${parts[1]}/${parts[2]}`;
    if (parts[2].endsWith('.wasm')) contentType = 'application/wasm';
  }
  if (!relative) return new Response('Not found', { status: 404 });
  try {
    const bytes = await readFile(path.join(process.cwd(), 'node_modules/pdfjs-dist', relative));
    return new Response(bytes, { headers: { 'content-type': contentType, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
  } catch { return new Response('Not found', { status: 404 }); }
}
