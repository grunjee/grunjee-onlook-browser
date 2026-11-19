import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../../examples/juniper-lane/', import.meta.url));

export function readBakeryBuild() {
  const exported = readFileSync(path.join(project, 'out/index.html'), 'utf8');
  const source = readFileSync(path.join(project, 'app/page.tsx'), 'utf8');
  const main = exported.match(/<main\b[^>]*>[\s\S]*?<\/main>/)?.[0];
  const links = [...exported.matchAll(/<link\b[^>]*>/g)].map(([tag]) => tag)
    .filter(tag => tag.includes('rel="stylesheet"'))
    .map(tag => tag.match(/href="(\/_next\/static\/[^"?]+\.css)(?:\?[^"]*)?"/)?.[1]);
  if (!main || !links.length || links.includes(undefined)) {
    throw new Error('Build examples/juniper-lane with Next.js before building Site Desk.');
  }
  const css = links.map(link => readFileSync(path.join(project, 'out', link), 'utf8')).join('\n');
  return { source, main, css };
}
