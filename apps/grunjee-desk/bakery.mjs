// Only the bundled, compiled fixture uses this path. Uploaded components are never executed.
const bakeryId = 'juniper-lane';
function addBakery(state) {
  if (state.sites.some(site => site.id === bakeryId)) return state;
  const parsed = importSource({ name: 'page.tsx', code: ASSETS.bakery.source }, true);
  const site = newSite(bakeryId, 'Juniper Lane Bakery', 'bakery', parsed.items, '2026-11-18T00:00:00Z');
  site.source = parsed.source;
  // Keep the original compiled markup with the project so future builds preserve its history.
  site.template = { main: ASSETS.bakery.main, css: ASSETS.bakery.css };
  state.sites.push(site);
  return state;
}

function bakeryDocument(site, version, frameScript) {
  const text = new Map(version.items.map(item => [item.id, item.text]));
  const markup = site.template.main.replace(
    /(<(h[1-3]|p)\b[^>]*\bdata-oid="([a-z0-9-]+)"[^>]*>)[^<]*(<\/\2>)/g,
    (original, open, tag, id, close) => {
      if (!text.has(id)) throw new Error('The bakery build and source disagree on an element.');
      return open + esc(text.get(id)) + close;
    },
  );
  const overlay = 'body.selecting [data-oid]{cursor:crosshair}body.selecting [data-oid]:hover,[data-oid].picked,[data-oid]:focus-visible{outline:2px solid #108473;outline-offset:4px}';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'
    + esc(site.name) + '</title><style>' + site.template.css + overlay + '</style></head><body>'
    + markup + (frameScript ? '<script>' + frameScript + '</script>' : '') + '</body></html>';
}
