// Dựng sơ đồ kiến trúc v2 (kiểu bản 10M) từ dữ liệu catalog của bản đầu (arch-v1-data/<id>.json = ai/diagrams của site).
// Giữ nguyên thành phần + cạnh của v1 (architecture.components/edges), thêm: module (uses, thực thể, hành động), dịch vụ
// ngoài (gọi/nhận/điều kiện), Redis dùng làm gì, job nền. Không thêm sự kiện nào ngoài dữ liệu catalog.
const W = 1280;
const CHAR = 6.3; // px mỗi ký tự ở cỡ chữ 11.5 (ước lượng thận trọng)
const GX = 270; // cột trái của nhóm core-api
const GW = 970;

export const wrap = (text, max) => {
  const out = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (!line) line = word;
    else if ((line + ' ' + word).length <= max) line += ` ${word}`;
    else {
      out.push(line);
      line = word;
    }
    while (line.length > max) {
      out.push(line.slice(0, max));
      line = line.slice(max);
    }
  }
  if (line) out.push(line);
  return out;
};
const bullet = (text, max) =>
  wrap(text, max - 2).map((l, i) => (i === 0 ? `• ${l}` : `  ${l}`));
const cap = (lines, n) =>
  lines.length <= n ? lines : [...lines.slice(0, n - 1), `${lines[n - 1].replace(/[ ,;:.]+$/, '')} …`];
const maxChars = (w) => Math.max(10, Math.floor((w - 28) / CHAR));
const nodeH = (lines, cyl = false) => 40 + 16 * lines.length + 4 + (cyl ? 14 : 0);

const clientTitle = (label) => (/^Client/.test(label) ? 'Client Web / Admin' : label);
const oneLine = (s) => String(s).replace(/\s*\n\s*/g, ' · ');

/** Phân lớp module theo quan hệ (longest path, chặn vòng). */
function layerModules(mods, links) {
  const names = mods.map((m) => m.name);
  const layer = Object.fromEntries(names.map((n) => [n, 0]));
  for (let k = 0; k < names.length; k += 1)
    for (const l of links)
      if (layer[l.from] !== undefined && layer[l.to] !== undefined && l.from !== l.to)
        layer[l.to] = Math.min(names.length, Math.max(layer[l.to], layer[l.from] + 1));
  return layer;
}

export function layoutV1(j, opts = {}) {
  const comps = new Map(j.architecture.components.map((c) => [c.id, c]));
  const has = (id) => comps.has(id);
  const deps = j.dependencies;
  const mods = deps.modules ?? [];
  const links = deps.links ?? [];
  const extDetail = new Map((deps.externals ?? []).map((e) => [e.id, e]));
  const nodes = [];
  const edges = [];
  const byId = new Map();
  const add = (n) => {
    nodes.push(n);
    byId.set(n.id, n);
    return n;
  };

  // ---------- hàng trên: client + dịch vụ ngoài ----------
  const INFRA = new Set(['client', 'core', 'postgres', 'redis', 'gateway', 'livekit', 'broker']);
  const extIds = [...comps.keys()].filter((id) => !INFRA.has(id));
  extIds.sort((a, b) => (a === 'push' ? -1 : b === 'push' ? 1 : 0));
  const hasCore = has('core');
  const extW = extIds.length <= 3 ? 230 : extIds.length === 4 ? 190 : 160;
  const extLines = (id) => {
    const d = extDetail.get(id);
    const c = comps.get(id);
    const mc = maxChars(extW);
    const lines = [];
    if (d?.lines?.[1]) lines.push(...cap(wrap(d.lines[1], mc), 2));
    if (d?.request) lines.push(...cap(wrap(`Gọi: ${d.request}`, mc), 2));
    if (d?.callback) lines.push(...cap(wrap(`Nhận: ${d.callback}`, mc), 2));
    if (!lines.length) lines.push(...wrap(oneLine(c.label), mc));
    return lines;
  };
  const clientLabel = clientTitle(comps.get('client')?.label ?? 'Client');
  const clientLines = cap(wrap(j.feature?.rest ?? '', 26), 3);
  const topLines = [
    clientLines.length,
    ...extIds.map((id) => extLines(id).length),
  ];
  const topH = 40 + 16 * Math.max(...topLines) + 4;
  const TOP_Y = 96;
  add({ id: 'client', kind: 'client', x: 40, y: TOP_Y, w: 200, h: topH, title: clientLabel, lines: clientLines });
  extIds.forEach((id, i) => {
    const d = extDetail.get(id);
    const title = d?.lines?.[0] ?? oneLine(comps.get(id).label);
    add({
      id,
      kind: 'external',
      x: hasCore ? 310 + i * (extW + 24) : 330 + i * (extW + 24),
      y: TOP_Y,
      w: extW,
      h: topH,
      title,
      lines: extLines(id),
      align: 'left',
    });
  });
  const topBottom = TOP_Y + topH;

  // ---------- nhóm core-api: thẻ module ----------
  let group = null;
  let bottomY = topBottom;
  const numbered = [];
  if (hasCore) {
    const gy = topBottom + 60;
    const layer = layerModules(mods, links);
    const depth = Math.max(0, ...Object.values(layer)) + 1;
    const gridMode = depth === 1;
    const cols = gridMode ? Math.min(3, Math.max(1, mods.length)) : Math.min(depth, 3);
    const gutter = gridMode ? 24 : 56;
    const inner = GW - 32;
    const cw = Math.floor((inner - (cols - 1) * gutter) / cols);
    const mc = maxChars(cw);
    const cardLines = (m) => [
      ...wrap(m.uses ?? '', mc),
      ...(m.entities?.length ? wrap(`Thực thể: ${m.entities.join(' · ')}`, mc) : []),
      ...(m.actions ?? []).flatMap((a) => bullet(a, mc)),
    ];
    const colOf = (m) => (gridMode ? null : Math.min(layer[m.name], cols - 1));
    const colY = Array(cols).fill(gy + 44);
    const cards = [];
    if (gridMode) {
      for (let r = 0; r * cols < mods.length; r += 1) {
        const rowMods = mods.slice(r * cols, r * cols + cols);
        const hs = rowMods.map((m) => nodeH(cardLines(m)));
        const h = Math.max(...hs);
        const y = colY[0];
        rowMods.forEach((m, c) =>
          cards.push({ m, x: GX + 16 + c * (cw + gutter), y, w: cw, h, lines: cardLines(m) }),
        );
        colY.fill(y + h + 18);
      }
    } else {
      for (const m of mods) {
        const c = colOf(m);
        const lines = cardLines(m);
        const h = nodeH(lines);
        cards.push({ m, x: GX + 16 + c * (cw + gutter), y: colY[c], w: cw, h, lines, col: c });
        colY[c] += h + 18;
      }
    }
    let contentBottom = Math.max(gy + 44, ...colY) - (mods.length ? 18 : 0);
    // job nền / vận hành
    const ops = deps.operations ?? [];
    let opsNode = null;
    if (ops.length) {
      const opsLines = ops.flatMap((o) => bullet(o, maxChars(inner)));
      const oh = nodeH(opsLines);
      opsNode = { id: 'ops', kind: 'worker', shape: 'rect', x: GX + 16, y: contentBottom + 18, w: inner, h: oh, title: 'Job nền và vận hành của luồng này', lines: opsLines, align: 'left' };
      contentBottom = opsNode.y + oh;
    }
    const gh = contentBottom + 20 - gy;
    group = add({ id: 'core', kind: 'service', shape: 'rect', x: GX, y: gy, w: GW, h: gh, title: 'core-api: module tham gia luồng này', lines: [], align: 'left', container: true });
    cards.forEach((c, i) =>
      add({ id: `m${i}`, kind: 'service', shape: 'rect', x: c.x, y: c.y, w: c.w, h: c.h, title: c.m.name, lines: c.lines, align: 'left', _m: c.m, _col: c.col }),
    );
    if (opsNode) add(opsNode);
    bottomY = gy + gh;

    // quan hệ giữa module: mũi tên giữa các cột kề nhau; còn lại chỉ liệt kê trong bảng
    const cardOf = new Map(cards.map((c, i) => [c.m.name, byId.get(`m${i}`)]));
    const firstInCol = new Set();
    const seenCol = new Set();
    for (const c of cards)
      if (!gridMode && !seenCol.has(c.col)) {
        seenCol.add(c.col);
        firstInCol.add(c.m.name);
      }
    const outSlot = {};
    const inSlot = {};
    const gutterUse = {};
    const pills = [];
    const place = (x, y) => {
      let yy = y;
      while (pills.some((p) => Math.abs(p.x - x) < 30 && Math.abs(p.y - yy) < 24)) yy += 24;
      pills.push({ x, y: yy });
      return yy;
    };
    links.forEach((l, k) => {
      const a = cardOf.get(l.from);
      const b = cardOf.get(l.to);
      const rec = { n: k + 1, ...l, drawn: false };
      numbered.push(rec);
      if (!a || !b || a === b) return;
      const ca = a._col;
      const cb = b._col;
      const os = (outSlot[l.from] = (outSlot[l.from] ?? -1) + 1);
      const is = (inSlot[l.to] = (inSlot[l.to] ?? -1) + 1);
      if (!gridMode && cb === ca + 1) {
        const gu = (gutterUse[ca] = (gutterUse[ca] ?? -1) + 1);
        const mx = a.x + a.w + 14 + (gu % 4) * 9;
        const ay = Math.min(a.y + a.h - 14, a.y + 26 + os * 22);
        const by = Math.min(b.y + b.h - 14, b.y + 26 + is * 22);
        const ly = place(mx, ay === by ? ay : (ay + by) / 2);
        edges.push({ from: a.id, to: b.id, fs: 'r', ts: 'l', fo: ay - (a.y + a.h / 2), tf: by - (b.y + b.h / 2), mx, k: 'service', label: String(k + 1), lx: mx, ly });
        rec.drawn = true;
      } else if (!gridMode && cb > ca + 1 && firstInCol.has(l.from) && firstInCol.has(l.to)) {
        const laneY = gy + 28;
        const ax = a.x + a.w / 2 + 20 + k * 6;
        const bx = b.x + b.w / 2 - 20 - k * 6;
        const lx = (ax + bx) / 2;
        edges.push({ from: a.id, to: b.id, fs: 't', ts: 't', fo: 20 + k * 6, tf: -20 - k * 6, via: [[ax, laneY], [bx, laneY]], k: 'service', label: String(k + 1), lx, ly: place(lx, laneY) });
        rec.drawn = true;
      }
    });
  }

  // ---------- hàng dưới: hạ tầng ----------
  const BOT = ['redis', 'livekit', 'postgres', 'broker'].filter(has);
  const widths = { redis: has('livekit') ? 280 : 300, livekit: 210, postgres: has('livekit') ? 300 : 340, broker: has('livekit') ? 190 : 220 };
  const botLines = (id) => {
    const mc = maxChars(widths[id]);
    if (id === 'redis') {
      const l = [];
      for (const r of deps.redis?.business ?? []) l.push(...bullet(`${r.role}: ${r.label}`, mc));
      if (deps.redis?.signaling) l.push(...bullet('gateway: presence · quota', mc));
      if (deps.redis?.mediaCluster) l.push(...bullet('LiveKit: state cluster khi cấu hình', mc));
      return l.length ? l : ['state tạm, dẫn xuất'];
    }
    if (id === 'postgres') return deps.entities?.length ? wrap(deps.entities.join(' · '), mc) : ['state bền vững'];
    const d = extDetail.get(id);
    const l = [];
    if (d?.lines?.[1]) l.push(...cap(wrap(d.lines[1], mc), 2));
    if (d?.request && id !== 'broker') l.push(...cap(wrap(d.request, mc), 3));
    if (id === 'livekit' && !l.length) l.push('WebRTC audio + room');
    return l.length ? l : [oneLine(comps.get(id).label)];
  };
  const botTitle = { redis: 'Redis', postgres: 'PostgreSQL', livekit: 'media-server (LiveKit)', broker: 'Kafka' };
  const BOT_Y = bottomY + 84;
  const botLinesMap = Object.fromEntries(BOT.map((id) => [id, botLines(id)]));
  const botH = BOT.length ? Math.max(...BOT.map((id) => nodeH(botLinesMap[id], true))) : 0;
  let bx = 40;
  BOT.forEach((id, i) => {
    if (i > 0) bx += id === 'livekit' || BOT[i - 1] === 'redis' && id === 'livekit' ? 100 : 50;
    add({ id, kind: id === 'livekit' ? 'external' : id === 'broker' ? 'kafka' : id, x: bx, y: BOT_Y, w: widths[id], h: botH, title: botTitle[id], lines: botLinesMap[id], shape: id === 'livekit' ? 'rect' : undefined, align: id === 'postgres' || id === 'redis' ? 'left' : undefined });
    bx += widths[id];
  });
  // gateway: cột trái, dưới đường REST từ client
  if (has('gateway')) {
    const gy2 = hasCore ? group.y + 150 : TOP_Y + topH + 80;
    add({ id: 'gateway', kind: 'gateway', x: 40, y: gy2, w: 200, h: 92, title: 'signaling-gateway', lines: ['xác thực JWT, fanout theo user', 'presence · quota trên Redis'] });
  }

  // ---------- cạnh theo kiến trúc v1 ----------
  const pairKey = (a, b) => [a, b].sort().join('|');
  const merged = new Map();
  for (const e of j.architecture.edges) {
    const k = `${e.from}>${e.to}`;
    const rev = `${e.to}>${e.from}`;
    if ((e.from === 'redis' && e.to === 'gateway') || (e.from === 'gateway' && e.to === 'redis')) {
      merged.set(k, { ...e });
      continue;
    }
    if (merged.has(rev) && !(e.from === 'gateway' || e.to === 'gateway')) {
      const m = merged.get(rev);
      m.bidirectional = true;
      if (!m.protocol.includes(e.protocol)) m.protocol += ` · ${e.protocol}`;
      continue;
    }
    if (merged.has(k)) continue;
    merged.set(k, { ...e });
  }
  const gcx = group ? group.x + group.w / 2 : 0;
  const vx = (target, k = 0) => {
    // x chung của nhóm core và đích để cạnh dọc thẳng
    const lo = Math.max(group.x + 24, target.x + 16);
    const hi = Math.min(group.x + group.w - 24, target.x + target.w - 16);
    return lo <= hi ? Math.min(hi, Math.max(lo, target.x + target.w / 2)) + k : target.x + target.w / 2;
  };
  const client = byId.get('client');
  const laneBase = 70;
  let topLane = 0;
  const bottomLaneY = BOT_Y + botH + 40;
  let usesBottomLane = false;
  let clientTopSlot = 0;
  const gwEdges = [];
  const INFRA_BELOW = new Set(['postgres', 'redis', 'livekit', 'broker']);
  for (const e of merged.values()) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const both = !!e.bidirectional;
    const label = e.protocol;
    const other = e.from === 'core' ? e.to : e.to === 'core' ? e.from : null;
    const gwPair = [e.from, e.to].sort().join('|');
    if (other === 'client') {
      // REST: từ đáy client xuống rồi vào mép trái nhóm core-api
      const fo = 60;
      edges.push({ from: 'client', to: 'core', fs: 'b', ts: 'l', fo, tf: group.y + 40 - (group.y + group.h / 2), k: 'service', label, lx: client.x + client.w / 2 + fo, ly: client.y + client.h + 40, both });
    } else if (other && INFRA_BELOW.has(other)) {
      const target = byId.get(other);
      const x = vx(target);
      const fromCore = e.from === 'core';
      const k = other === 'postgres' ? 'postgres' : other === 'redis' ? 'redis' : other === 'broker' ? 'kafka' : 'external';
      edges.push({
        from: fromCore ? 'core' : other,
        to: fromCore ? other : 'core',
        fs: fromCore ? 'b' : 't',
        ts: fromCore ? 't' : 'b',
        fo: fromCore ? x - gcx : x - (target.x + target.w / 2),
        tf: fromCore ? x - (target.x + target.w / 2) : x - gcx,
        k,
        label,
        both,
        async: other === 'broker',
      });
    } else if (gwPair === 'gateway|redis') {
      gwEdges.push({ into: e.to === 'gateway', label });
    } else if (gwPair === 'client|gateway') {
      edges.push({ from: 'client', to: 'gateway', fs: 'b', ts: 't', fo: -60, tf: -60, k: 'gateway', label, both: true });
    } else if (gwPair === 'livekit|redis') {
      edges.push({ from: 'livekit', to: 'redis', fs: 'l', ts: 'r', k: 'redis', label, both: true, async: true });
    } else if (gwPair === 'client|livekit') {
      usesBottomLane = true;
      const lk = byId.get('livekit');
      edges.push({ from: 'client', to: 'livekit', fs: 'l', ts: 'b', via: [[20, client.y + client.h / 2], [20, bottomLaneY], [lk.x + lk.w / 2, bottomLaneY]], k: 'external', label, both, lx: (20 + lk.x + lk.w / 2) / 2, ly: bottomLaneY });
    } else if (other) {
      // core ↔ dịch vụ ngoài: đoạn dọc ngắn từ đỉnh nhóm lên đáy hộp ngoài
      const ext = e.from === 'core' ? b : a;
      const fromCore = e.from === 'core';
      const x = ext.x + ext.w / 2;
      edges.push({ from: fromCore ? 'core' : ext.id, to: fromCore ? ext.id : 'core', fs: fromCore ? 't' : 'b', ts: fromCore ? 'b' : 't', fo: fromCore ? x - gcx : 0, tf: fromCore ? 0 : x - gcx, k: 'external', label, both, async: ext.id === 'push' });
    } else if (e.from === 'client' || e.to === 'client') {
      // client ↔ dịch vụ ngoài trực tiếp (hoặc push → client)
      const ext = e.from === 'client' ? b : a;
      if (!hasCore) {
        edges.push({ from: 'client', to: ext.id, fs: 'r', ts: 'l', k: 'external', label, both: e.bidirectional || e.from === 'client' });
      } else if (extIds[0] === ext.id && ext.id === 'push') {
        edges.push({ from: ext.id, to: 'client', fs: 'l', ts: 'r', k: 'external', label, async: true });
      } else {
        const slot = clientTopSlot++;
        const fo = -70 + slot * 35;
        const laneY = laneBase + topLane * 8;
        topLane += 1;
        const ax = client.x + client.w / 2 + fo;
        const bx2 = ext.x + ext.w / 2 + (slot % 2 ? 24 : -24);
        edges.push({ from: 'client', to: ext.id, fs: 't', ts: 't', fo, tf: bx2 - (ext.x + ext.w / 2), via: [[ax, laneY], [bx2, laneY]], k: 'external', label, both: e.bidirectional || e.from === 'client', lx: (ax + bx2) / 2, ly: laneY });
      }
    }
  }
  // redis ↔ gateway: hai mũi tên chữ L song song (mỗi chiều một nhãn)
  gwEdges.forEach((g, i) => {
    const off = g.into ? -28 : 28;
    const toff = g.into ? -12 : 12;
    const gw = byId.get('gateway');
    const rd = byId.get('redis');
    const gx = gw.x + gw.w / 2 + off;
    const tfx = gx - (rd.x + rd.w / 2);
    if (g.into) edges.push({ from: 'redis', to: 'gateway', fs: 't', ts: 'b', fo: tfx, tf: off, k: 'redis', label: g.label, lp: 0.7, async: true });
    else edges.push({ from: 'gateway', to: 'redis', fs: 'b', ts: 't', fo: off, tf: tfx, k: 'redis', label: g.label, lp: 0.7 });
  });

  // ---------- kích thước canvas ----------
  const lowest = Math.max(
    ...nodes.map((n) => n.y + n.h),
    usesBottomLane ? bottomLaneY : 0,
  );
  const height = lowest + 70;
  const diagram = {
    title: opts.title ?? `${j.title}: kiến trúc (v2)`,
    subtitle: `Dựng lại từ dữ liệu catalog của bản đầu (thêm module, thực thể, dịch vụ ngoài).${numbered.length ? ' Số trong vòng nhỏ: quan hệ giữa module, xem bảng bên dưới.' : ''}`,
    width: W,
    height,
    nodes: nodes.map(({ _m, _col, plain, ...n }) => n),
    edges,
  };
  return { diagram, links: numbered };
}
