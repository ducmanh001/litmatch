// Vẽ sơ đồ kiến trúc 10M bằng SVG thuần: hộp/trụ/nhóm, cạnh vuông góc có nhãn, chú giải. Không phụ thuộc thư viện.
// Màu theo tầng giống trang code (CONTROLLER/SERVICE/WORKER/POSTGRES/REDIS/KAFKA/EXTERNAL/GATEWAY).
// `inline` = nhúng vào trang HTML (dùng biến màu của trang); `standalone` = file .svg riêng (tự mang biến màu sáng/tối).
const esc = (s) =>
  String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const KIND_COLOR = {
  client: '--muted',
  gateway: '--t-gateway',
  service: '--t-service',
  worker: '--t-worker',
  postgres: '--t-postgres',
  redis: '--t-redis',
  kafka: '--t-kafka',
  external: '--t-external',
  ops: '--muted',
};
const KIND_LABEL = {
  client: 'client',
  gateway: 'GATEWAY',
  service: 'core-api (SERVICE)',
  worker: 'job nền (WORKER)',
  postgres: 'POSTGRES',
  redis: 'REDIS',
  kafka: 'KAFKA',
  external: 'bên ngoài / media',
  ops: 'hạ tầng ngoài code (ghi để đối chiếu)',
};
const CYLINDER = new Set(['postgres', 'redis', 'kafka']);
const isCyl = (n) => (n.shape ? n.shape === 'cyl' : CYLINDER.has(n.kind));

// bề rộng ước lượng (px) của chuỗi: đủ rộng cho tiếng Việt có dấu
const textW = (s, size, bold = false) =>
  Math.ceil([...String(s)].length * size * (bold ? 0.6 : 0.55));

const STANDALONE_VARS = `
:root{--bg:#ffffff;--fg:#1f2328;--muted:#59636e;--border:#d1d9e0;--subtle:#f6f8fa;--accent:#0969da;--ok:#1a7f37;--warn:#bc4c00;
--t-controller:#1a7f37;--t-service:#bc4c00;--t-worker:#8250df;--t-postgres:#0969da;--t-redis:#cf222e;--t-kafka:#57606a;--t-external:#0a7a6b;--t-gateway:#9a6700}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#8b949e;--border:#30363d;--subtle:#161b22;--accent:#4493f8;--ok:#56d364;--warn:#ffa657;
--t-controller:#56d364;--t-service:#ffa657;--t-worker:#d2a8ff;--t-postgres:#58a6ff;--t-redis:#ff7b72;--t-kafka:#c9d1d9;--t-external:#39d0bb;--t-gateway:#e3b341}}`;

const BASE_CSS = `
.bg{fill:var(--bg)}
.ttl{font:700 17px -apple-system,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif;fill:var(--fg)}
.sub{font:12px -apple-system,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif;fill:var(--muted)}
.nt{font:700 13px -apple-system,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif;fill:var(--fg)}
.nl{font:11.5px -apple-system,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif;fill:var(--muted)}
.gt{font:600 12px -apple-system,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif;fill:var(--muted)}
.el{font:600 11px -apple-system,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif;fill:var(--fg)}
.lg{font:11.5px -apple-system,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif;fill:var(--muted)}
.node{fill:var(--subtle);stroke-width:1.6}
.node.ops{stroke-dasharray:5 4}
.grp{fill:none;stroke:var(--border);stroke-width:1.2;stroke-dasharray:6 4}
.edge{fill:none;stroke-width:1.6;stroke-linejoin:round}
.edge.async{stroke-dasharray:6 4}
.pill{fill:var(--bg);stroke-width:1}
.tag{font:700 10px -apple-system,"Segoe UI",sans-serif}
.tagbg{stroke-width:1}
a:hover .nt{text-decoration:underline}`;

function ports(n, side, off = 0) {
  const { x, y, w, h } = n;
  if (side === 'l') return { x, y: y + h / 2 + off, side };
  if (side === 'r') return { x: x + w, y: y + h / 2 + off, side };
  if (side === 't') return { x: x + w / 2 + off, y, side };
  return { x: x + w / 2 + off, y: y + h, side: 'b' };
}

// tuyến cạnh vuông góc: nếu có `via` thì đi qua các điểm đó, ngược lại chọn theo cặp cạnh
function route(A, B, e) {
  if (e.via) return [A, ...e.via.map(([x, y]) => ({ x, y })), B];
  const pair = `${A.side}${B.side}`;
  const mx = e.mx ?? (A.x + B.x) / 2;
  const my = e.my ?? (A.y + B.y) / 2;
  const gap = e.gap ?? 28;
  switch (pair) {
    case 'rl':
    case 'lr':
      return A.y === B.y
        ? [A, B]
        : [A, { x: mx, y: A.y }, { x: mx, y: B.y }, B];
    case 'bt':
    case 'tb':
      return A.x === B.x
        ? [A, B]
        : [A, { x: A.x, y: my }, { x: B.x, y: my }, B];
    case 'rt':
    case 'rb':
    case 'lt':
    case 'lb':
      return [A, { x: B.x, y: A.y }, B];
    case 'bl':
    case 'br':
    case 'tl':
    case 'tr':
      return [A, { x: A.x, y: B.y }, B];
    case 'bb': {
      const y = Math.max(A.y, B.y) + gap;
      return [A, { x: A.x, y }, { x: B.x, y }, B];
    }
    case 'tt': {
      const y = Math.min(A.y, B.y) - gap;
      return [A, { x: A.x, y }, { x: B.x, y }, B];
    }
    case 'rr': {
      const x = Math.max(A.x, B.x) + gap;
      return [A, { x, y: A.y }, { x, y: B.y }, B];
    }
    case 'll': {
      const x = Math.min(A.x, B.x) - gap;
      return [A, { x, y: A.y }, { x, y: B.y }, B];
    }
    default:
      return [A, B];
  }
}

// đường gấp khúc có góc bo
function pathOf(points, r = 8) {
  const pts = points.filter(
    (p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y,
  );
  if (pts.length < 2) return '';
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const a = {
      x: p1.x - ((p1.x - p0.x) / l1) * rr,
      y: p1.y - ((p1.y - p0.y) / l1) * rr,
    };
    const b = {
      x: p1.x + ((p2.x - p1.x) / l2) * rr,
      y: p1.y + ((p2.y - p1.y) / l2) * rr,
    };
    d += ` L${a.x},${a.y} Q${p1.x},${p1.y} ${b.x},${b.y}`;
  }
  const last = pts.at(-1);
  return `${d} L${last.x},${last.y}`;
}

// điểm tại tỉ lệ `t` chiều dài đường
function pointAt(points, t) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const l = Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
    segs.push(l);
    total += l;
  }
  let want = total * t;
  for (let i = 0; i < segs.length; i += 1) {
    if (want <= segs[i] || i === segs.length - 1) {
      const f = segs[i] === 0 ? 0 : want / segs[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * f,
        y: points[i].y + (points[i + 1].y - points[i].y) * f,
      };
    }
    want -= segs[i];
  }
  return points[0];
}

const nodeSize = (n) => {
  const titleW = textW(n.title, 13, true);
  const linesW = Math.max(0, ...(n.lines ?? []).map((l) => textW(l, 11.5)));
  const w = n.w ?? Math.max(110, Math.max(titleW, linesW) + 28);
  const cyl = isCyl(n) ? 14 : 0;
  const h = n.h ?? 20 + 20 + (n.lines?.length ?? 0) * 16 + cyl;
  return { w, h };
};

/**
 * diagram = { title, subtitle?, width, height, groups?, nodes, edges, legend? }
 * node  = { id, kind, x, y, title, lines?, w?, h?, link?, origin? ('local'), badge? }
 * edge  = { from, to, fs, ts, fo?, tf?, label?, k? (kind màu), async?, both?, via?, mx?, my?, lp?, lx?, ly? }
 */
export function renderDiagramSvg(diagram, { standalone = false, up = '../' } = {}) {
  const { width, height } = diagram;
  const nodes = new Map();
  for (const n of diagram.nodes) {
    const { w, h } = nodeSize(n);
    nodes.set(n.id, { ...n, w, h });
  }
  const kinds = new Set(['client']);
  const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(diagram.title)}" font-family="-apple-system,Segoe UI,Noto Sans,Helvetica,Arial,sans-serif">`,
  );
  out.push(`<title>${esc(diagram.title)}</title>`);
  out.push(`<style>${standalone ? STANDALONE_VARS : ''}${BASE_CSS}</style>`);
  const markerKinds = Object.keys(KIND_COLOR);
  out.push('<defs>');
  for (const k of markerKinds)
    out.push(
      `<marker id="ah-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(${KIND_COLOR[k]})"/></marker>`,
    );
  out.push('</defs>');
  out.push(`<rect class="bg" x="0" y="0" width="${width}" height="${height}"/>`);
  out.push(`<text class="ttl" x="24" y="30">${esc(diagram.title)}</text>`);
  if (diagram.subtitle)
    out.push(`<text class="sub" x="24" y="50">${esc(diagram.subtitle)}</text>`);

  for (const g of diagram.groups ?? []) {
    out.push(
      `<rect class="grp" x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="12"/>`,
    );
    out.push(`<text class="gt" x="${g.x + 14}" y="${g.y + 20}">${esc(g.title)}</text>`);
  }

  const drawNode = (n) => {
    const color = `var(${KIND_COLOR[n.kind]})`;
    kinds.add(n.kind);
    const cx = n.x + n.w / 2;
    const href = n.href ?? (n.link ? `${up}code-10m/${n.link}.html` : '');
    const open = href ? `<a href="${href}">` : '';
    const close = href ? '</a>' : '';
    out.push(open);
    if (isCyl(n)) {
      const ry = 8;
      out.push(
        `<path class="node" stroke="${color}" d="M${n.x},${n.y + ry} a${n.w / 2},${ry} 0 0 1 ${n.w},0 v${n.h - 2 * ry} a${n.w / 2},${ry} 0 0 1 -${n.w},0 z"/>`,
      );
      out.push(
        `<path class="node" stroke="${color}" fill="none" d="M${n.x},${n.y + ry} a${n.w / 2},${ry} 0 0 0 ${n.w},0"/>`,
      );
    } else {
      out.push(
        `<rect class="node${n.kind === 'ops' ? ' ops' : ''}" stroke="${color}" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="9"/>`,
      );
    }
    const top = n.y + (isCyl(n) ? 8 : 0);
    // align: 'left' dùng cho thẻ nhiều dòng (module, dịch vụ ngoài); mặc định căn giữa
    const left = n.align === 'left';
    const tx = left ? n.x + 14 : cx;
    const anchor = left ? 'start' : 'middle';
    out.push(`<text class="nt" text-anchor="${anchor}" x="${tx}" y="${top + 24}">${esc(n.title)}</text>`);
    (n.lines ?? []).forEach((l, i) =>
      out.push(
        `<text class="nl" text-anchor="${anchor}" x="${tx}" y="${top + 42 + i * 16}">${esc(l)}</text>`,
      ),
    );
    out.push(close);
    if (n.origin === 'local') {
      const tw = textW('local', 10, true) + 12;
      out.push(
        `<rect class="tagbg" x="${n.x + n.w - tw - 6}" y="${n.y - 8}" width="${tw}" height="16" rx="8" fill="var(--bg)" stroke="var(--warn)"/>`,
      );
      out.push(
        `<text class="tag" text-anchor="middle" x="${n.x + n.w - tw / 2 - 6}" y="${n.y + 3.5}" fill="var(--warn)">local</text>`,
      );
    }
  };
  // khung chứa (container) vẽ trước cạnh; cạnh vẽ trước node thường để đầu mũi không bị che bởi viền
  for (const n of nodes.values()) if (n.container) drawNode(n);
  const labels = [];
  for (const e of diagram.edges ?? []) {
    const a = nodes.get(e.from);
    const b = nodes.get(e.to);
    if (!a || !b) throw new Error(`cạnh ${e.from} → ${e.to}: thiếu node`);
    const A = ports(a, e.fs ?? 'r', e.fo ?? 0);
    const B = ports(b, e.ts ?? 'l', e.tf ?? 0);
    const pts = route(A, B, e);
    const k = e.k ?? 'client';
    kinds.add(k);
    const color = `var(${KIND_COLOR[k]})`;
    out.push(
      `<path class="edge${e.async ? ' async' : ''}" d="${pathOf(pts)}" stroke="${color}" marker-end="url(#ah-${k})"${e.both ? ` marker-start="url(#ah-${k})"` : ''}/>`,
    );
    if (e.label) {
      const p =
        e.lx !== undefined
          ? { x: e.lx, y: e.ly }
          : pointAt(pts, e.lp ?? 0.5);
      labels.push({ p, text: e.label, color });
    }
  }
  for (const n of nodes.values()) if (!n.container) drawNode(n);
  for (const l of labels) {
    const w = textW(l.text, 11, true) + 14;
    out.push(
      `<rect class="pill" x="${l.p.x - w / 2}" y="${l.p.y - 10}" width="${w}" height="20" rx="10" stroke="${l.color}"/>`,
    );
    out.push(`<text class="el" text-anchor="middle" x="${l.p.x}" y="${l.p.y + 4}">${esc(l.text)}</text>`);
  }

  // chú giải: các loại nút đã dùng + kiểu nét + nhãn local
  const items = [...kinds].filter((k) => KIND_LABEL[k] && k !== 'client');
  let lx = 24;
  const ly = height - 22;
  for (const k of items) {
    out.push(
      `<rect x="${lx}" y="${ly - 10}" width="14" height="14" rx="4" fill="none" stroke="var(${KIND_COLOR[k]})" stroke-width="1.6"${k === 'ops' ? ' stroke-dasharray="3 2"' : ''}/>`,
    );
    out.push(`<text class="lg" x="${lx + 20}" y="${ly + 1}">${esc(KIND_LABEL[k])}</text>`);
    lx += 20 + textW(KIND_LABEL[k], 11.5) + 22;
  }
  out.push(
    `<line x1="${lx}" y1="${ly - 3}" x2="${lx + 26}" y2="${ly - 3}" stroke="var(--muted)" stroke-width="1.6"/><text class="lg" x="${lx + 32}" y="${ly + 1}">gọi đồng bộ</text>`,
  );
  lx += 32 + textW('gọi đồng bộ', 11.5) + 18;
  out.push(
    `<line x1="${lx}" y1="${ly - 3}" x2="${lx + 26}" y2="${ly - 3}" stroke="var(--muted)" stroke-width="1.6" stroke-dasharray="6 4"/><text class="lg" x="${lx + 32}" y="${ly + 1}">bất đồng bộ / best-effort</text>`,
  );
  lx += 32 + textW('bất đồng bộ / best-effort', 11.5) + 18;
  if (diagram.nodes.some((n) => n.origin === 'local'))
    out.push(
      `<rect x="${lx}" y="${ly - 11}" width="34" height="16" rx="8" fill="var(--bg)" stroke="var(--warn)"/><text class="tag" text-anchor="middle" x="${lx + 17}" y="${ly + 0.5}" fill="var(--warn)">local</text><text class="lg" x="${lx + 40}" y="${ly + 1}">code chưa commit</text>`,
    );
  out.push('</svg>');
  return out.join('\n');
}
