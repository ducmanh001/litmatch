// review-module: N/A — one presentation preview; no business behavior changes.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const folder = path.dirname(fileURLToPath(import.meta.url));
const previewFolder = path.join(folder, 'previews');
const font = '"trebuchet ms", verdana, arial, sans-serif';
const width = 1208;
const centerX = width / 2;
const nodeWidth = 700;
const nodeX = centerX - nodeWidth / 2;
const gap = 78;
const colors = {
  background: '#121314',
  node: '#0d273f',
  border: '#1c354b',
  text: '#83c3ff',
  accent: '#68a9e0',
  line: '#666666',
  prose: '#b8bec5',
};
const steps = [
  {
    actor: 'Frontend',
    body: 'Người dùng chọn Soul / Voice\nvà nhấn Match',
    next: 'REST · POST /matching/tickets',
  },
  {
    actor: 'core-api · Matching',
    body: 'Kiểm tra quyền, quota, ticket hiện tại,\nIdempotency-Key và preference',
    next: 'SQL · INSERT',
  },
  {
    actor: 'PostgreSQL',
    body: 'Lưu MatchTicket\nTrạng thái: queued',
    next: 'SQL result · ticketId',
  },
  {
    actor: 'core-api · Matching',
    body: 'Chọn shard của hàng đợi\nGửi ticket sang Redis',
    next: 'Redis · ZADD',
  },
  {
    actor: 'Redis · Sorted Set',
    body: 'Xếp ticket vào queue\nShard theo matchType, region và ageBand',
    next: 'Redis result · enqueue thành công',
  },
  {
    actor: 'core-api · Matching',
    body: 'Sau enqueue thành công:\nđánh thức MatcherWorker',
    next: 'in-process · đánh thức worker',
  },
  {
    actor: 'core-api · MatcherWorker',
    body: 'Quét các shard đang hoạt động\nYêu cầu lấy hai ticket ưu tiên',
    next: 'Redis · ZPOPMIN key 2',
  },
  {
    actor: 'Redis · Sorted Set',
    body: 'Lấy và xoá hai ticket\ncó score thấp nhất trong shard',
    next: 'Redis result · 2 ticketId',
  },
  {
    actor: 'core-api · Matching',
    body: 'Mở transaction\nYêu cầu lock hai ticket để kiểm tra ghép cặp',
    next: 'SQL · SELECT FOR UPDATE',
  },
  {
    actor: 'PostgreSQL',
    body: 'Lock hai ticket\nTrả trạng thái mới nhất trong transaction',
    next: 'SQL result · ticket + user state',
  },
  {
    actor: 'core-api · Matching',
    body: 'Kiểm tra trạng thái, preference, block/report\nHợp lệ: xác nhận cặp trong transaction',
    next: 'SQL · ghi kết quả + COMMIT',
  },
  {
    actor: 'PostgreSQL',
    body: 'Lưu MatchSession và hai ticket: confirmed\nCOMMIT cùng một transaction',
    next: 'SQL result · commit thành công',
  },
  {
    actor: 'core-api · Matching',
    body: 'Sau commit thành công:\nphát event match.confirmed',
    next: 'Redis · PUBLISH',
  },
  {
    actor: 'Redis · Pub/Sub',
    body: 'Chuyển event match.confirmed\ntới subscriber của hai người dùng',
    next: 'Pub/Sub · PSUBSCRIBE',
  },
  {
    actor: 'signaling-gateway',
    body: 'Nhận event từ Redis\nGửi kết quả ghép tới hai client',
    next: 'WebSocket · match.confirmed',
  },
  {
    actor: 'Frontend',
    body: 'Nhận event; refetch trạng thái qua REST\nMở Soul Match / Voice Match',
  },
];
const notes = [
  {
    heading: 'Điểm quan trọng',
    body: 'MatcherWorker nằm trong core-api. PostgreSQL giữ trạng thái bền vững; Redis Sorted Set giữ queue, còn Redis Pub/Sub chuyển event. Kết quả chỉ được phát sau commit.',
  },
  {
    heading: 'Lưu ý',
    body: 'Đây là nhánh ghép thành công. Nếu kiểm tra không đạt, core-api xử lý expire/requeue theo trạng thái ticket. Frontend đọc lại trạng thái từ core-api qua REST vì Pub/Sub không giữ lịch sử.',
  },
];
const sources = [
  'docs/services/matching-service.md',
  'docs/services/realtime-gateway.md',
];
const hash = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex');
const existing = readdirSync(folder)
  .filter((name) => /\.(?:png|svg|html|zip|json|md)$/u.test(name))
  .map((name) => path.join(folder, name));
const before = new Map(existing.map((file) => [file, hash(file)]));
const escape = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const text = (
  x,
  baseline,
  lines,
  size,
  weight = 600,
  anchor = 'middle',
  fill = colors.text,
) =>
  `<text font-family='${font}' font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}">${lines.map((line, index) => `<tspan x="${x}" y="${baseline + index * (size + 8)}">${escape(line)}</tspan>`).join('')}</text>`;

const browser = await chromium.launch({
  executablePath:
    process.env.LITMATCH_BROWSER ??
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
});
try {
  const page = await browser.newPage({
    deviceScaleFactor: 2,
    viewport: { width, height: 1000 },
  });
  const measured = await page.evaluate(
    ({ steps, notes, font, nodeWidth, width }) => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      const measure = (value, size, weight = 600) => {
        context.font = `${weight} ${size}px ${font}`;
        return context.measureText(value).width;
      };
      const wrap = (value, available, size, weight = 600) => {
        const lines = [];
        for (const paragraph of value.split('\n')) {
          let line = '';
          for (const word of paragraph.split(/\s+/u)) {
            const candidate = line ? `${line} ${word}` : word;
            if (line && measure(candidate, size, weight) > available) {
              lines.push(line);
              line = word;
            } else line = candidate;
          }
          lines.push(line);
        }
        return lines;
      };
      return {
        steps: steps.map((step) => ({
          ...step,
          lines: wrap(step.body, nodeWidth - 48, 23),
          captionWidth: step.next ? measure(step.next, 17) + 36 : 0,
        })),
        notes: notes.map((note) => ({
          ...note,
          lines: wrap(note.body, width - 64, 21, 400),
        })),
      };
    },
    { steps, notes, font, nodeWidth, width },
  );

  const parts = [
    text(32, 40, ['Matching — Luồng xử lý theo thành phần'], 27, 700, 'start'),
    text(
      32,
      76,
      ['Từ nút Match đến khi mở phòng · nhánh ghép thành công'],
      20,
      400,
      'start',
      colors.prose,
    ),
  ];
  let cursor = 112;
  measured.steps.forEach((step, index) => {
    const height = Math.max(124, 84 + step.lines.length * 31);
    const bodyBaseline =
      cursor + 48 + (height - 48) / 2 - ((step.lines.length - 1) * 31) / 2 + 8;
    parts.push(
      `<g data-step="${index + 1}" data-actor="${escape(step.actor)}" data-x="${nodeX}" data-y="${cursor}" data-w="${nodeWidth}" data-h="${height}"><rect x="${nodeX}" y="${cursor}" width="${nodeWidth}" height="${height}" rx="26" fill="${colors.node}" stroke="${colors.border}" stroke-width="2"/><line x1="${nodeX + 18}" x2="${nodeX + nodeWidth - 18}" y1="${cursor + 48}" y2="${cursor + 48}" stroke="${colors.border}"/><circle cx="${nodeX + 32}" cy="${cursor + 25}" r="17" fill="${colors.background}" stroke="${colors.accent}" stroke-width="1.5"/>${text(nodeX + 32, cursor + 31, [String(index + 1).padStart(2, '0')], 18, 700)}${text(centerX + 12, cursor + 32, [step.actor], 22, 700)}${text(centerX, bodyBaseline, step.lines, 23)}</g>`,
    );
    cursor += height;
    if (step.next) {
      const captionY = cursor + gap / 2;
      const captionX = centerX - step.captionWidth / 2;
      parts.push(
        `<path data-wire="true" d="M ${centerX} ${cursor} V ${cursor + gap}" fill="none" stroke="${colors.line}" stroke-width="2" marker-end="url(#arrow)"/>`,
        `<g data-caption="true" data-x="${captionX}" data-y="${captionY - 18}" data-w="${step.captionWidth}" data-h="36"><rect x="${captionX}" y="${captionY - 18}" width="${step.captionWidth}" height="36" rx="18" fill="${colors.background}" stroke="${colors.accent}" stroke-width="1.5"/>${text(centerX, captionY + 6, [step.next], 17)}</g>`,
      );
      cursor += gap;
    }
  });
  cursor += 46;
  parts.push(
    `<line x1="32" x2="${width - 32}" y1="${cursor}" y2="${cursor}" stroke="#343a40"/>`,
  );
  cursor += 44;
  for (const note of measured.notes) {
    parts.push(
      text(32, cursor, [note.heading], 22, 700, 'start', colors.prose),
    );
    cursor += 34;
    parts.push(text(32, cursor, note.lines, 21, 400, 'start', colors.prose));
    cursor += note.lines.length * 29 + 26;
  }
  parts.push(
    text(
      32,
      cursor,
      ['Bản thử layout · nguồn: docs/services/matching-service.md'],
      17,
      400,
      'start',
      colors.accent,
    ),
  );
  const height = cursor + 38;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Matching — Luồng xử lý theo thành phần"><title>Matching — Luồng xử lý theo thành phần</title><rect width="100%" height="100%" fill="${colors.background}"/><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10" fill="none" stroke="${colors.line}" stroke-width="1.4"/></marker></defs>${parts.join('')}</svg>`;
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:${colors.background}">${svg}</body></html>`,
  );
  await page.evaluate(() => document.fonts.ready);
  const failures = await page.evaluate(() => {
    const issues = [];
    const boxes = [
      ...document.querySelectorAll('g[data-step],g[data-caption]'),
    ].map((element) => ({
      element,
      x: Number(element.dataset.x),
      y: Number(element.dataset.y),
      w: Number(element.dataset.w),
      h: Number(element.dataset.h),
    }));
    for (const box of boxes)
      for (const label of box.element.querySelectorAll('text')) {
        const bounds = label.getBBox();
        if (
          bounds.x < box.x + 2 ||
          bounds.y < box.y + 2 ||
          bounds.x + bounds.width > box.x + box.w - 2 ||
          bounds.y + bounds.height > box.y + box.h - 2
        )
          issues.push('Text outside step or caption');
      }
    for (let i = 0; i < boxes.length; i += 1)
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (
          a.x < b.x + b.w &&
          a.x + a.w > b.x &&
          a.y < b.y + b.h &&
          a.y + a.h > b.y
        )
          issues.push('Overlapping step/caption');
      }
    if (document.querySelectorAll('g[data-step]').length !== 16)
      issues.push('Missing step');
    if (document.querySelectorAll('g[data-caption]').length !== 15)
      issues.push('Missing caption');
    return issues;
  });
  if (failures.length) throw new Error(failures.join('; '));
  mkdirSync(previewFolder, { recursive: true });
  const stem = path.join(previewFolder, 'matching-layer-flow');
  await page.locator('svg').screenshot({
    path: `${stem}.png`,
    animations: 'disabled',
    timeout: 30000,
  });
  writeFileSync(`${stem}.svg`, svg, 'utf8');
  for (const [file, digest] of before)
    if (hash(file) !== digest)
      throw new Error(`Existing diagram changed: ${file}`);
  process.stdout.write(
    `${JSON.stringify({ png: `${stem}.png`, svg: `${stem}.svg`, width: width * 2, height: height * 2, steps: steps.length, layout: 'PASS', existingArtifacts: 'UNCHANGED', sources })}\n`,
  );
} finally {
  await browser.close();
}
