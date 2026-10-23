// Dựng ảnh "luồng + code thật" cho một tính năng: mỗi bước là một khung kiểu VS Code, code đọc
// TRỰC TIẾP từ file trong repo (theo mốc anchor, không copy tay) rồi tô màu bằng TypeScript scanner.
//   node layouts/feature-flows/code-flow-render.mjs [--only=08-avatar-tuy-chinh-buy]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { chromium } from '@playwright/test';
import { codeFlows } from './code-flow-catalog.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(here, '../..');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

const esc = (s) =>
  String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const span = (cls, text) => (cls ? `<span class="${cls}">${esc(text)}</span>` : esc(text));
/** Token nhiều dòng phải đóng/mở span theo từng dòng để cắt theo dòng không vỡ thẻ. */
const emit = (cls, text) =>
  text
    .split('\n')
    .map((p) => (p === '' ? '' : span(cls, p)))
    .join('\n');

// ---------- tô màu TypeScript (cả file một lần, rồi cắt theo dòng) ----------
const K = ts.SyntaxKind;
const CONTROL = new Set(['if', 'else', 'return', 'throw', 'try', 'catch', 'finally', 'await', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'default', 'import', 'export', 'from', 'yield']);
const CONTEXTUAL = new Set(['type', 'from', 'of', 'as', 'get', 'set', 'async', 'readonly', 'public', 'private', 'protected', 'static', 'abstract', 'declare', 'satisfies']);

function highlightTsFile(text) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text);
  const toks = [];
  const stack = [];
  for (let k = scanner.scan(); k !== K.EndOfFileToken; k = scanner.scan()) {
    if (k === K.OpenBraceToken) stack.push('b');
    if (k === K.TemplateHead) stack.push('t');
    if (k === K.CloseBraceToken) {
      if (stack.pop() === 't') {
        k = scanner.reScanTemplateToken(false);
        if (k === K.TemplateMiddle) stack.push('t');
      }
    }
    toks.push({ k, t: scanner.getTokenText() });
  }
  const trivia = (k) => k === K.WhitespaceTrivia || k === K.NewLineTrivia;
  const sig = toks.map((tok, i) => (trivia(tok.k) || tok.k === K.SingleLineCommentTrivia || tok.k === K.MultiLineCommentTrivia ? -1 : i)).filter((i) => i >= 0);
  const posInSig = new Map(sig.map((tokIndex, p) => [tokIndex, p]));
  const prevOf = (i) => toks[sig[(posInSig.get(i) ?? 0) - 1]];
  const nextOf = (i) => toks[sig[(posInSig.get(i) ?? 0) + 1]];

  let html = '';
  toks.forEach((tok, i) => {
    const { k, t } = tok;
    let cls = '';
    if (k === K.SingleLineCommentTrivia || k === K.MultiLineCommentTrivia) cls = 'com';
    else if (trivia(k)) cls = '';
    else if (k === K.StringLiteral || k === K.NoSubstitutionTemplateLiteral || k === K.TemplateHead || k === K.TemplateMiddle || k === K.TemplateTail) cls = 'str';
    else if (k === K.NumericLiteral || k === K.BigIntLiteral) cls = 'nm';
    else if (k === K.Identifier || (k >= K.FirstKeyword && k <= K.LastKeyword)) {
      const prev = prevOf(i);
      const next = nextOf(i);
      const afterDot = prev && (prev.k === K.DotToken || prev.k === K.QuestionDotToken);
      const isKw = k !== K.Identifier;
      if (isKw && !afterDot && !(next?.k === K.ColonToken && CONTEXTUAL.has(t))) {
        cls = CONTROL.has(t) ? 'cf' : 'kw';
      } else if (prev?.k === K.AtToken) cls = 'fn';
      else if (prev?.k === K.NewKeyword) cls = 'ty';
      else if (next?.k === K.OpenParenToken) cls = 'fn';
      else if (/^[A-Z][A-Z0-9_]+$/.test(t)) cls = 'cst';
      else if (/^[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*$/.test(t) && !afterDot) cls = 'ty';
      else cls = 'var';
    }
    html += emit(cls, t);
  });
  return html.split('\n');
}

// ---------- tô màu Lua / SQL / JSON theo từng dòng ----------
const LUA_KW = new Set(['local', 'if', 'then', 'end', 'return', 'else', 'elseif', 'for', 'do', 'while', 'function', 'and', 'or', 'not', 'nil', 'true', 'false']);
const SQL_KW = new Set(['CREATE', 'TABLE', 'PRIMARY', 'KEY', 'DEFAULT', 'NOT', 'NULL', 'REFERENCES', 'CONSTRAINT', 'UNIQUE', 'CHECK', 'INDEX', 'ON', 'INSERT', 'INTO', 'VALUES', 'SELECT', 'FROM', 'WHERE', 'FOR', 'UPDATE', 'CONFLICT', 'DO', 'NOTHING', 'AND', 'true', 'false']);
const SQL_TY = new Set(['uuid', 'varchar', 'int', 'timestamptz', 'boolean', 'bigint', 'jsonb', 'text']);
function highlightGenericLine(line, lang) {
  const re = /(--.*$)|('(?:[^']|'')*'|"(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)(\s*\()?|([^\s])/g;
  let out = '';
  let last = 0;
  for (const m of line.matchAll(re)) {
    out += esc(line.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1]) out += span('com', m[1]);
    else if (m[2]) out += span(lang === 'json' && /^\s*:/.test(line.slice(last)) ? 'var' : 'str', m[2]);
    else if (m[3]) out += span('nm', m[3]);
    else if (m[4]) {
      const w = m[4];
      let cls = 'var';
      if (lang === 'lua' && LUA_KW.has(w)) cls = 'cf';
      else if (lang === 'sql' && SQL_KW.has(w.toUpperCase())) cls = 'kw';
      else if (lang === 'sql' && SQL_TY.has(w)) cls = 'ty';
      else if (lang === 'json' && ['true', 'false', 'null'].includes(w)) cls = 'kw';
      else if (m[5]) cls = 'fn';
      out += span(cls, w) + esc(m[5] ?? '');
    } else out += esc(m[0]);
  }
  return out + esc(line.slice(last));
}

// ---------- đọc đoạn code thật theo anchor ----------
const fileCache = new Map();
function loadFile(rel) {
  if (!fileCache.has(rel)) {
    const text = readFileSync(path.join(repoDir, rel), 'utf8').replace(/\r\n/g, '\n');
    fileCache.set(rel, {
      lines: text.split('\n'),
      tsHtml: /\.(ts|tsx|mts|mjs)$/.test(rel) ? highlightTsFile(text) : null,
    });
  }
  return fileCache.get(rel);
}

function resolveSegments(file, lines, ranges) {
  const segs = [];
  let cursor = 0;
  for (const r of ranges) {
    const spec = typeof r === 'string' ? { at: r } : r;
    let idx = -1;
    let seen = 0;
    for (let i = cursor; i < lines.length; i += 1) {
      if (lines[i].includes(spec.at) && seen++ === (spec.nth ?? 0)) {
        idx = i;
        break;
      }
    }
    if (idx < 0) throw new Error(`${file}: không thấy anchor "${spec.at}" (sau dòng ${cursor + 1})`);
    let end = idx;
    if (typeof spec.lines === 'number') end = idx + spec.lines - 1;
    else if (spec.to) {
      const re = spec.to.startsWith('^') ? new RegExp(spec.to) : null;
      end = -1;
      for (let i = idx; i < lines.length; i += 1) {
        if (re ? re.test(lines[i]) : lines[i].includes(spec.to)) {
          end = i;
          break;
        }
      }
      if (end < 0) throw new Error(`${file}: không thấy điểm kết thúc "${spec.to}" sau "${spec.at}"`);
    }
    const [before, after] = spec.pad ?? [0, 0];
    const start = Math.max(0, idx - before);
    const stop = Math.min(lines.length - 1, end + after);
    segs.push([start, stop]);
    cursor = stop + 1;
  }
  return segs;
}

const EXT_BADGE = { ts: ['TS', '#3178c6'], tsx: ['TSX', '#3178c6'], mjs: ['JS', '#cbcb41'], sql: ['SQL', '#e38c00'], lua: ['LUA', '#5b7bd5'], json: ['{}', '#cbcb41'] };

function renderSnippet(sn) {
  const lang = sn.lang ?? 'ts';
  let rows = [];
  let title;
  let crumb = '';
  let range = '';
  let badge;
  if (sn.text !== undefined) {
    sn.text.split('\n').forEach((l, i) => rows.push({ n: i + 1, html: highlightGenericLine(l, lang), raw: l }));
    title = sn.title;
    crumb = sn.crumb ?? 'minh họa theo code ở trên';
    badge = EXT_BADGE[lang] ?? EXT_BADGE.json;
  } else {
    const f = loadFile(sn.file);
    const segs = resolveSegments(sn.file, f.lines, sn.ranges);
    segs.forEach(([a, b], si) => {
      if (si > 0 && a > segs[si - 1][1] + 1) rows.push({ gap: true });
      for (let i = a; i <= b; i += 1) {
        const html = lang === 'ts' && f.tsHtml ? f.tsHtml[i] : highlightGenericLine(f.lines[i], lang);
        rows.push({ n: i + 1, html, raw: f.lines[i] });
      }
    });
    const nums = rows.filter((r) => !r.gap).map((r) => r.n);
    range = nums.length ? `L${nums[0]}–${nums.at(-1)}` : '';
    const parts = sn.file.split('/');
    title = parts.at(-1);
    crumb = parts.slice(0, -1).join(' › ');
    const ext = title.split('.').at(-1);
    badge = EXT_BADGE[lang === 'ts' ? ext : lang] ?? EXT_BADGE.ts;
  }
  const hl = (sn.hl ?? []).map(String);
  const width = String(Math.max(...rows.filter((r) => !r.gap).map((r) => r.n))).length;
  const body = rows
    .map((r) => {
      if (r.gap) return '<div class="ln gap"><span class="n"></span><span class="t">⋯</span></div>';
      const on = hl.some((h) => r.raw.includes(h));
      return `<div class="ln${on ? ' on' : ''}"><span class="n" style="min-width:${width}ch">${r.n}</span><span class="t">${r.html || ' '}</span></div>`;
    })
    .join('');
  return `<div class="win"><div class="tabs"><span class="tab"><i class="ic" style="color:${badge[1]}">${badge[0]}</i>${esc(title)}</span><span class="range">${esc(range)}${sn.label ? ` · ${esc(sn.label)}` : ''}</span></div><div class="crumb">${esc(crumb)}</div><div class="code">${body}</div></div>`;
}

// ---------- layout trang ----------
const LAYERS = {
  client: ['CLIENT', '#61afef'],
  http: ['MIDDLEWARE', '#e5c07b'],
  guard: ['GUARD', '#e06c75'],
  pipe: ['PIPE', '#c678dd'],
  interceptor: ['INTERCEPTOR', '#56b6c2'],
  controller: ['CONTROLLER', '#98c379'],
  service: ['SERVICE', '#d19a66'],
  repo: ['REPOSITORY', '#4ec9b0'],
  db: ['POSTGRESQL', '#5b9bff'],
  redis: ['REDIS', '#ff6b5b'],
  kafka: ['OUTBOX → KAFKA', '#e8e8e8'],
  error: ['EXCEPTION FILTER', '#ff7b72'],
};

const pill = (l) => `<span class="pill" style="--c:${LAYERS[l][1]}">${LAYERS[l][0]}</span>`;
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');

function renderStep(step, number) {
  const layers = step.layers;
  const color = LAYERS[layers[0]][1];
  const num = String(number).padStart(2, '0');
  const bullets = (step.bullets ?? []).map((b) => `<li>${inline(b)}</li>`).join('');
  const chips = (step.chips ?? []).map((c) => `<span class="chip">${inline(c)}</span>`).join('');
  const table = step.table
    ? `<table class="tbl"><thead><tr>${step.table.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${step.table.rows
        .map((r) => `<tr>${r.map((c, i) => `<td${i === 0 ? ' class="st"' : ''}>${inline(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`
    : '';
  const wins = (step.snippets ?? []).map(renderSnippet).join('');
  return `<div class="step${step.async ? ' async' : ''}" style="--c:${color}">
  <aside class="card"><div class="head"><span class="num">${num}</span>${layers.map(pill).join('')}${step.async ? '<span class="tag">ASYNC · ngoài request</span>' : ''}</div>
  <h3>${inline(step.title)}</h3>${step.when ? `<p class="when">${inline(step.when)}</p>` : ''}<ul>${bullets}</ul>${chips ? `<div class="chips">${chips}</div>` : ''}</aside>
  <div class="wins">${wins}${table}</div></div>`;
}

const link = (label) => `<div class="link"><span class="line"></span><span class="lab">▼ ${inline(label)}</span></div>`;

function renderFlow(flow) {
  let counter = 0;
  const rail = flow.rail
    .map((r) => `<span class="rchip${r.off ? ' off' : ''}" style="--c:${LAYERS[r.layer][1]}">${esc(r.label)}${r.steps ? `<small>bước ${esc(r.steps)}</small>` : ''}</span>`)
    .join('<span class="rarrow">›</span>');
  const notUsed = (flow.notUsed ?? [])
    .map((n) => `<div class="nu"><b>${esc(n.name)}</b><span>${inline(n.why)}</span></div>`)
    .join('');
  const others = flow.otherEndpoints
    ? `<div class="others"><h3>${esc(flow.otherEndpoints.title)}</h3><table class="tbl"><thead><tr>${flow.otherEndpoints.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${flow.otherEndpoints.rows.map((r) => `<tr>${r.map((c, i) => `<td${i === 0 ? ' class="st"' : ''}>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    : '';
  const parts = flow.parts.map((part, pi) => {
    const steps = part.steps
      .map((s, si) => {
        counter += 1;
        return renderStep(s, counter) + (s.arrow ? link(s.arrow) : si < part.steps.length - 1 ? link('tiếp tục') : '');
      })
      .join('');
    const cover =
      pi === 0
        ? `<header><div class="eyebrow">${esc(flow.eyebrow)}</div><h1>${esc(flow.title)}</h1><p class="sub">${inline(flow.subtitle)}</p><div class="rail">${rail}</div><p class="legend">Thứ tự Nest xử lý một request: <b>Middleware → Guard → Interceptor (trước) → Pipe → Handler → Interceptor (sau) → Exception Filter</b>. Khung code là đoạn thật trong repo, số dòng là số dòng thật; dòng vàng là dòng quyết định.</p></header>`
        : '';
    const tail =
      pi === flow.parts.length - 1
        ? `${others}<div class="notused"><h3>Không đi qua trong tính năng này</h3>${notUsed}</div>`
        : '';
    return `<section class="part" id="${flow.id}-part-${pi + 1}">${cover}<div class="parthead"><span>PHẦN ${pi + 1}/${flow.parts.length}</span>${esc(part.title)}</div>${steps}${tail}</section>`;
  });
  return parts;
}

const CSS = `
*{box-sizing:border-box}html,body{margin:0}
body{background:#121314;color:#b8bec5;font:15px/1.55 "trebuchet ms",verdana,arial,sans-serif;width:1600px}
.part{padding:34px 36px 30px;background:#121314}
header{margin-bottom:26px}.eyebrow{color:#68a9e0;font-size:14px;letter-spacing:.08em;text-transform:uppercase}
h1{margin:4px 0 6px;font-size:32px;color:#83c3ff}.sub{margin:0 0 18px;font-size:17px}
.rail{display:flex;flex-wrap:wrap;gap:8px 4px;align-items:center;padding:14px 16px;background:#181a1d;border:1px solid #2a2f35;border-radius:10px}
.rchip{display:inline-flex;flex-direction:column;align-items:center;padding:4px 9px;border:1px solid var(--c);border-radius:8px;color:var(--c);font-weight:700;font-size:13px;line-height:1.25;background:#14181c}
.rchip small{font-weight:400;font-size:11px;color:#8b949e}.rchip.off{opacity:.4;border-style:dashed}.rarrow{color:#566069;font-size:18px;padding:0 2px}
.legend{margin:12px 0 0;font-size:14px;color:#8b949e}.legend b{color:#b8bec5;font-weight:600}
.parthead{margin:6px 0 18px;padding:10px 0 8px;border-bottom:1px solid #2a2f35;color:#83c3ff;font-size:20px;font-weight:700}
.parthead span{display:inline-block;margin-right:12px;padding:2px 10px;border-radius:999px;background:#0d273f;border:1px solid #1c354b;font-size:12px;letter-spacing:.06em;color:#68a9e0;vertical-align:middle}
.step{display:grid;grid-template-columns:350px 1fr;gap:22px;align-items:start}
.card{background:#181a1d;border:1px solid #2a2f35;border-left:4px solid var(--c);border-radius:10px;padding:14px 16px 12px}
.step.async .card,.step.async .win{border-style:dashed}
.head{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.num{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:26px;padding:0 8px;border-radius:13px;border:1px solid var(--c);color:var(--c);font:700 13px "Cascadia Mono",Consolas,monospace;background:#0d1217}
.pill{padding:2px 9px;border-radius:5px;background:color-mix(in srgb,var(--c) 16%,#121314);border:1px solid color-mix(in srgb,var(--c) 55%,#121314);color:var(--c);font-weight:700;font-size:11.5px;letter-spacing:.05em}
.tag{padding:2px 8px;border-radius:5px;border:1px dashed #8b949e;color:#b8bec5;font-size:11px;font-weight:700}
.card h3{margin:10px 0 4px;font-size:17px;line-height:1.35;color:#83c3ff}
.when{margin:0 0 6px;font-size:13px;color:#8b949e}
.card ul{margin:6px 0 2px;padding-left:18px;font-size:14px}.card li{margin:4px 0}
code{font-family:"Cascadia Mono",Consolas,monospace;font-size:12.5px;padding:1px 5px;border-radius:4px;background:#0d1217;border:1px solid #262c33;color:#d7ba7d}
.chips{display:flex;flex-direction:column;gap:5px;margin-top:8px}.chip{padding:4px 9px;border-radius:6px;background:#0d273f;border:1px solid #1c354b;font-size:12.5px;color:#83c3ff}
.wins{display:flex;flex-direction:column;gap:12px;min-width:0}
.win{background:#1e1e1e;border:1px solid #333b44;border-radius:8px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,.35)}
.tabs{display:flex;justify-content:space-between;align-items:center;background:#252526;border-bottom:1px solid #1a1a1a;height:34px}
.tab{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 16px;background:#1e1e1e;border-top:2px solid #007acc;color:#e6e6e6;font:13px "Segoe UI",sans-serif}
.ic{font:700 10.5px "Cascadia Mono",Consolas,monospace;font-style:normal;letter-spacing:-.02em}
.range{padding-right:14px;color:#858585;font:12px "Cascadia Mono",Consolas,monospace}
.crumb{padding:5px 16px;color:#9a9a9a;font:12px "Segoe UI",sans-serif;background:#1e1e1e;border-bottom:1px solid #262626}
.code{padding:8px 0;font:14px/22px "Cascadia Mono","Cascadia Code",Consolas,monospace;color:#d4d4d4}
.ln{display:flex;border-left:3px solid transparent}.ln .n{flex:none;text-align:right;padding:0 16px 0 10px;color:#6e7681;user-select:none}
.ln .t{white-space:pre-wrap;word-break:break-word;padding-right:16px;min-width:0}
.ln.on{background:rgba(255,213,79,.11);border-left-color:#e5c07b}.ln.on .n{color:#c8c8c8}.ln.gap{color:#6e7681}
.kw{color:#569cd6}.cf{color:#c586c0}.str{color:#ce9178}.nm{color:#b5cea8}.com{color:#6a9955;font-style:italic}.fn{color:#dcdcaa}.ty{color:#4ec9b0}.var{color:#9cdcfe}.cst{color:#4fc1ff}
.link{display:flex;align-items:center;gap:12px;margin:2px 0 2px 31px;height:44px}.link .line{width:2px;height:100%;background:linear-gradient(#4a5560,#4a5560);border-radius:1px}
.link .lab{padding:3px 12px;border:1px solid #2f4a63;border-radius:999px;background:#0d1d2d;color:#83c3ff;font-size:13px;font-weight:600}
.tbl{width:100%;border-collapse:collapse;background:#181a1d;border:1px solid #2a2f35;border-radius:8px;overflow:hidden;font-size:13.5px}
.tbl th{background:#0d273f;color:#83c3ff;text-align:left;padding:8px 12px;font-size:12.5px;letter-spacing:.04em}
.tbl td{padding:7px 12px;border-top:1px solid #262c33;vertical-align:top}.tbl td.st{white-space:nowrap;font-weight:700;color:#e5c07b}
.others,.notused{margin-top:34px}.others h3,.notused h3{color:#83c3ff;font-size:19px;margin:0 0 12px}
.nu{display:grid;grid-template-columns:230px 1fr;gap:16px;padding:10px 14px;margin-bottom:8px;border:1px dashed #3a424a;border-radius:8px;background:#15171a}.nu b{color:#8b949e}
`;

const browserPath = process.env.LITMATCH_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const selected = codeFlows.filter((f) => !only || f.id === only);
if (selected.length === 0) throw new Error(`Không có flow ${only}`);

const browser = await chromium.launch({ executablePath: browserPath, headless: true });
try {
  const context = await browser.newContext({ deviceScaleFactor: 1.5, viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  for (const flow of selected) {
    const parts = renderFlow(flow);
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(flow.title)}</title><style>${CSS}</style></head><body>${parts.join('')}</body></html>`;
    const htmlFile = path.join(here, `${flow.id}.html`);
    writeFileSync(htmlFile, html);
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    for (let i = 0; i < parts.length; i += 1) {
      const out = path.join(here, `${flow.id}-${i + 1}.png`);
      await page.locator(`[id="${flow.id}-part-${i + 1}"]`).screenshot({ path: out });
      console.log('wrote', path.relative(repoDir, out));
    }
  }
} finally {
  await browser.close();
}
