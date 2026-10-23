// Sinh trang "kiến trúc v2" của BẢN ĐẦU (không phải bản 10M): node layouts/feature-flows/arch-v2.mjs [--assets]
// Đầu vào: arch-v1-data/<id>.json (ai/diagrams của site) → arch-v2-layout.mjs (sơ đồ) + arch-render.mjs (SVG).
// Đầu ra: layouts/feature-flows/architecture-v2/{index.html,README.md,overview.*,<id>.html,<id>.svg,<id>.png}. Chỉ sơ đồ kiến trúc, không có luồng.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderDiagramSvg } from './arch-render.mjs';
import { layoutV1, wrap } from './arch-v2-layout.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, 'arch-v1-data');
const outRoot = path.join(here, 'architecture-v2');
const SITE = 'https://ducmanh001.github.io/litmatch-feature-flows';
const REPO = 'https://github.com/ducmanh001/litmatch-feature-flows';
// mặc định chỉ sinh trang HTML (sơ đồ SVG nhúng trong trang); --assets mới xuất thêm .svg/.png/README
const assets = process.argv.includes('--assets');
const DATE = new Date().toISOString().slice(0, 10);

const esc = (s) =>
  String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const oneLine = (s) => String(s ?? '').replace(/\s*\n\s*/g, ' · ');
const firstSentence = (s) => {
  const t = String(s ?? '').trim();
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  return m ? m[1] : t;
};

// ---------- dữ liệu ----------
const items = readdirSync(dataDir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(path.join(dataDir, f), 'utf8')));
// các mục có trang code ở bản gốc /code (cấu trúc đã xuất bản)
const HAS_CODE = new Set(['02-soul-match', '03-voice-match', '04-party-room', '05-movie-match-movie-night', '06-palm-match', '09-diamond-top-up-va-vip', '10-matching-speed-up-detail', '11-gift', '12-mini-game', '13-trust-safety', '16-friend-va-chat-1-1', '17-dang-ky-onboarding-va-guest', '18-discovery-nearby-va-direct-invite', '20-short-video']);
// phần của mục này đã đổi ở đợt 10 triệu đồng thời → trang kiến trúc 10M tương ứng
const TEN_M = {
  '01-matching-engine': ['matching'],
  '10-matching-speed-up-detail': ['matching'],
  '02-soul-match': ['hot-paths'],
  '03-voice-match': ['calling-recovery'],
  '04-party-room': ['hot-paths', 'calling-recovery'],
  '05-movie-match-movie-night': ['hot-paths'],
  '06-palm-match': ['hot-paths'],
  '09-diamond-top-up-va-vip': ['ledger-integrity'],
  '16-friend-va-chat-1-1': ['hot-paths'],
  '17-dang-ky-onboarding-va-guest': ['hot-paths', 'data-lifecycle'],
  '19-mood-va-conversation-streak': ['data-lifecycle'],
  '20-short-video': ['batch-jobs'],
  '21-notification': ['batch-jobs', 'data-lifecycle'],
  '22-support-va-admin-operations': ['batch-jobs'],
  '25-realtime-fanout': ['realtime-gateway'],
};
const TEN_M_TITLE = {
  matching: 'Matching: hàng đợi Redis chia shard, matcher, repair, speed-up',
  'hot-paths': 'Đường nóng trong Postgres: khoá, một kết nối, SKIP LOCKED',
  'calling-recovery': 'Calling: worker có lease, reconnect grace, cleanup bền vững',
  'ledger-integrity': 'Sổ cái: đối soát phân trang, checkpoint, outbox relay',
  'data-lifecycle': 'Vòng đời dữ liệu: retention, sweeper, admission cho job nền',
  'batch-jobs': 'Việc nền theo lô: broadcast, xếp hạng video, bộ đệm đếm',
  'realtime-gateway': 'Realtime gateway: admission, quota, fanout, ngân sách gửi',
};

// ---------- sơ đồ tổng quan: ghép từ chính dữ liệu của 25 mục ----------
function overviewData() {
  const ext = {};
  const mods = new Set();
  for (const j of items) {
    for (const e of j.dependencies.externals ?? []) ext[e.id] ??= e;
    for (const m of j.dependencies.modules ?? []) mods.add(m.name);
  }
  const groups = [
    ['Ghép đôi và gọi', ['Matching', 'Matching.Invite', 'Matching / Invite', 'Matching / Discovery', 'SoulMatch', 'MovieMatch', 'PalmMatch', 'PartyRoom', 'Calling', 'Media']],
    ['Xã hội và nội dung', ['Friend', 'Friend.Streak', 'Friend.ProfileSocial', 'Friend / Feed', 'Friend / Gift', 'Mood', 'Discovery', 'Discovery.Nearby', 'Feed / Story', 'ShortVideo', 'ShortVideo / Admin', 'Notification', 'MiniGame']],
    ['Kinh tế', ['Economy', 'Ledger', 'Gift', 'Gift / Economy', 'Gift / Feed / Admin', 'Gift / ShortVideo', 'Avatar', 'Events infrastructure']],
    ['Tài khoản, an toàn, vận hành', ['Auth', 'Auth.PhoneSearch', 'User', 'User / Safety', 'Safety', 'Admin', 'Admin / Audit', 'Support', 'Capabilities', 'Platform', 'Config / provider factories', 'Core domain producers']],
  ];
  const used = new Set(groups.flatMap(([, n]) => n));
  const leftover = [...mods].filter((m) => !used.has(m));
  if (leftover.length) groups.push(['Khác', leftover]);
  const modules = groups.map(([name, names]) => ({
    name,
    uses: names.filter((n) => mods.has(n)).join(' · '),
    entities: [],
    actions: [],
  }));
  const pay = [ext.payos, ext['apple-iap'], ext['google-iap']].filter(Boolean);
  const externals = [
    ext.push && { ...ext.push, id: 'push' },
    { id: 'payments', lines: ['Thanh toán', pay.map((p) => p.lines[0]).join(' · ')], request: 'Tạo payment link; verify receipt và purchase token', callback: 'Webhook đã ký: payOS HMAC, Apple signed, Google RTDN' },
    ext.identity && { ...ext.identity, id: 'identity' },
    { id: 'storage', lines: ['Lưu trữ và video', 'S3 / R2 / MinIO · VideoStoragePort · VideoTranscodePort · YouTube'], request: 'Presign, kiểm tra object, promote; transcode khi finalize', callback: '' },
    ext.analytics && { ...ext.analytics, id: 'analytics' },
  ].filter(Boolean);
  const comp = (id, label) => ({ id, label });
  return {
    id: 'overview',
    title: 'Kiến trúc Litmatch (bản đầu)',
    feature: { rest: 'REST · Socket.IO · WebRTC' },
    architecture: {
      components: [comp('client', 'Client: Web / Admin'), comp('core', 'core-api'), comp('postgres', 'PostgreSQL'), comp('redis', 'Redis'), comp('gateway', 'signaling-gateway'), comp('livekit', 'media-server LiveKit'), comp('broker', 'Kafka'), comp('push', 'FCM / APNs / Web Push'), comp('payments', 'Thanh toán'), comp('identity', 'Google / Apple / Facebook'), comp('storage', 'Lưu trữ và video'), comp('analytics', 'PostHog')],
      edges: [
        { from: 'client', to: 'core', protocol: 'REST: yêu cầu nghiệp vụ' },
        { from: 'core', to: 'postgres', protocol: 'state bền vững' },
        { from: 'core', to: 'redis', protocol: 'queue · index · Pub/Sub', bidirectional: true },
        { from: 'redis', to: 'gateway', protocol: 'realtime Pub/Sub' },
        { from: 'gateway', to: 'redis', protocol: 'presence · quota' },
        { from: 'gateway', to: 'client', protocol: 'Socket: realtime', bidirectional: true },
        { from: 'core', to: 'livekit', protocol: 'API · webhook', bidirectional: true },
        { from: 'livekit', to: 'redis', protocol: 'Pub/Sub', bidirectional: true },
        { from: 'client', to: 'livekit', protocol: 'Âm thanh trực tiếp / WebRTC', bidirectional: true },
        { from: 'core', to: 'push', protocol: 'push' },
        { from: 'push', to: 'client', protocol: 'push' },
        { from: 'core', to: 'broker', protocol: 'stream (tuỳ cấu hình)' },
        { from: 'core', to: 'payments', protocol: 'payment · receipt · webhook', bidirectional: true },
        { from: 'client', to: 'payments', protocol: 'payment', bidirectional: true },
        { from: 'core', to: 'identity', protocol: 'verify token (HTTP)', bidirectional: true },
        { from: 'client', to: 'identity', protocol: 'social sign-in', bidirectional: true },
        { from: 'core', to: 'storage', protocol: 'presign · media', bidirectional: true },
        { from: 'client', to: 'storage', protocol: 'upload/media', bidirectional: true },
        { from: 'client', to: 'analytics', protocol: 'HTTPS · analytics' },
      ],
    },
    dependencies: {
      modules,
      links: [],
      entities: [],
      redis: {
        business: [
          { role: 'queue · index · presence', label: 'hàng đợi ghép, chỉ mục, presence' },
          { role: 'Pub/Sub', label: 'publish event sau khi xử lý' },
          { role: 'rate limit', label: 'HTTP throttle nếu THROTTLE_STORAGE=redis' },
        ],
        signaling: true,
        mediaCluster: true,
      },
      externals: [...externals, ext.livekit, ext.broker].filter(Boolean),
      operations: [],
      notes: '',
      sources: [],
    },
  };
}

// ---------- CSS/JS (cùng biến màu với trang code và kiến trúc 10M) ----------
const TIER_LIGHT = '--t-controller:#1a7f37;--t-service:#bc4c00;--t-worker:#8250df;--t-postgres:#0969da;--t-redis:#cf222e;--t-kafka:#57606a;--t-external:#0a7a6b;--t-gateway:#9a6700';
const TIER_DARK = '--t-controller:#56d364;--t-service:#ffa657;--t-worker:#d2a8ff;--t-postgres:#58a6ff;--t-redis:#ff7b72;--t-kafka:#c9d1d9;--t-external:#39d0bb;--t-gateway:#e3b341';
const DARK_VARS = '--bg:#0d1117;--fg:#e6edf3;--muted:#8b949e;--border:#30363d;--subtle:#161b22;--accent:#4493f8;--ok:#56d364;--info:#58a6ff;--warn:#ffa657';
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
.toc{display:flex;flex-wrap:wrap;gap:4px 12px;padding:8px 16px;border-bottom:1px solid var(--border);font-size:13px}
.toc a.cur{color:var(--fg);font-weight:600;text-decoration:underline}
.idx{padding:20px 24px 28px}.idx h1{margin:0 0 8px;font-size:22px;font-weight:600}
.idx h2{margin:28px 0 8px;font-size:17px;font-weight:600}
.idx p{margin:0 0 14px;max-width:900px}.idx p.sum{color:var(--muted)}
.idx ul{margin:0 0 14px;padding-left:22px;max-width:900px}.idx li{margin:0 0 6px}
.note{border:1px solid var(--border);border-left:4px solid var(--info);background:var(--subtle);padding:10px 14px;border-radius:6px;max-width:900px;margin:0 0 18px}
.dia{overflow-x:auto;border:1px solid var(--border);border-radius:6px;margin:14px 0 8px;background:var(--bg)}
.dia svg{display:block;width:100%;height:auto;min-width:980px}
.dl{font-size:12px;color:var(--muted);margin:0 0 6px}
.tbl{width:100%;border-collapse:collapse;font-size:13.5px}.tbl th,.tbl td{padding:8px 12px;text-align:left;border-top:1px solid var(--border);vertical-align:top}
.tbl th{background:var(--subtle);font-size:12px;color:var(--muted);font-weight:600}
.tbl td.n{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--muted);white-space:nowrap}
.tbl code{font:12px ui-monospace,SFMono-Regular,Consolas,monospace;background:var(--subtle);border:1px solid var(--border);border-radius:6px;padding:1px 6px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin:0 0 14px}
.card{border:1px solid var(--border);border-radius:6px;padding:12px 14px;background:var(--subtle)}
.card h3{margin:0 0 6px;font-size:15px}.card p{margin:0 0 8px;color:var(--muted);font-size:13px}.card .lk{font-size:12px;color:var(--muted)}
.chip{display:inline-block;font:600 11px/18px -apple-system,"Segoe UI",sans-serif;padding:0 8px;border:1px solid var(--border);border-radius:999px;margin:0 4px 4px 0;color:var(--muted)}
@media (max-width:760px){main{padding:8px 0 32px}.box{border-radius:0;border-left:0;border-right:0}.bar{padding:8px 12px}.idx{padding:16px 12px 24px}.toc{padding:8px 12px}
.tbl,.tbl tbody,.tbl tr,.tbl td{display:block;width:100%}.tbl thead{display:none}.tbl tr{border-top:1px solid var(--border);padding:6px 0}.tbl td{border:0;padding:3px 12px}.dia svg{min-width:900px}}`;
const JS = `(function(){
var root=document.documentElement,key='litmatch-code-theme',btn=document.getElementById('theme'),labels={auto:'Tự động',light:'Sáng',dark:'Tối'};
var mode='auto';try{var s=localStorage.getItem(key);if(s==='light'||s==='dark')mode=s}catch(e){}
function apply(){if(mode==='auto')root.removeAttribute('data-theme');else root.setAttribute('data-theme',mode);btn.textContent='Theme: '+labels[mode]}
apply();
btn.addEventListener('click',function(){mode=mode==='auto'?'light':mode==='light'?'dark':'auto';try{if(mode==='auto')localStorage.removeItem(key);else localStorage.setItem(key,mode)}catch(e){}apply()});
})();`;

const NOTE =
  'Bản v2 vẽ lại sơ đồ KIẾN TRÚC của bản đầu từ đúng dữ liệu catalog đã xuất bản (thành phần, cạnh, module, thực thể, dịch vụ ngoài); không có luồng xử lý, không kiểm lại với code hôm nay. Phần đã đổi cho bài toán 10 triệu đồng thời nằm ở trang kiến trúc 10M.';

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
    <div class="path"><a href="${REPO}">litmatch-feature-flows</a> / <a href="index.html">architecture-v2</a>${crumb ? ` / <b>${esc(crumb)}</b>` : ''}<span class="meta">bản đầu · kiến trúc v2 · ${DATE}</span></div>
    <div class="actions">
      <a class="btn" href="index.html">Tổng quan v2</a>
      <a class="btn" href="../index.html">Bản gốc (v1)</a>
      <a class="btn" href="../architecture-10m/index.html">Kiến trúc 10M</a>${extraActions}
      <button class="btn" id="theme" type="button" title="Đổi theme">Theme: Tự động</button>
    </div>
  </div>
  <nav class="toc"><a href="index.html"${current === 'index' ? ' class="cur"' : ''}>Tổng quan</a>${items.map((j) => `<a href="${j.id}.html" title="${esc(j.title)}"${j.id === current ? ' class="cur"' : ''}>${j.id.slice(0, 2)}</a>`).join('')}</nav>
  <div class="idx">
${body}
  </div>
</div>
</main>
<script>${JS}</script>
</body>
</html>
`;

const dia = (slug, svg) => !assets ? `<div class="dia">${svg}</div>` : `<div class="dia">${svg}</div>
<p class="dl">Tải sơ đồ v2: <a href="${slug}.svg">SVG</a> · <a href="${slug}.png">PNG</a>${/^\d\d-/.test(slug) ? ` · bản gốc v1: <a href="../${slug}-architecture.png">PNG</a> · <a href="../${slug}-architecture.svg">SVG</a>` : ''}</p>`;
const ul = (arr) => `<ul>${arr.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
const table = (head, rows) =>
  `<table class="tbl"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c, i) => `<td${i === 0 && /^\d+$/.test(String(c)) ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;

// ---------- sinh file ----------
mkdirSync(outRoot, { recursive: true });
const written = [];
const diagrams = new Map();
const w = (name, text) => {
  writeFileSync(path.join(outRoot, name), text);
  written.push(name);
};
const ov = overviewData();
const ovLayout = layoutV1(ov, { title: 'Kiến trúc Litmatch (bản đầu): tổng quan (v2)' });
diagrams.set('overview', ovLayout.diagram);
if (assets) w('overview.svg', renderDiagramSvg(ovLayout.diagram, { standalone: true }));

for (const j of items) {
  const { diagram, links } = layoutV1(j);
  diagrams.set(j.id, diagram);
  if (assets) w(`${j.id}.svg`, renderDiagramSvg(diagram, { standalone: true }));
  const sec = [];
  sec.push(`<h2>Điểm quan trọng</h2><p>${esc(j.feature.archNotes?.important ?? '')}</p>`);
  if (j.feature.archNotes?.caution) sec.push(`<h2>Lưu ý</h2><p>${esc(j.feature.archNotes.caution)}</p>`);
  if (links.length)
    sec.push(
      `<h2>Quan hệ giữa module</h2>${table(['#', 'Từ → đến', 'Làm gì', 'Điều kiện'], links.map((l) => [String(l.n), `${esc(l.from)} → ${esc(l.to)}${l.drawn ? '' : ' <span class="chip">chỉ liệt kê, không vẽ mũi tên</span>'}`, esc(l.label), esc(l.condition || '')]))}`,
    );
  const linkItems = [
    `<li><a href="../index.html#${j.id}">Bản gốc v1: sơ đồ kiến trúc và luồng của mục này</a></li>`,
    ...(HAS_CODE.has(j.id) ? [`<li><a href="../code/${j.id}/index.html">Code các luồng khó của mục này (bản gốc /code)</a></li>`] : []),
    ...(TEN_M[j.id] ?? []).map((s) => `<li>Đã đổi ở đợt 10 triệu đồng thời: <a href="../architecture-10m/${s}.html">${esc(TEN_M_TITLE[s] ?? s)}</a></li>`),
    '<li><a href="index.html">Tổng quan kiến trúc v2</a></li>',
  ];
  sec.push(`<h2>Liên kết</h2><ul>${linkItems.join('')}</ul>`);
  sec.push(`<p class="sum">Dữ liệu của sơ đồ: <a href="../ai/diagrams/${j.id}.json">ai/diagrams/${j.id}.json</a> (catalog của bản gốc).</p>`);
  const body = `    <h1>${esc(j.title)}: kiến trúc (v2)</h1>
    <p class="sum">${esc(firstSentence(j.feature.archNotes?.important))}</p>
    <div class="note">${esc(NOTE)}</div>
${dia(j.id, renderDiagramSvg(diagram, { standalone: false }))}
${sec.join('\n')}`;
  w(
    `${j.id}.html`,
    shell({ title: `Kiến trúc v2: ${j.title}`, description: firstSentence(j.feature.archNotes?.important) || j.title, current: j.id, crumb: j.id, extraActions: assets ? `\n      <a class="btn" href="${j.id}.svg">SVG</a>\n      <a class="btn" href="${j.id}.png">PNG</a>` : '', body }),
  );
}

// trang tổng quan
const cards = items
  .map((j) => {
    const mods = (j.dependencies.modules ?? []).length;
    const exts = (j.dependencies.externals ?? []).map((e) => oneLine(e.lines?.[0] ?? e.id)).slice(0, 3);
    return `<div class="card"><h3><a href="${j.id}.html">${esc(j.id.slice(0, 2))} · ${esc(j.title)}</a></h3><p>${esc(firstSentence(j.feature.archNotes?.important))}</p><div class="lk"><span class="chip">${mods} module</span>${exts.map((e) => `<span class="chip">${esc(e)}</span>`).join('')}</div></div>`;
  })
  .join('\n');
const indexBody = `    <h1>Kiến trúc Litmatch (bản đầu): sơ đồ kiến trúc v2</h1>
    <p class="sum">Bản v2 của 25 sơ đồ kiến trúc của bản đầu, vẽ theo cùng kiểu với bản 10 triệu đồng thời: mỗi sơ đồ có thêm module tham gia (kèm thực thể và hành động), quan hệ giữa module, dịch vụ ngoài (gọi và nhận), Redis dùng làm gì và job nền. Chỉ có sơ đồ kiến trúc; luồng xử lý và code vẫn ở bản gốc.</p>
    <div class="note">${esc(NOTE)}</div>
${dia('overview', renderDiagramSvg(ovLayout.diagram, { standalone: false }))}
    <h2>25 sơ đồ kiến trúc</h2>
    <div class="cards">
${cards}
    </div>
    <h2>Liên kết</h2>
    <ul>
      <li><a href="../index.html">Bản gốc (v1)</a>: kiến trúc và luồng xử lý của từng chức năng.</li>
      <li><a href="../code/index.html">Code các luồng khó (bản gốc /code)</a>.</li>
      <li><a href="../architecture-10m/index.html">Kiến trúc 10M</a> và <a href="../code-10m/index.html">code 10M</a>: những gì đã đổi cho 10 triệu đồng thời.</li>
    </ul>`;
w(
  'index.html',
  shell({ title: 'Kiến trúc Litmatch (bản đầu): kiến trúc v2', description: 'Bản v2 của 25 sơ đồ kiến trúc của bản đầu, vẽ lại từ cùng dữ liệu catalog theo kiểu bản 10 triệu đồng thời.', current: 'index', crumb: '', extraActions: assets ? '\n      <a class="btn" href="overview.svg">SVG</a>\n      <a class="btn" href="overview.png">PNG</a>' : '', body: indexBody }),
);

// README
const readme = `# Kiến trúc Litmatch (bản đầu): sơ đồ kiến trúc v2

Bản v2 của 25 sơ đồ kiến trúc của bản đầu, vẽ theo cùng kiểu với [bản 10 triệu đồng thời](../architecture-10m/README.md). Chỉ có sơ đồ kiến trúc; luồng xử lý và code ở bản gốc.

${NOTE}

![Tổng quan](overview.png)

| # | Sơ đồ v2 | Điểm quan trọng | Bản gốc v1 |
|---|----------|-----------------|------------|
${items.map((j) => `| ${j.id.slice(0, 2)} | [${j.title}](${SITE}/architecture-v2/${j.id}.html) | ${firstSentence(j.feature.archNotes?.important).replaceAll('|', '/')} | [PNG](../${j.id}-architecture.png) · [SVG](../${j.id}-architecture.svg) |`).join('\n')}

Trang Pages: ${SITE}/architecture-v2/index.html · Bản gốc: ${SITE}/ · Kiến trúc 10M: ${SITE}/architecture-10m/index.html
`;
if (assets) w('README.md', readme);

// PNG (Edge qua Playwright, theme tối như gallery, 1.5×)
if (assets) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({
    executablePath: process.env.LITMATCH_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  });
  try {
    for (const [slug, d] of diagrams) {
      const ctx = await browser.newContext({ viewport: { width: d.width, height: d.height }, colorScheme: 'dark', deviceScaleFactor: 1.5 });
      const page = await ctx.newPage();
      await page.setContent(`<!doctype html><html><body style="margin:0">${renderDiagramSvg(d, { standalone: true })}</body></html>`);
      await page.screenshot({ path: path.join(outRoot, `${slug}.png`), clip: { x: 0, y: 0, width: d.width, height: d.height } });
      await ctx.close();
      written.push(`${slug}.png`);
    }
  } finally {
    await browser.close();
  }
}
console.log(`architecture-v2: ${written.length} file · ${items.length} sơ đồ + tổng quan · ${DATE}`);
