// Dựng thư mục staging = bản clone Pages + code-10m (làm mới) + architecture-10m (mới) + chỉnh trang gốc, rồi kiểm link.
// PAGES_WORK=<thư mục chứa pages/ (clone repo Pages) > node stage-site.mjs → ghi stage/ cạnh pages/, in thay đổi (thêm/sửa/xoá) và lỗi link.
// Xem REBUILD-10M.md ở cùng thư mục để biết thứ tự các bước (overlay → engine → arch → stage → commit).
import { cpSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const WORK = process.env.PAGES_WORK ?? path.join(process.env.TEMP ?? '.', 'pages-work');
const SCR = WORK;
const PAGES = path.join(WORK, 'pages');
const STAGE = path.join(WORK, 'stage');
const GEN = path.dirname(fileURLToPath(import.meta.url));
const SITE = 'https://ducmanh001.github.io/litmatch-feature-flows';

rmSync(STAGE, { recursive: true, force: true });
cpSync(PAGES, STAGE, { recursive: true, filter: (src) => !src.split(path.sep).join('/').includes('/pages/.git') && !/[\\/]\.git$/.test(src) });

const keep = (src) => !/\.(sources|syn)\.json$/.test(src);
rmSync(path.join(STAGE, 'code-10m'), { recursive: true, force: true });
cpSync(path.join(GEN, 'code-10m'), path.join(STAGE, 'code-10m'), { recursive: true, filter: keep });
rmSync(path.join(STAGE, 'architecture-10m'), { recursive: true, force: true });
cpSync(path.join(GEN, 'architecture-10m'), path.join(STAGE, 'architecture-10m'), { recursive: true, filter: keep });

// ---------- chỉnh trang gốc: thêm một khối liên kết (additive) ----------
const countPages = readdirSync(path.join(STAGE, 'code-10m'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((d) => readdirSync(path.join(STAGE, 'code-10m', d.name)).filter((f) => /^\d\d-.*\.html$/.test(f))).length;
let idx = readFileSync(path.join(STAGE, 'index.html'), 'utf8');
if (idx.includes('id="scale-10m"')) throw new Error('index.html đã có khối scale-10m');
const marker = '<details class="coverage"><summary>Đối chiếu đủ 21 nhóm';
if (idx.split(marker).length !== 2) throw new Error('không tìm thấy đúng một điểm chèn trong index.html');
const block =
  `<div class="coverage" id="scale-10m"><h2>10 triệu đồng thời</h2><p>Bản riêng cho bài toán 10 triệu đồng thời: ` +
  `<a href="architecture-10m/index.html">kiến trúc 10M</a> (một sơ đồ tổng quan và tám sơ đồ chi tiết) và ` +
  `<a href="code-10m/index.html">code thật của các luồng khó đã đổi</a> (${countPages} trang; mỗi trang ghi rõ code đã đẩy lên PR #84 hay còn là thay đổi local chưa commit). ` +
  `Hệ thống chưa được chứng nhận 10 triệu đồng thời.</p></div>`;
idx = idx.replace(marker, `${block}${marker}`);
writeFileSync(path.join(STAGE, 'index.html'), idx);

// ---------- sitemap.xml: thêm URL (additive) ----------
let sm = readFileSync(path.join(STAGE, 'sitemap.xml'), 'utf8');
const urls = [];
const walk = (dir, rel) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const r = `${rel}/${e.name}`;
    if (e.isDirectory()) walk(path.join(dir, e.name), r);
    else if (/\.(html|ts)$/.test(e.name)) urls.push(r);
  }
};
walk(path.join(STAGE, 'architecture-10m'), 'architecture-10m');
walk(path.join(STAGE, 'code-10m'), 'code-10m');
urls.sort();
const have = new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
const add = urls.map((u) => `${SITE}/${u}`).filter((u) => !have.has(u));
sm = sm.replace('</urlset>', `${add.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>`);
writeFileSync(path.join(STAGE, 'sitemap.xml'), sm);

// ---------- llms.txt + README gốc: thêm mục 10M (additive) ----------
let llms = readFileSync(path.join(STAGE, 'llms.txt'), 'utf8');
if (!llms.endsWith('\n')) llms += '\n';
llms += `\n## 10M concurrency (separate from the 25 flows above)\n\n- [Architecture 10M](${SITE}/architecture-10m/index.html): overview plus eight architecture diagrams (realtime gateway, matching, calling recovery, data lifecycle, ledger integrity, batch jobs, hot paths, resource protection). The system is NOT certified for 10 million concurrent users; figures are lab measurements, models or arithmetic on default configuration.\n- [Code 10M](${SITE}/code-10m/index.html): ${countPages} annotated walkthroughs of the hard flows changed for 10M. Each page is labelled "pushed" (matches PR #84 head 0c052aa) or "local" (uncommitted working-tree changes snapshotted on 2026-10-21; not on GitHub).\n`;
writeFileSync(path.join(STAGE, 'llms.txt'), llms);
let rd = readFileSync(path.join(STAGE, 'README.md'), 'utf8');
if (!rd.endsWith('\n')) rd += '\n';
rd += `\n10 triệu đồng thời: [kiến trúc](${SITE}/architecture-10m/index.html) · [code](${SITE}/code-10m/index.html)\n`;
writeFileSync(path.join(STAGE, 'README.md'), rd);

// ---------- so với bản clone: thêm / sửa / xoá ----------
const files = (root) => {
  const out = new Map();
  const go = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.name === '.git') continue;
      if (e.isDirectory()) go(p);
      else out.set(path.relative(root, p).split(path.sep).join('/'), createHash('sha1').update(readFileSync(p)).digest('hex'));
    }
  };
  go(root);
  return out;
};
const before = files(PAGES);
const after = files(STAGE);
const added = [...after.keys()].filter((k) => !before.has(k));
const removed = [...before.keys()].filter((k) => !after.has(k));
const modified = [...after.keys()].filter((k) => before.has(k) && before.get(k) !== after.get(k));
writeFileSync(path.join(SCR, 'stage-changes.json'), JSON.stringify({ added, removed, modified }, null, 1));
const group = (arr) => {
  const g = {};
  for (const f of arr) g[f.split('/').slice(0, 2).join('/').replace(/\.[^/]+$/, '')] = (g[f.split('/').slice(0, 2).join('/').replace(/\.[^/]+$/, '')] ?? 0) + 1;
  return g;
};
console.log(`thêm ${added.length} · sửa ${modified.length} · xoá ${removed.length}`);
console.log('SỬA:', modified.join(', ').slice(0, 1500));
console.log('XOÁ:', removed.join(', ').slice(0, 800));

// ---------- kiểm link nội bộ ----------
const problems = [];
const htmlFiles = [...after.keys()].filter((k) => /^(code-10m|architecture-10m)\/.*\.html$/.test(k) || k === 'index.html');
const idsCache = new Map();
const idsOf = (file) => {
  if (!idsCache.has(file)) {
    const t = readFileSync(path.join(STAGE, file), 'utf8');
    idsCache.set(file, new Set([...t.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  }
  return idsCache.get(file);
};
let checked = 0;
for (const f of htmlFiles) {
  const text = readFileSync(path.join(STAGE, f), 'utf8');
  for (const m of text.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const href = m[1];
    if (/^(https?:|mailto:|data:|javascript:)/.test(href)) {
      if (href.startsWith(SITE)) {
        const rel = href.slice(SITE.length + 1).split('#')[0];
        if (rel && !after.has(rel) && !after.has(`${rel}/index.html`) && !rel.endsWith('/'))
          problems.push(`${f}: link tuyệt đối tới file không có trong site: ${href}`);
      }
      continue;
    }
    if (href.startsWith('#')) {
      if (!idsOf(f).has(href.slice(1))) problems.push(`${f}: anchor nội trang không có: ${href}`);
      continue;
    }
    const [rel, hash] = href.split('#');
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), rel));
    checked += 1;
    const resolved = after.has(target) ? target : after.has(`${target}/index.html`) ? `${target}/index.html` : null;
    if (!resolved) {
      problems.push(`${f}: link hỏng → ${href} (${target})`);
      continue;
    }
    if (hash && resolved.endsWith('.html') && !idsOf(resolved).has(hash)) problems.push(`${f}: anchor không có trong ${resolved}: #${hash}`);
  }
}
console.log(`đã kiểm ${checked} link tương đối trong ${htmlFiles.length} trang HTML; vấn đề: ${problems.length}`);
for (const p of problems.slice(0, 40)) console.log('  ✗', p);
