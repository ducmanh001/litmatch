// Sinh trang kiến trúc 10M: node layouts/feature-flows/arch-10m.mjs [--no-png]
// Đầu vào: arch-10m-data.mjs (sơ đồ), arch-10m-pages.mjs (chữ), annotated-*.mjs (danh sách trang code) và
// code-10m/<tính năng>/<trang>.sources.json (nhãn nguồn do engine-10m.mjs ghi: chạy engine TRƯỚC).
// Đầu ra: layouts/feature-flows/architecture-10m/{index.html,README.md,<slug>.html,<slug>.svg,<slug>.png}.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderDiagramSvg } from './arch-render.mjs';
import { DIAGRAMS } from './arch-10m-data.mjs';
import { OVERVIEW, PAGES } from './arch-10m-pages.mjs';
import { ARCH_PAGES } from './arch-pages.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outRoot = path.join(here, 'architecture-10m');
const codeRoot = path.join(here, 'code-10m');
const SITE = 'https://ducmanh001.github.io/litmatch-feature-flows';
const REPO = 'https://github.com/ducmanh001/litmatch-feature-flows';
const noPng = process.argv.includes('--no-png');
const BASE = process.env.LITMATCH_BASE_COMMIT ?? '0c052aa';
const DATE = new Date().toISOString().slice(0, 10);

const esc = (s) =>
  String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

// ---------- danh sách trang code theo slug kiến trúc ----------
const catalogFiles = readdirSync(here)
  .filter((f) => /^annotated-.+\.mjs$/.test(f) && f !== 'annotated-source.mjs')
  .sort();
const features = (
  await Promise.all(
    catalogFiles.map((f) =>
      import(pathToFileURL(path.join(here, f)).href).then((m) => m.annotatedFeatures),
    ),
  )
)
  .flat()
  .sort((a, b) => a.id.localeCompare(b.id));

const originOf = (feature, ep) => {
  try {
    return JSON.parse(
      readFileSync(path.join(codeRoot, feature.id, `${ep.n}-${ep.slug}.sources.json`), 'utf8'),
    ).origin?.kind;
  } catch {
    return undefined;
  }
};
const chip = (kind) =>
  kind === 'local'
    ? '<span class="org org-local" title="Trang dùng file có thay đổi chưa commit; chưa có trên GitHub">local · chưa commit</span>'
    : kind === 'pushed'
      ? `<span class="org org-pushed" title="Code của trang khớp commit ${BASE} đã đẩy lên PR #84">đã đẩy · PR #84</span>`
      : '';
const tierChips = (flow) =>
  [...new Set([...(flow ?? '').matchAll(/\[([A-Z]+)\]/g)].map((m) => m[1]))]
    .map((t) => `<b class="lg tg-${t.toLowerCase()}">${t}</b>`)
    .join('');
const codeRows = (slug) =>
  features
    .filter((f) => f.arch === slug)
    .flatMap((f) =>
      f.endpoints.map((ep) => ({
        feature: f,
        ep,
        href: `../code-10m/${f.id}/${ep.n}-${ep.slug}.html`,
        kind: originOf(f, ep),
      })),
    );

// ---------- CSS/JS dùng chung (cùng biến màu với trang code) ----------
const TIER_LIGHT =
  '--t-controller:#1a7f37;--t-service:#bc4c00;--t-worker:#8250df;--t-postgres:#0969da;--t-redis:#cf222e;--t-kafka:#57606a;--t-bullmq:#bf3989;--t-external:#0a7a6b;--t-gateway:#9a6700';
const TIER_DARK =
  '--t-controller:#56d364;--t-service:#ffa657;--t-worker:#d2a8ff;--t-postgres:#58a6ff;--t-redis:#ff7b72;--t-kafka:#c9d1d9;--t-bullmq:#ff80c8;--t-external:#39d0bb;--t-gateway:#e3b341';
const DARK_VARS =
  '--bg:#0d1117;--fg:#e6edf3;--muted:#8b949e;--border:#30363d;--subtle:#161b22;--accent:#4493f8;--ok:#56d364;--info:#58a6ff;--warn:#ffa657';
const CSS = `
:root{color-scheme:light;--bg:#fff;--fg:#1f2328;--muted:#59636e;--border:#d1d9e0;--subtle:#f6f8fa;--accent:#0969da;--ok:#1a7f37;--info:#0969da;--warn:#bc4c00;${TIER_LIGHT}}
:root[data-theme=dark]{color-scheme:dark;${DARK_VARS};${TIER_DARK}}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;${DARK_VARS};${TIER_DARK}}}
*{box-sizing:border-box}html,body{margin:0}
body{background:var(--bg);color:var(--fg);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif}
main{max-width:1180px;margin:0 auto;padding:24px 16px 48px}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.box{border:1px solid var(--border);border-radius:6px;overflow:hidden;background:var(--bg)}
.bar{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between;padding:8px 16px;background:var(--subtle);border-bottom:1px solid var(--border)}
.path{font-size:14px}.path b{font-weight:600}.meta{margin-left:12px;color:var(--muted);font-size:12px}
.actions{display:flex;flex-wrap:wrap;gap:8px}
.btn{font:500 12px/20px -apple-system,"Segoe UI",sans-serif;padding:3px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);cursor:pointer}
.btn:hover{background:var(--subtle);text-decoration:none}
.toc{display:flex;flex-wrap:wrap;gap:4px 16px;padding:8px 16px;border-bottom:1px solid var(--border);font-size:13px}
.toc a.cur{color:var(--fg);font-weight:600;text-decoration:underline}
.idx{padding:20px 24px 28px}.idx h1{margin:0 0 8px;font-size:22px;font-weight:600}
.idx h2{margin:28px 0 8px;font-size:17px;font-weight:600}
.idx p{margin:0 0 14px;max-width:860px}.idx p.sum{color:var(--muted)}
.idx ul{margin:0 0 14px;padding-left:22px;max-width:900px}.idx li{margin:0 0 6px}
.note{border:1px solid var(--border);border-left:4px solid var(--warn);background:var(--subtle);padding:10px 14px;border-radius:6px;max-width:900px;margin:0 0 18px}
.note.info{border-left-color:var(--info)}
.dia{overflow-x:auto;border:1px solid var(--border);border-radius:6px;margin:14px 0 8px;background:var(--bg)}
.dia svg{display:block;width:100%;height:auto;min-width:980px}
.dl{font-size:12px;color:var(--muted);margin:0 0 6px}
.tbl{width:100%;border-collapse:collapse;font-size:14px}.tbl th,.tbl td{padding:8px 12px;text-align:left;border-top:1px solid var(--border);vertical-align:top}
.tbl th{background:var(--subtle);font-size:12px;color:var(--muted);font-weight:600}
.tbl td.fn>a{font-weight:600}.tbl td .rt{margin-top:3px;color:var(--muted);font-size:12px}
.tbl code{font:12px ui-monospace,SFMono-Regular,Consolas,monospace;background:var(--subtle);border:1px solid var(--border);border-radius:6px;padding:1px 6px}
.lg{font:700 11px/18px ui-monospace,SFMono-Regular,Consolas,monospace;padding:0 8px;border:1px solid currentColor;border-radius:999px;display:inline-block;margin:0 4px 4px 0}
${['controller', 'service', 'worker', 'postgres', 'redis', 'kafka', 'bullmq', 'external', 'gateway'].map((t) => `.tg-${t}{color:var(--t-${t})}`).join('')}
.org{display:inline-block;font:600 11px/18px -apple-system,"Segoe UI",sans-serif;padding:0 8px;border:1px solid currentColor;border-radius:999px;white-space:nowrap;cursor:help}
.org-pushed{color:var(--ok)}.org-local{color:var(--warn)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin:0 0 14px}
.card{border:1px solid var(--border);border-radius:6px;padding:12px 14px;background:var(--subtle)}
.card h3{margin:0 0 6px;font-size:15px}.card p{margin:0 0 8px;color:var(--muted);font-size:13px}.card .lk{font-size:12px}
@media (max-width:760px){main{padding:8px 0 32px}.box{border-radius:0;border-left:0;border-right:0}.bar{padding:8px 12px}.idx{padding:16px 12px 24px}.toc{flex-direction:column;gap:2px;padding:8px 12px}
.tbl,.tbl tbody,.tbl tr,.tbl td{display:block;width:100%}.tbl thead{display:none}.tbl tr{border-top:1px solid var(--border);padding:6px 0}.tbl td{border:0;padding:3px 12px}
.dia svg{min-width:900px}}`;
const JS = `(function(){
var root=document.documentElement,key='litmatch-code-theme',btn=document.getElementById('theme'),labels={auto:'Tự động',light:'Sáng',dark:'Tối'};
var mode='auto';try{var s=localStorage.getItem(key);if(s==='light'||s==='dark')mode=s}catch(e){}
function apply(){if(mode==='auto')root.removeAttribute('data-theme');else root.setAttribute('data-theme',mode);btn.textContent='Theme: '+labels[mode]}
apply();
btn.addEventListener('click',function(){mode=mode==='auto'?'light':mode==='light'?'dark':'auto';try{if(mode==='auto')localStorage.removeItem(key);else localStorage.setItem(key,mode)}catch(e){}apply()});
})();`;

const shell = ({ title, description, current, crumb, extraActions = '', body }) => `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="description" content="${esc(description).replaceAll('\n', ' ')}"/>
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<div class="box">
  <div class="bar">
    <div class="path"><a href="${REPO}">litmatch-feature-flows</a> / <a href="index.html">architecture-10m</a>${crumb ? ` / <b>${esc(crumb)}</b>` : ''}<span class="meta">snapshot ${esc(BASE)} + thay đổi local chưa commit · ${DATE}</span></div>
    <div class="actions">
      <a class="btn" href="index.html">Tổng quan</a>
      <a class="btn" href="../code-10m/index.html">Code 10M</a>
      <a class="btn" href="../index.html">Sơ đồ sản phẩm</a>${extraActions}
      <button class="btn" id="theme" type="button" title="Đổi theme">Theme: Tự động</button>
    </div>
  </div>
  <nav class="toc">${[{ slug: 'index', title: 'Tổng quan' }, ...ARCH_PAGES]
    .map(
      (a) =>
        `<a href="${a.slug === 'index' ? 'index' : a.slug}.html"${a.slug === current ? ' class="cur"' : ''}>${esc(a.slug === 'index' ? 'Tổng quan' : (PAGES[a.slug]?.short ?? a.title))}</a>`,
    )
    .join('')}</nav>
  <div class="idx">
${body}
  </div>
</div>
</main>
<script>${JS}</script>
</body>
</html>
`;

const list = (items) => `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
const dia = (slug, svgInline) => `<div class="dia">${svgInline}</div>
<p class="dl">Tải sơ đồ: <a href="${slug}.svg">SVG</a> · <a href="${slug}.png">PNG</a> · bấm vào tên khối để mở trang code tương ứng.</p>`;

// ---------- sinh file ----------
mkdirSync(outRoot, { recursive: true });
const written = [];
const svgOf = (slug, standalone) =>
  renderDiagramSvg(DIAGRAMS[slug], { standalone, up: '../' });
const w = (name, text) => {
  writeFileSync(path.join(outRoot, name), text);
  written.push(name);
};

for (const slug of ['overview', ...ARCH_PAGES.map((a) => a.slug)]) {
  if (!DIAGRAMS[slug]) throw new Error(`thiếu sơ đồ ${slug}`);
  w(`${slug}.svg`, svgOf(slug, true));
}

const countKinds = (rows) => {
  const local = rows.filter((r) => r.kind === 'local').length;
  return `${rows.length} trang code${local ? `, ${local} local` : ''}`;
};

for (const a of ARCH_PAGES) {
  const p = PAGES[a.slug];
  const rows = codeRows(a.slug);
  const gallery = p.gallery
    ? `<li><a href="../index.html#${p.gallery}">Sơ đồ sản phẩm của tính năng này (kiến trúc và luồng cơ bản, trước đợt 10M)</a></li>`
    : '';
  const codeLinks = [...new Set(rows.map((r) => r.feature.id))]
    .map(
      (id) =>
        `<li><a href="../code-10m/index.html#${id}">Mục ${esc(id)} trong tổng quan code 10M</a></li>`,
    )
    .join('');
  const body = `    <h1>${esc(a.title)}</h1>
    <p class="sum">${esc(p.summary)}</p>
    <div class="note">${esc(OVERVIEW.honest)}</div>
${dia(a.slug, svgOf(a.slug, false))}
    <h2>Điểm quan trọng</h2>
${list(p.points)}
    <h2>Giới hạn và chưa làm</h2>
${list(p.limits)}
    <h2>Code chi tiết của sơ đồ này</h2>
    <table class="tbl"><thead><tr><th>Trang</th><th>Làm gì</th><th>Tầng</th><th>Nguồn</th></tr></thead><tbody>
${rows
  .map(
    (r) =>
      `<tr><td class="fn"><a href="${r.href}">${esc(r.ep.name ?? r.ep.title)}</a><div class="rt"><code>${esc(r.ep.method)} ${esc(r.ep.route)}</code></div></td><td>${esc(r.ep.title)}</td><td>${tierChips(r.ep.flow)}</td><td>${chip(r.kind)}</td></tr>`,
  )
  .join('\n')}
    </tbody></table>
    <h2>Liên kết</h2>
    <ul>${gallery}${codeLinks}<li><a href="index.html">Tổng quan kiến trúc 10M</a></li></ul>
    <h2>Nguồn tài liệu</h2>
${list(p.source)}
    <p class="sum">Tài liệu nằm trong repo litmatch (PR <a href="https://github.com/ducmanh001/litmatch/pull/84">#84</a> hoặc cây làm việc local); mục ghi "local, chưa commit" chưa có trên GitHub.</p>`;
  w(
    `${a.slug}.html`,
    shell({
      title: `Kiến trúc 10M: ${p.short}`,
      description: p.summary,
      current: a.slug,
      crumb: a.slug,
      extraActions: `\n      <a class="btn" href="${a.slug}.svg">SVG</a>\n      <a class="btn" href="${a.slug}.png">PNG</a>`,
      body,
    }),
  );
}

// ---------- trang tổng quan ----------
const overviewRows = ARCH_PAGES.map((a) => {
  const rows = codeRows(a.slug);
  return `<div class="card"><h3><a href="${a.slug}.html">${esc(PAGES[a.slug].short)}</a></h3><p>${esc(PAGES[a.slug].summary.split('. ')[0])}.</p><div class="lk">${esc(countKinds(rows))} · <a href="${a.slug}.html">Xem sơ đồ</a></div></div>`;
}).join('\n');
const totalRows = ARCH_PAGES.flatMap((a) => codeRows(a.slug));
const indexBody = `    <h1>${esc(OVERVIEW.title)}</h1>
    <p class="sum">${esc(OVERVIEW.summary)}</p>
    <div class="note">${esc(OVERVIEW.honest)}</div>
    <div class="note info"><b>Nguồn của từng trang code.</b> ${chip('pushed')} = mọi file nguồn khớp commit <code>${esc(BASE)}</code> (đầu của PR #84, có trên GitHub). ${chip('local')} = trang dùng file có thay đổi chưa commit trong cây làm việc local (chụp ${DATE}): code đó chưa có trên GitHub và có thể đổi trước khi commit; theo ADR 0015 và plan 2026-10-20/21, phần local đã viết xong về mặt nguồn nhưng kiểm chứng chạy thật mới có một phần. Trong sơ đồ, nhãn <b>local</b> trên khối có nghĩa tương tự.</div>
${dia('overview', svgOf('overview', false))}
    <h2>Tám sơ đồ chi tiết</h2>
    <div class="cards">
${overviewRows}
    </div>
    <h2>Liên kết</h2>
    <ul>
      <li><a href="../code-10m/index.html">Code 10M</a>: ${totalRows.length} trang code thật của các luồng khó đã đổi, có nút "Kiến trúc 10M" dẫn ngược về đây.</li>
      <li><a href="../index.html">Sơ đồ sản phẩm</a>: kiến trúc và luồng cơ bản của từng chức năng (trước đợt 10M).</li>
      <li><a href="../code/index.html">Code gốc (/code)</a>: bản gốc các luồng khó, không bị sửa.</li>
    </ul>
    <h2>Nguồn tài liệu</h2>
${list(OVERVIEW.source)}`;
w(
  'index.html',
  shell({
    title: 'Kiến trúc Litmatch ở 10 triệu đồng thời',
    description: OVERVIEW.summary,
    current: 'index',
    crumb: '',
    extraActions: '\n      <a class="btn" href="overview.svg">SVG</a>\n      <a class="btn" href="overview.png">PNG</a>',
    body: indexBody,
  }),
);

// ---------- README (xem trên GitHub) ----------
const mdRows = (rows) =>
  rows
    .map(
      (r) =>
        `| [${r.ep.name ?? r.ep.title}](${SITE}/code-10m/${r.feature.id}/${r.ep.n}-${r.ep.slug}.html) | \`${r.ep.method} ${r.ep.route}\` | ${r.kind === 'local' ? 'local, chưa commit' : r.kind === 'pushed' ? 'đã đẩy (PR #84)' : ''} |`,
    )
    .join('\n');
const readme = `# ${OVERVIEW.title}

${OVERVIEW.summary}

**Trạng thái trung thực:** ${OVERVIEW.honest}

![Tổng quan](overview.png)

Nguồn của từng trang code: "đã đẩy (PR #84)" = khớp commit \`${BASE}\`; "local, chưa commit" = dùng file có thay đổi chưa commit (chụp ${DATE}), chưa có trên GitHub.

${ARCH_PAGES.map((a) => {
  const p = PAGES[a.slug];
  return `## ${a.title}

${p.summary}

![${p.short}](${a.slug}.png)

**Điểm quan trọng**

${p.points.map((t) => `- ${t}`).join('\n')}

**Giới hạn và chưa làm**

${p.limits.map((t) => `- ${t}`).join('\n')}

| Trang code | Endpoint | Nguồn |
|---|---|---|
${mdRows(codeRows(a.slug))}

Trang Pages: ${SITE}/architecture-10m/${a.slug}.html · SVG: [${a.slug}.svg](${a.slug}.svg)
`;
}).join('\n')}
Code 10M: ${SITE}/code-10m/index.html · Sơ đồ sản phẩm: ${SITE}/
`;
w('README.md', readme);

// ---------- PNG (Edge qua Playwright, theme tối như gallery) ----------
if (!noPng) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({
    executablePath:
      process.env.LITMATCH_BROWSER ??
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  });
  try {
    for (const slug of ['overview', ...ARCH_PAGES.map((a) => a.slug)]) {
      const d = DIAGRAMS[slug];
      const ctx = await browser.newContext({
        viewport: { width: d.width, height: d.height },
        colorScheme: 'dark',
        deviceScaleFactor: 2,
      });
      const page = await ctx.newPage();
      await page.setContent(
        `<!doctype html><html><body style="margin:0">${svgOf(slug, true)}</body></html>`,
      );
      await page.screenshot({
        path: path.join(outRoot, `${slug}.png`),
        clip: { x: 0, y: 0, width: d.width, height: d.height },
      });
      await ctx.close();
      written.push(`${slug}.png`);
    }
  } finally {
    await browser.close();
  }
}
console.log(`architecture-10m: ${written.length} file · ${totalRows.length} trang code liên kết · snapshot ${BASE} · ${DATE}`);
