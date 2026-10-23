// Sinh code theo TỪNG ENDPOINT (1 endpoint = 1 file, luồng đi liền một mạch từ trên xuống dưới):
//   - code lấy TRỰC TIẾP từ repo theo anchor (bỏ import, comment cũ, decorator Swagger), không sửa dòng nào;
//   - mỗi đoạn có nhãn tầng [CONTROLLER] [SERVICE] [WORKER] [POSTGRES] [REDIS] [KAFKA] [BULLMQ], tô màu ở bản HTML;
//   - comment chỉ trả lời "vì sao" ở chỗ logic khó, chèn ngay cạnh dòng code (inline) hoặc khối ghi đầu hàm (doc);
//   - mỗi endpoint ra 2 file cùng nội dung: <NN-slug>.ts (GitHub tự tô màu code khi xem blob) và <NN-slug>.html (theme GitHub + nhãn tầng tô màu);
//   - mỗi tính năng có thêm index.html (danh sách endpoint) và README.md.
//   node layouts/feature-flows/annotated-source.mjs [--only=03-voice-match] [--shot=<thư mục> --shot-ep=01]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { createProjectIndex } from './project-source-index.mjs';
import { requestPipeline } from './request-pipeline.mjs';
import { generatePresentation } from './presentation-pages.mjs';
import { archTitle } from './arch-pages.mjs';

// Default publication preserves the approved flow bodies; expansion is an explicit authoring mode.
void generatePresentation;

const here = path.dirname(fileURLToPath(import.meta.url));
// Mỗi tính năng khai báo trong 1 file annotated-<tên>.mjs (export annotatedFeatures); tự tìm tất cả các file đó.
const catalogFiles = readdirSync(here)
  .filter((f) => /^annotated-.+\.mjs$/.test(f) && f !== 'annotated-source.mjs')
  .sort();
// Một catalog lỗi cú pháp chỉ bị bỏ qua (kèm cảnh báo), không làm hỏng lần chạy của catalog khác.
const loaded = await Promise.all(
  catalogFiles.map((f) =>
    import(pathToFileURL(path.join(here, f)).href).then(
      (m) => m.annotatedFeatures,
      (e) => {
        console.warn(
          `CẢNH BÁO: bỏ qua ${f}: ${String(e.message).split('\n')[0]}`,
        );
        return [];
      },
    ),
  ),
);
const annotatedFeatures = loaded.flat();
const repoDir = path.resolve(here, '../..');
const outRoot = path.join(here, 'code-10m');
const projectIndex = createProjectIndex(repoDir, {
  extraConfigs: ['apps/signaling-gateway/tsconfig.app.json'],
  extraRoots: ['apps/signaling-gateway/src'],
});
const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const shotDir = args.find((a) => a.startsWith('--shot='))?.slice(7);
const shotEp = args.find((a) => a.startsWith('--shot-ep='))?.slice(10);
const K = ts.SyntaxKind;
const SITE = 'https://ducmanh001.github.io/litmatch-feature-flows';
const REPO = 'https://github.com/ducmanh001/litmatch-feature-flows';

const INTRO_HTML = readFileSync(path.join(here, 'intro-10m.html'), 'utf8');
const INTRO_MD = readFileSync(path.join(here, 'intro-10m.md'), 'utf8');
const esc = (s) =>
  String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

// ---------- nhãn tầng ----------
const TIERS = [
  'CONTROLLER',
  'SERVICE',
  'WORKER',
  'POSTGRES',
  'REDIS',
  'KAFKA',
  'BULLMQ',
  'EXTERNAL',
  'GATEWAY',
];
const TIER_RE = new RegExp(`\\[(${TIERS.join('|')})\\]`, 'g');
const colorTags = (html) =>
  html.replace(
    TIER_RE,
    (m, name) => `<b class="tg tg-${name.toLowerCase()}">${m}</b>`,
  );

// ---------- quét token TypeScript (dùng cho bỏ comment và tô màu) ----------
function scanTokens(text) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    text,
  );
  const toks = [];
  const stack = [];
  for (let k = scanner.scan(); k !== K.EndOfFileToken; k = scanner.scan()) {
    if (k === K.OpenBraceToken) stack.push('b');
    if (k === K.TemplateHead) stack.push('t');
    if (k === K.CloseBraceToken && stack.pop() === 't') {
      k = scanner.reScanTemplateToken(false);
      if (k === K.TemplateMiddle) stack.push('t');
    }
    toks.push({ k, t: scanner.getTokenText() });
  }
  if (toks.map((x) => x.t).join('') !== text)
    throw new Error('scanner không phủ kín văn bản');
  return toks;
}

// ---------- đọc file nguồn: bỏ comment, giữ nguyên số dòng ----------
const sourceCache = new Map();
function loadSource(rel) {
  if (sourceCache.has(rel)) return sourceCache.get(rel);
  const text = readFileSync(path.join(repoDir, rel), 'utf8').replace(
    /\r\n/g,
    '\n',
  );
  const out = [''];
  const hadComment = [false];
  let li = 0;
  for (const { k, t } of scanTokens(text)) {
    const isComment =
      k === K.SingleLineCommentTrivia || k === K.MultiLineCommentTrivia;
    t.split('\n').forEach((piece, i) => {
      if (i > 0) {
        li += 1;
        out[li] = '';
        hadComment[li] = false;
      }
      if (isComment) hadComment[li] = true;
      else out[li] += piece;
    });
  }
  const lines = out.map((l) => l.trimEnd());
  const dropped = lines.map((l, i) => hadComment[i] && l.trim() === '');
  const src = { lines, dropped };
  sourceCache.set(rel, src);
  return src;
}

const SWAGGER = '(?:Api[A-Za-z]+)';
const ARGS = String.raw`\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)`;
const swaggerWholeLine = new RegExp(
  String.raw`^[ \t]*@${SWAGGER}${ARGS}[ \t]*\n`,
  'gm',
);
const swaggerInline = new RegExp(String.raw`@${SWAGGER}${ARGS}[ \t]*`, 'g');
const stripSwagger = (text) =>
  text.replace(swaggerWholeLine, '').replace(swaggerInline, '');

const normRange = (r) => (typeof r === 'string' ? { at: r } : r);

// Mỗi range tìm từ đầu file nên khai báo theo thứ tự đọc mong muốn (không cần theo thứ tự trong file).
function resolveSegments(file, lines, ranges) {
  return ranges.map((r) => {
    const spec = normRange(r);
    let idx = -1;
    let seen = 0;
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].includes(spec.at) && seen++ === (spec.nth ?? 0)) {
        idx = i;
        break;
      }
    }
    if (idx < 0) throw new Error(`${file}: không thấy anchor "${spec.at}"`);
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
      if (end < 0)
        throw new Error(
          `${file}: không thấy điểm kết thúc "${spec.to}" sau "${spec.at}"`,
        );
    }
    const [before, after] = spec.pad ?? [0, 0];
    return [Math.max(0, idx - before), Math.min(lines.length - 1, end + after)];
  });
}

// ---------- comment ----------
function wrapText(text, prefix, hangPrefix, width = 88) {
  const out = [];
  let cur = '';
  let limit = width - prefix.length;
  const bullet = /^(\d+\.|-)\s/.exec(text);
  const extra = bullet ? ' '.repeat(bullet[0].length) : '';
  for (const w of text.normalize('NFC').split(' ')) {
    if (cur && `${cur} ${w}`.length > limit) {
      out.push(cur);
      cur = extra + w;
      limit = width - hangPrefix.length;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  return out.map((l, i) => (i === 0 ? prefix : hangPrefix) + l);
}

const LABELS = /^(In|Out|Lỗi|Lưu ý):\s*/;
const LABEL_WIDTH = 7;

// Khối ghi đầu hàm (chỉ dùng cho tính năng cũ): mục đầu là mô tả, "In:", "Out:", "Lỗi:", "Lưu ý:" được căn cột.
function docBlock(entries, indent) {
  const pad = ' '.repeat(indent);
  if (entries.length === 1) {
    const one = `${pad}/** ${entries[0]} */`;
    if (one.length <= 88) return [one];
  }
  const out = [`${pad}/**`];
  for (const raw of entries) {
    if (raw === '') {
      out.push(`${pad} *`);
      continue;
    }
    const m = LABELS.exec(raw);
    const text = m
      ? `${m[1]}:`.padEnd(LABEL_WIDTH) + raw.slice(m[0].length)
      : raw;
    out.push(
      ...wrapText(
        text,
        `${pad} * `,
        `${pad} * ${m ? ' '.repeat(LABEL_WIDTH) : ''}`,
      ),
    );
  }
  out.push(`${pad} */`);
  return out;
}

const isCommentLine = (l) =>
  ['//', '/*', '*'].some((p) => l.trim().startsWith(p));

// Ghép các đoạn của 1 item thành các dòng code; chèn comment inline (trả lời "vì sao") trước dòng chứa `at`.
function extract({ file, ranges, dedent = false, close = false, inline = [] }) {
  const src = loadSource(file);
  const specs = ranges.map(normRange);
  const segs = resolveSegments(file, src.lines, ranges);
  const chunks = segs.map(([a, b], i) => {
    const raw = src.lines
      .slice(a, b + 1)
      .filter((_, k) => !src.dropped[a + k])
      .join('\n');
    const lines = stripSwagger(raw).split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines.at(-1).trim()) lines.pop();
    if (specs[i].doc) {
      const first = lines.find((l) => l.trim()) ?? '';
      lines.unshift(...docBlock(specs[i].doc, first.match(/^ */)[0].length));
    }
    return lines;
  });
  let out = [];
  chunks.forEach((lines, i) => {
    if (i > 0 && segs[i][0] !== segs[i - 1][1] + 1) {
      if ((specs[i].gap ?? 'blank') === 'tight') {
        const first = lines.find((l) => l.trim()) ?? '';
        const indent =
          specs[i].markerIndent ??
          first.match(/^ */)[0].length + (first.trim().startsWith(')') ? 2 : 0);
        out.push(`${' '.repeat(indent)}// ${specs[i].markerText ?? '…'}`);
      } else out.push('');
    }
    out.push(...lines);
  });
  if (close) out.push('}');
  out = out.filter(
    (l, i) => !(l.trim() === '' && (i === 0 || out[i - 1].trim() === '')),
  );
  while (out.length && out.at(-1).trim() === '') out.pop();
  if (dedent) {
    const cut = Math.min(
      ...out.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length),
    );
    out = out.map((l) => l.slice(Math.min(cut, l.length)));
  }
  let from = 0;
  for (const ins of inline) {
    let idx = -1;
    let seen = 0;
    for (let i = from; i < out.length; i += 1) {
      if (
        !isCommentLine(out[i]) &&
        out[i].includes(ins.at) &&
        seen++ === (ins.nth ?? 0)
      ) {
        idx = i;
        break;
      }
    }
    if (idx < 0)
      throw new Error(`${file}: không thấy anchor chú thích "${ins.at}"`);
    const pad = ' '.repeat(out[idx].match(/^ */)[0].length);
    const added = ins.text.flatMap((t) =>
      wrapText(t, `${pad}// `, `${pad}// `),
    );
    out.splice(idx, 0, ...added);
    from = idx + added.length + 1;
  }
  return { lines: out, spans: segs.map(([a, b]) => [a + 1, b + 1]) };
}

// ---------- chế độ "luồng liền mạch": cắt theo CÂU LỆNH, không có khai báo hàm, mỗi đoạn là 1 dải nhãn tầng ----------
// Mỗi range có thể có `file` riêng (đoạn Redis lấy dòng từ provider, adapter...), `fn` (tên hàm gốc, chỉ để ghi nguồn),
// `dedent` (mặc định true: mỗi range tự bỏ thụt lề chung của chính nó), `gap` ('blank' mặc định, 'none' = nối liền).
// `syn` (tuỳ chọn): mảng song song với `out`, đánh dấu dòng do công cụ thêm (phép gán tham số); chèn comment thì chèn 0 vào đó.
// `shared` (tuỳ chọn, Set): chế độ lồng nhau, mỗi comment chỉ chèn 1 lần ở khối đầu tiên có anchor; anchor không có ở khối này thì bỏ qua.
function applyInline(out, inline, label, syn, shared) {
  let from = 0;
  for (const ins of inline) {
    if (shared?.has(ins)) continue;
    let idx = -1;
    let seen = 0;
    for (let i = from; i < out.length; i += 1) {
      if (
        !isCommentLine(out[i]) &&
        out[i].includes(ins.at) &&
        seen++ === (ins.nth ?? 0)
      ) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      if (shared) continue;
      throw new Error(`${label}: không thấy anchor chú thích "${ins.at}"`);
    }
    shared?.add(ins);
    const pad = ' '.repeat(out[idx].match(/^ */)[0].length);
    // lồng nhau: mỗi đoạn comment là 1 dòng dài kết thúc bằng \u0001, được ngắt dòng lúc xuất theo thụt lề thật (emitNode)
    const added = shared
      ? ins.text.map((t) => `${pad}// ${t}\u0001`)
      : ins.text.flatMap((t) => wrapText(t, `${pad}// `, `${pad}// `));
    out.splice(idx, 0, ...added);
    syn?.splice(idx, 0, ...added.map(() => 0));
    from = idx + added.length + 1;
  }
}

function extractBand(item) {
  const specs = item.ranges
    .map(normRange)
    .map((r) => ({ ...r, file: r.file ?? item.file }));
  const chunks = specs.map((spec) => {
    const src = loadSource(spec.file);
    const [a, b] = resolveSegments(spec.file, src.lines, [spec])[0];
    const raw = src.lines
      .slice(a, b + 1)
      .filter((_, k) => !src.dropped[a + k])
      .join('\n');
    let lines = stripSwagger(raw).split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines.at(-1).trim()) lines.pop();
    if (spec.dedent !== false) {
      const cut = Math.min(
        ...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length),
      );
      lines = lines.map((l) => l.slice(Math.min(cut, l.length)));
    }
    return { spec, lines, a, b };
  });
  let out = [];
  chunks.forEach((c, i) => {
    if (i > 0 && (c.spec.gap ?? 'blank') === 'blank') out.push('');
    out.push(...c.lines);
  });
  out = out.filter(
    (l, i) => !(l.trim() === '' && (i === 0 || out[i - 1].trim() === '')),
  );
  while (out.length && out.at(-1).trim() === '') out.pop();
  applyInline(
    out,
    item.inline ?? [],
    `${item.tag} ${item.name ?? item.title ?? ''}`,
  );
  // ghi nguồn: gom theo file, trong file gom theo tên hàm gốc, theo thứ tự xuất hiện
  const groups = [];
  for (const c of chunks) {
    let g = groups.find((x) => x.file === c.spec.file);
    if (!g) {
      g = { file: c.spec.file, parts: [] };
      groups.push(g);
    }
    let p = g.parts.find((x) => x.fn === c.spec.fn);
    if (!p) {
      p = { fn: c.spec.fn, spans: [] };
      g.parts.push(p);
    }
    p.spans.push([c.a + 1, c.b + 1]);
  }
  return { lines: out, groups };
}

// ---------- hop "thân hàm": KHÔNG chép class/khai báo/chữ ký của hàm được gọi ----------
// node = { tag, name, title, file, fn: <anchor dòng khai báo hàm>, helpers, inline, children }.
// Chỉ chép nguyên văn THÂN hàm (giữa cặp ngoặc của hàm). Để biến có nguồn gốc rõ ràng, đầu khối có phép gán tham số
// `const <tham số> = <biểu thức ở chỗ gọi>;` (dòng do công cụ thêm, suy ra bằng AST từ chỗ gọi + chữ ký hàm; bản HTML ghi
// chú "← tham số"). `helpers`: các hàm phụ chỉ có 1 câu `return <biểu thức>` (vd ticketScore) được thay thẳng vào giá trị.
const astCache = new Map();
function parseSource(rel) {
  if (!astCache.has(rel)) {
    const text = readFileSync(path.join(repoDir, rel), 'utf8').replace(
      /\r\n/g,
      '\n',
    );
    astCache.set(
      rel,
      ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true),
    );
  }
  return astCache.get(rel);
}
const parseSnippet = (text) =>
  ts.createSourceFile('snippet.ts', text, ts.ScriptTarget.Latest, true);
const oneLine = (s) => s.replace(/\s*\n\s*/g, ' ').trim();
const SIMPLE_KINDS = new Set([
  K.Identifier,
  K.PropertyAccessExpression,
  K.ElementAccessExpression,
  K.CallExpression,
  K.StringLiteral,
  K.NumericLiteral,
  K.NoSubstitutionTemplateLiteral,
  K.TemplateExpression,
  K.ThisKeyword,
  K.ParenthesizedExpression,
  K.NewExpression,
  K.TrueKeyword,
  K.FalseKeyword,
  K.NullKeyword,
]);
function isSimpleExpr(text) {
  const sf = parseSnippet(`const __v = ${text};`);
  return SIMPLE_KINDS.has(
    sf.statements[0].declarationList.declarations[0].initializer.kind,
  );
}
// vị trí mà biểu thức bất kỳ đặt vào cũng không cần thêm ngoặc
function freePosition(n) {
  const p = n.parent;
  if (ts.isCallExpression(p)) return p.expression !== n;
  return [
    ts.isVariableDeclaration,
    ts.isReturnStatement,
    ts.isTemplateSpan,
    ts.isParenthesizedExpression,
    ts.isPropertyAssignment,
    ts.isArrayLiteralExpression,
  ].some((f) => f(p));
}

const helperCache = new Map();
function helperReturn({ file, name }) {
  const key = `${file}#${name}`;
  if (helperCache.has(key)) return helperCache.get(key);
  const sf = parseSource(file);
  let fn = null;
  const visit = (n) => {
    if (fn) return;
    if (
      (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) &&
      n.name?.text === name &&
      n.body
    ) {
      fn = n;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!fn) throw new Error(`${file}: không thấy hàm phụ ${name}`);
  const st = fn.body.statements;
  if (st.length !== 1 || !ts.isReturnStatement(st[0]) || !st[0].expression)
    throw new Error(`${file}: hàm phụ ${name} phải chỉ có 1 câu return`);
  let expr = st[0].expression;
  while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
  const h = { sf, expr, params: fn.parameters.map((p) => p.name.getText(sf)) };
  helperCache.set(key, h);
  return h;
}

// thay tham số của hàm phụ bằng biểu thức truyền vào (theo AST, không thay chữ mù quáng)
function substituteParams(h, args) {
  const map = new Map(h.params.map((p, i) => [p, args[i]]));
  const base = h.expr.getStart(h.sf);
  const edits = [];
  const visit = (n) => {
    if (ts.isIdentifier(n) && map.get(n.text) !== undefined) {
      const p = n.parent;
      const isName =
        (ts.isPropertyAccessExpression(p) && p.name === n) ||
        (ts.isPropertyAssignment(p) && p.name === n);
      if (!isName) {
        const arg = map.get(n.text);
        const text = ts.isShorthandPropertyAssignment(p)
          ? `${n.text}: ${arg}`
          : isSimpleExpr(arg) || freePosition(n)
            ? arg
            : `(${arg})`;
        edits.push([n.getStart(h.sf) - base, n.getEnd() - base, text]);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(h.expr);
  let out = h.expr.getText(h.sf);
  for (const [a, b, t] of edits.sort((x, y) => y[0] - x[0]))
    out = out.slice(0, a) + t + out.slice(b);
  return oneLine(out);
}

function inlineHelpers(text, helpers) {
  if (!helpers.length) return text;
  const byName = new Map(helpers.map((h) => [h.name, h]));
  const prefix = 'const __v = ';
  for (let pass = 0; pass < 12; pass += 1) {
    const sf = parseSnippet(`${prefix}${text};`);
    let hit = null;
    const visit = (n) => {
      if (hit) return;
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        byName.has(n.expression.text)
      ) {
        hit = n;
        return;
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    if (!hit) return text;
    const h = helperReturn(byName.get(hit.expression.text));
    let sub = substituteParams(
      h,
      hit.arguments.map((a) => oneLine(a.getText(sf))),
    );
    if (!freePosition(hit) && !isSimpleExpr(sub)) sub = `(${sub})`;
    text =
      text.slice(0, hit.getStart(sf) - prefix.length) +
      sub +
      text.slice(hit.getEnd() - prefix.length);
  }
  throw new Error(`inlineHelpers: lồng quá sâu: ${text}`);
}

// `const tên = giá trị;` (xuống dòng kiểu prettier nếu quá dài)
function wrapDecl(name, rhs, width = 86) {
  if (rhs.includes('\n')) {
    // đối số nhiều dòng (object, callback…): giữ nguyên bố cục, `const tên = {` … `};`
    const ls = rhs.split('\n');
    ls[0] = `const ${name} = ${ls[0]}`;
    ls[ls.length - 1] += ';';
    return ls;
  }
  const one = `const ${name} = ${rhs};`;
  if (one.length <= width) return [one];
  const init = parseSnippet(`const __v = ${rhs};`).statements[0].declarationList
    .declarations[0].initializer;
  const sf = init.getSourceFile();
  if (ts.isCallExpression(init) && init.arguments.length) {
    return [
      `const ${name} = ${init.expression.getText(sf)}(`,
      ...init.arguments.map((a) => `  ${oneLine(a.getText(sf))},`),
      ');',
    ];
  }
  return [`const ${name} =`, `  ${rhs};`];
}

// ---------- LUỒNG LỒNG NHAU TỰ ĐỘNG: dựng cây từ `items` theo QUAN HỆ GỌI HÀM ----------
// Endpoint khai `nested: true` (+ `items`; `steps` và `skip` tuỳ chọn):
//  - hàm điểm vào (controller…) giữ class + chữ ký; hàm được gọi chỉ chép THÂN hàm, thụt vào ngay dưới câu lệnh gọi nó;
//  - tham số của hàm được gọi: `const tham_số = <biểu thức ở chỗ gọi>;` (suy ra bằng AST); hàm phụ chỉ có 1 câu return
//    được gọi ngay trong đối số thì thay thẳng vào giá trị;
//  - constructor chỉ gồm dependency được dùng (`this.xxx`), gom ở đầu khối hop đầu tiên dưới điểm vào, kèm dependency của
//    mọi hop lồng bên dưới (mỗi class một nhóm, có dòng `// TênClass`);
//  - hàm không ai gọi (worker, cron…) thành điểm vào riêng; đoạn rời (SQL migration, entity) xếp ở cuối;
//  - `steps`: [{ at, text, in?, nth? }] đánh số bước theo thứ tự chạy; `skip`: [tên hàm] hàm cơ bản không bung (giữ dòng gọi).
const lineOfPos = (sf, pos) => sf.getLineAndCharacterOfPosition(pos).line;
const leading = (l) => l.match(/^ */)[0].length;

// khai báo hàm (method / function / const = arrow|function có thân khối) mà dòng `line` nằm trong phần đầu (decorator … tên)
function findFnLike(sf, line) {
  let found = null;
  const consider = (node, nameNode, fn, name) => {
    const start = lineOfPos(sf, node.getStart(sf));
    const nameLine = lineOfPos(sf, nameNode.getStart(sf));
    if (start <= line && line <= nameLine)
      found = {
        node,
        fn,
        name,
        start,
        nameLine,
        end: lineOfPos(sf, node.getEnd()),
      };
  };
  const visit = (n) => {
    if (found) return;
    if (
      (ts.isMethodDeclaration(n) || ts.isFunctionDeclaration(n)) &&
      n.name &&
      n.body
    )
      consider(n, n.name, n, n.name.getText(sf));
    else if (
      ts.isVariableStatement(n) &&
      n.declarationList.declarations.length === 1
    ) {
      const d = n.declarationList.declarations[0];
      const init = d.initializer;
      if (
        ts.isIdentifier(d.name) &&
        init &&
        (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) &&
        ts.isBlock(init.body)
      )
        consider(n, d.name, init, d.name.text);
    } else if (
      // thuộc tính class là arrow function (`private readonly onFlush = (...) => { ... };`): handler gắn vào sự kiện
      ts.isPropertyDeclaration(n) &&
      ts.isClassLike(n.parent) &&
      n.initializer &&
      (ts.isArrowFunction(n.initializer) ||
        ts.isFunctionExpression(n.initializer)) &&
      ts.isBlock(n.initializer.body)
    )
      consider(n, n.name, n.initializer, n.name.getText(sf));
    if (!found) ts.forEachChild(n, visit);
  };
  visit(sf);
  if (found) {
    const owner = ts.isMethodDeclaration(found.fn)
      ? found.fn.parent
      : ts.isPropertyDeclaration(found.node)
        ? found.node.parent
        : null;
    found.cls = owner && ts.isClassLike(owner) ? owner : null;
    found.className = found.cls?.name?.text ?? null;
  }
  return found;
}

function isSingleReturn(fn) {
  const st = fn.body.statements;
  if (st.length !== 1 || !ts.isReturnStatement(st[0]) || !st[0].expression)
    return false;
  let awaits = false;
  const visit = (n) => {
    if (ts.isAwaitExpression(n)) awaits = true;
    ts.forEachChild(n, visit);
  };
  visit(st[0].expression);
  return !awaits;
}

// mỗi range của `items` là 1 hàm nguyên vẹn (node 'fn') hoặc đoạn rời như SQL migration (node 'frag', gom theo item)
function classifyItems(ep) {
  const nodes = [];
  for (const item of ep.items) {
    const frag = { kind: 'frag', item, tag: item.tag, ranges: [] };
    for (const r of item.ranges.map(normRange)) {
      const file = r.file ?? item.file;
      const [a, b] = resolveSegments(file, loadSource(file).lines, [r])[0];
      const f = findFnLike(parseSource(file), a);
      if (!f) {
        frag.ranges.push({ ...r, file });
        continue;
      }
      if (b !== f.end)
        throw new Error(
          `${file}: range "${r.at}" (L${a + 1}–${b + 1}) không phải nguyên hàm ${f.name} (L${f.start + 1}–${f.end + 1})`,
        );
      nodes.push({
        kind: 'fn',
        item,
        tag: item.tag,
        file,
        f,
        name: f.name,
        className: f.className,
        helpers: [],
        pure: !f.cls && ts.isFunctionDeclaration(f.fn) && isSingleReturn(f.fn),
      });
    }
    if (frag.ranges.length) nodes.push(frag);
  }
  return nodes;
}

// các phần của 1 hàm: thân (đã bỏ thụt lề chung), toàn bộ hàm kèm decorator + chữ ký, phần đầu class
function fnParts(node) {
  const src = loadSource(node.file);
  const sf = parseSource(node.file);
  const { f } = node;
  const keep = (a, b) =>
    src.lines.slice(a, b + 1).filter((_, k) => !src.dropped[a + k]);
  const open = lineOfPos(sf, f.fn.body.getStart(sf));
  const close = lineOfPos(sf, f.fn.body.getEnd() - 1);
  if (
    !ts.isBlock(f.fn.body) ||
    close <= open ||
    !src.lines[open].trimEnd().endsWith('{') ||
    src.lines[close].trim() !== '}'
  ) {
    const body = f.fn.body;
    const raw = ts.isBlock(body)
      ? body.getText(sf).slice(1, -1).trim()
      : body.getText(sf);
    const clean = scanTokens(raw)
      .filter(
        ({ k }) =>
          k !== K.SingleLineCommentTrivia && k !== K.MultiLineCommentTrivia,
      )
      .map(({ t }) => t)
      .join('');
    const inner = (ts.isBlock(body) ? clean : `return ${clean};`).split('\n');
    return {
      sf,
      f,
      inner,
      whole: stripSwagger(f.node.getText(sf)).split('\n'),
      classHead: [],
      classSpan: null,
      syntheticBody: !ts.isBlock(body),
    };
  }
  let inner = stripSwagger(keep(open + 1, close - 1).join('\n')).split('\n');
  while (inner.length && !inner[0].trim()) inner.shift();
  while (inner.length && !inner.at(-1).trim()) inner.pop();
  const cut = Math.min(...inner.filter((l) => l.trim()).map(leading));
  inner = inner.map((l) => l.slice(Math.min(cut, l.length)));
  const whole = stripSwagger(keep(f.start, f.end).join('\n')).split('\n');
  let classHead = [];
  let classSpan = null;
  if (f.cls) {
    const brace = f.cls
      .getChildren(sf)
      .find((c) => c.kind === K.OpenBraceToken);
    const a = lineOfPos(sf, f.cls.getStart(sf));
    const b = lineOfPos(sf, brace.getStart(sf));
    classHead = stripSwagger(keep(a, b).join('\n')).split('\n');
    let first = a;
    while (first < b && /^\s*@Api[A-Za-z]+\(.*\)\s*$/.test(src.lines[first]))
      first += 1; // decorator Swagger không hiển thị
    classSpan = [first + 1, b + 1];
  }
  return { sf, f, inner, whole, classHead, classSpan };
}

// constructor của class: các tham số inject (private readonly …) và thuộc tính khai báo sẵn (vd logger), mỗi cái kèm dòng nguyên văn
const ctorCache = new Map();
const baseType = (t) =>
  (t ?? '')
    .replace(/<[\s\S]*$/, '')
    .replace(/\[\]$/, '')
    .trim();
function ctorInfo(file, cls) {
  const key = `${file}#${cls.name?.text}`;
  if (ctorCache.has(key)) return ctorCache.get(key);
  const sf = parseSource(file);
  const src = loadSource(file);
  const keep = (a, b) =>
    src.lines.slice(a, b + 1).filter((_, k) => !src.dropped[a + k]);
  const ctor = cls.members.find((m) => ts.isConstructorDeclaration(m));
  const first = ctor ?? cls.members[0];
  const info = {
    file,
    ctor,
    className: cls.name?.text ?? '',
    heritage: (cls.heritageClauses ?? []).flatMap((h) =>
      h.types.map((t) => t.expression.getText(sf)),
    ),
    indent: first ? leading(src.lines[lineOfPos(sf, first.getStart(sf))]) : 2,
    fields: cls.members
      .filter(
        (m) =>
          ts.isPropertyDeclaration(m) &&
          !(ts.getCombinedModifierFlags(m) & ts.ModifierFlags.Static),
      )
      .map((m) => ({
        name: m.name.getText(sf),
        lines: keep(lineOfPos(sf, m.getStart(sf)), lineOfPos(sf, m.getEnd())),
      })),
    props: [],
    body: [],
  };
  if (ctor) {
    const cs = lineOfPos(sf, ctor.getStart(sf));
    const ce = lineOfPos(sf, ctor.getEnd());
    const single = cs === ce;
    const spans = ctor.parameters.map((p) => [
      lineOfPos(sf, p.getStart(sf)),
      lineOfPos(sf, p.getEnd()),
    ]);
    const shared = spans.some(([a], i) => i > 0 && a <= spans[i - 1][1]);
    Object.assign(info, {
      body:
        ctor.body && ctor.body.statements.length
          ? keep(
              lineOfPos(sf, ctor.body.getStart(sf)) + 1,
              lineOfPos(sf, ctor.body.getEnd() - 1) - 1,
            )
          : [],
      single,
      singleLine: single ? keep(cs, ce)[0] : null,
      head: src.lines[cs],
      tail: src.lines[ce],
      span: [cs + 1, ce + 1],
      props: ctor.parameters
        .map((p, i) => ({ p, i }))
        .map(({ p, i }) => ({
          name: p.name.getText(sf),
          text: p.getText(sf),
          type: baseType(p.type?.getText(sf)),
          lines:
            single || shared || spans[i][0] === cs
              ? null
              : keep(spans[i][0], spans[i][1]),
        })),
    });
  }
  ctorCache.set(key, info);
  return info;
}

const usedThis = (lines) =>
  new Set(
    [
      ...lines
        .filter((l) => !isCommentLine(l))
        .join('\n')
        .matchAll(/\bthis\.([A-Za-z_$][\w$]*)/g),
    ].map((m) => m[1]),
  );

// mọi lời gọi hàm trong đoạn code: tên, người nhận (this.<field>.hàm → field; this.hàm → '@this'; hàm tự do → '@fn'), đối số,
// dòng đầu/dòng cuối của CÂU LỆNH chứa nó, và các lời gọi khác mà nó nằm trong ĐỐI SỐ của chúng
function findCalls(lines, syn, isEntry) {
  // dòng comment (chú thích "vì sao", Step) và dòng do công cụ thêm bị xoá khỏi bản phân tích: không lọt vào đối số, số dòng giữ nguyên
  const masked = lines.map((l, i) => (syn[i] || isCommentLine(l) ? '' : l));
  const sf = parseSnippet(
    isEntry
      ? masked.join('\n')
      : `async function __f(){\n${masked.join('\n')}\n}`,
  );
  const off = isEntry ? 0 : 1;
  const srcLines = sf.text.split('\n');
  // đối số giữ nguyên xuống dòng, thụt lề tính từ dòng chứa đầu đối số, bỏ dòng trống do comment bị xoá
  const argText = (a) => {
    const indent0 = leading(srcLines[lineOfPos(sf, a.getStart(sf))]);
    return a
      .getText(sf)
      .split('\n')
      .filter((l, i) => i === 0 || l.trim())
      .map((l, i) => (i === 0 ? l : l.slice(Math.min(indent0, leading(l)))))
      .join('\n');
  };
  const nameOf = (c) => {
    const e = c.expression;
    return ts.isPropertyAccessExpression(e)
      ? e.name.text
      : ts.isIdentifier(e)
        ? e.text
        : null;
  };
  const recvOf = (c) => {
    const e = c.expression;
    if (ts.isIdentifier(e)) return '@fn';
    if (!ts.isPropertyAccessExpression(e)) return null;
    const o = e.expression;
    if (o.kind === K.ThisKeyword) return '@this';
    if (ts.isPropertyAccessExpression(o) && o.expression.kind === K.ThisKeyword)
      return o.name.text;
    return null;
  };
  const simpleStmt = (p) =>
    ts.isExpressionStatement(p) ||
    ts.isVariableStatement(p) ||
    ts.isReturnStatement(p) ||
    ts.isThrowStatement(p);
  const calls = [];
  const visit = (n) => {
    const name = ts.isCallExpression(n) ? nameOf(n) : null;
    if (name) {
      let stmt = null;
      let before = false;
      let condEnd = null;
      for (let p = n.parent, prev = n; p; prev = p, p = p.parent) {
        if (simpleStmt(p)) {
          stmt = p;
          break;
        }
        // lời gọi nằm trong ĐIỀU KIỆN / phần đầu của if, while, for, switch: khối lồng đặt NGAY TRƯỚC câu lệnh đó
        // (hàm được tính trước, rồi if dùng kết quả); riêng `else if` thì đặt ngay sau dòng kết thúc điều kiện
        const header =
          ((ts.isIfStatement(p) ||
            ts.isWhileStatement(p) ||
            ts.isSwitchStatement(p) ||
            ts.isForOfStatement(p) ||
            ts.isForInStatement(p)) &&
            p.expression === prev) ||
          (ts.isForStatement(p) && prev !== p.statement);
        if (header) {
          const elseIf =
            ts.isIfStatement(p) &&
            ts.isIfStatement(p.parent) &&
            p.parent.elseStatement === p;
          if (elseIf) condEnd = lineOfPos(sf, p.expression.getEnd()) - off;
          else {
            stmt = p;
            before = true;
          }
          break;
        }
        if (ts.isBlock(p) || ts.isSourceFile(p)) break;
      }
      const inArgsOf = [];
      for (
        let a = n.parent, child = n;
        a && !ts.isBlock(a);
        child = a, a = a.parent
      ) {
        if (ts.isCallExpression(a) && a.arguments.includes(child) && nameOf(a))
          inArgsOf.push(nameOf(a));
      }
      calls.push({
        name,
        expression: n.expression.getText(sf).replace(/\s+/g, ''),
        recv: recvOf(n),
        pos: n.getStart(sf),
        before,
        startLine: lineOfPos(sf, (stmt ?? n).getStart(sf)) - off,
        endLine: before
          ? lineOfPos(sf, stmt.getStart(sf)) - off - 1
          : (condEnd ?? lineOfPos(sf, (stmt ?? n).getEnd()) - off),
        args: n.arguments.map(argText),
        inArgsOf,
      });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return calls;
}

// tên các hàm được gọi trong thân của node (để biết hàm nào là gốc của đồ thị gọi còn lại)
function calledNames(node) {
  if (!node.called) {
    const inner = fnParts(node).inner;
    node.called = new Set(
      findCalls(
        inner,
        inner.map(() => 0),
        false,
      ).map((c) => c.name),
    );
  }
  return node.called;
}

const nodeKey = (node) =>
  `${node.className ? `${node.className}.` : ''}${node.name}`;
const nodeLabel = (node) =>
  `${node.className ? `${node.className}.` : ''}${node.name}${node.item.title ? `: ${node.item.title}` : ''}`;

// `steps` cấp endpoint: mỗi step chèn vào dòng đầu tiên (theo thứ tự dựng) chứa `at`; số thứ tự gán sau theo thứ tự trong file
function applyGlobalSteps(ctx, label, lines, syn) {
  const found = [];
  for (const st of ctx.steps) {
    if (ctx.stepsApplied.has(st) || (st.in && !label.includes(st.in))) continue;
    let idx = -1;
    let seen = 0;
    for (let i = 0; i < lines.length; i += 1) {
      if (
        !isCommentLine(lines[i]) &&
        lines[i].includes(st.at) &&
        seen++ === (st.nth ?? 0)
      ) {
        idx = i;
        break;
      }
    }
    if (idx < 0) continue;
    ctx.stepsApplied.add(st);
    found.push([idx, st]);
  }
  for (const [idx, st] of found.sort((a, b) => b[0] - a[0])) {
    const pad = ' '.repeat(leading(lines[idx]));
    const added = [`${pad}// Step #: ${st.text}\u0001`];
    lines.splice(idx, 0, ...added);
    syn.splice(idx, 0, ...added.map(() => 0));
  }
}

// tên biến khai báo trong đoạn code (const/let/var, kể cả destructuring)
function declaredNames(lines) {
  const out = new Set();
  const text = lines.filter((l) => !isCommentLine(l)).join('\n');
  for (const m of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g))
    out.add(m[1]);
  for (const m of text.matchAll(/\b(?:const|let|var)\s*[{[]([^}\]=]*)[}\]]/g)) {
    for (const part of m[1].split(',')) {
      const id = part.split(':').pop().split('=')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(id)) out.add(id);
    }
  }
  return out;
}

// phép gán tham số của hàm được gọi: `const tên = biểu thức đối số ở chỗ gọi;`
function bindingLines(parts, node, call, declared) {
  const out = [];
  parts.f.fn.parameters.forEach((p, i) => {
    const name = p.name.getText(parts.sf);
    let rhs = p.dotDotDotToken
      ? `[${call.args.slice(i).join(', ')}]`
      : call.args[i];
    if (rhs === undefined) rhs = p.initializer?.getText(parts.sf);
    if (rhs === undefined || rhs === name) return;
    rhs = inlineHelpers(rhs, node.helpers);
    // đối số rất dài (object, callback…) đã nằm ngay ở lời gọi phía trên: không chép lại, chỉ ghi nó là đối số thứ mấy
    if (rhs.split('\n').length > 8) {
      out.push([`// ${name} = đối số ${i + 1} của lời gọi ở trên\u0001`]);
      return;
    }
    // giá trị tham chiếu chính tên tham số (vd data → data as T): const tên = tên … sẽ sai phạm vi, nên ghi bằng comment
    const free = new RegExp(
      `(^|[^.\\w$])${name.replace(/\$/g, '\\$')}(?![\\w$])`,
    );
    if (/^[A-Za-z_$][\w$]*$/.test(name) && free.test(rhs)) {
      out.push([`// ${name} = ${oneLine(rhs)}\u0001`]);
      return;
    }
    // hàm được gọi chép ngang cấp với dòng gọi (không thụt thêm) nên cùng 1 phạm vi: tên đã khai báo ở điểm vào hoặc hop trước
    // thì không khai lại bằng const, ghi giá trị bằng comment
    if (declared.has(name)) {
      out.push([`// ${name} = ${oneLine(rhs)}\u0001`]);
      return;
    }
    out.push(wrapDecl(name, rhs));
  });
  return out;
}

function resolveFn(node, ctx, call, isEntry) {
  const parts = fnParts(node);
  const { f } = parts;
  const label = nodeLabel(node);
  let lines;
  let syn;
  let headLen = 0;
  if (isEntry) {
    if (f.cls) {
      lines = [...parts.classHead, ...parts.whole, '}'];
      headLen = parts.classHead.length;
    } else {
      const cut = Math.min(...parts.whole.filter((l) => l.trim()).map(leading));
      lines = parts.whole.map((l) => l.slice(Math.min(cut, l.length)));
    }
    syn = lines.map(() => 0);
  } else {
    const binds = bindingLines(parts, node, call, ctx.declared);
    lines = [...binds.flat(), ...parts.inner];
    syn = [
      ...binds.flatMap((b) => b.map((_, i) => (i === 0 ? 1 : 2))),
      ...parts.inner.map(() => (parts.syntheticBody ? 2 : 0)),
    ];
  }
  applyGlobalSteps(ctx, label, lines, syn);
  applyInline(lines, node.item.inline ?? [], label, syn, ctx.inlineApplied);
  if (isEntry)
    for (const p of f.fn.parameters) ctx.declared.add(p.name.getText(parts.sf));
  for (const n of declaredNames(lines)) ctx.declared.add(n);
  const r = {
    kind: 'fn',
    tag: node.tag,
    label,
    className: f.className,
    lines,
    syn,
    headLen,
    isEntry,
    children: [],
    deps: f.cls
      ? { file: node.file, cls: f.cls, names: usedThis(lines) }
      : null,
    groups: [
      ...(isEntry && parts.classSpan
        ? [{ file: node.file, spans: [parts.classSpan] }]
        : []),
      { file: node.file, spans: [[f.start + 1, f.end + 1]] },
    ],
  };
  r.node = node;
  ctx.sources.add(node.file);
  claimChildren(r, ctx);
  return r;
}

// kiểu khai báo của tham số inject `name` trong class của khối `r`: để biết `this.name.hàm()` gọi sang class nào
function fieldType(r, name) {
  return r.deps
    ? ctorInfo(r.deps.file, r.deps.cls).props.find((p) => p.name === name)
        ?.type || null
    : null;
}

// lời gọi `call` trong khối `r` có thể là gọi tới hàm P không? So kiểu người nhận (class, hoặc port mà class implements/extends);
// chưa biết kiểu thì coi như hợp lệ (chỉ so tên)
function receiverOk(r, call, P) {
  const pcls = P.f.cls ? P.className : null;
  if (call.recv === '@fn') return !pcls;
  if (call.recv === '@this')
    return (
      !!pcls &&
      (pcls === r.className ||
        (!!r.deps && ctorInfo(r.deps.file, r.deps.cls).heritage.includes(pcls)))
    );
  const t = call.recv ? fieldType(r, call.recv) : null;
  if (!t) return true;
  return (
    !!pcls && (pcls === t || ctorInfo(P.file, P.f.cls).heritage.includes(t))
  );
}

// hàm nào còn chờ mà được gọi trong thân `r` thì thành con của `r`, đặt ngay sau câu lệnh gọi
const identityOf = (n) => `${n.file}#${n.className ?? ''}.${n.name}`;
const tagOf = (file) =>
  /worker/.test(file)
    ? 'WORKER'
    : /redis|queue/.test(file)
      ? 'REDIS'
      : /kafka/.test(file)
        ? 'KAFKA'
        : /livekit|iap|provider/.test(file)
          ? 'EXTERNAL'
          : 'SERVICE';

function claimChildren(r, ctx) {
  const originals = r.node
    ? projectIndex.calls(r.node)
    : projectIndex.callsIn(r.sourceFile, ...r.sourceRange);
  for (const original of originals)
    for (const target of original.targets) ctx.expected.add(identityOf(target));
  const calls = findCalls(r.lines, r.syn, r.isEntry);
  const nodeFor = (target) => {
    const id = identityOf(target);
    return ctx.catalog.get(id) ?? null;
  };
  // Keep substitution of single-return free helpers used in another project's call arguments.
  for (const c of calls.filter((x) => x.inArgsOf.length)) {
    for (const target of originals.find((o) => o.expression === c.expression)
      ?.targets ?? []) {
      const helper = nodeFor(target);
      if (
        !helper ||
        !helper.pure ||
        projectIndex.calls(helper).some((o) => o.targets.length)
      )
        continue;
      const parent = originals.find(
        (o) => c.inArgsOf.includes(o.name) && o.targets.length,
      );
      if (!parent) continue;
      for (const t of parent.targets) nodeFor(t)?.helpers.push(helper);
      ctx.seen.add(identityOf(helper));
      ctx.sources.add(helper.file);
      const idx = ctx.pending.indexOf(helper);
      if (idx >= 0) ctx.pending.splice(idx, 1);
    }
  }
  const occurrence = new Map();
  for (const c of [...calls].sort(
    (a, b) =>
      a.endLine - b.endLine ||
      b.inArgsOf.length - a.inArgsOf.length ||
      a.pos - b.pos,
  )) {
    const matching = originals.filter((o) => o.expression === c.expression);
    const nth = occurrence.get(c.expression) ?? 0;
    occurrence.set(c.expression, nth + 1);
    const original = matching[nth];
    if (!original) continue;
    for (const target of original.targets) {
      const id = identityOf(target);
      if (ctx.seen.has(id)) continue;
      const node = nodeFor(target);
      if (!node) continue;
      const existing = node;
      const attachment = ctx.attach[nodeKey(node)] ?? ctx.attach[node.name];
      if (attachment?.nth !== undefined) {
        const same = calls.filter((x) => x.expression === c.expression);
        if (same.at(attachment.nth) !== c) continue;
      }
      ctx.seen.add(id);
      const pendingIndex = ctx.pending.indexOf(existing);
      if (pendingIndex >= 0) ctx.pending.splice(pendingIndex, 1);
      r.children.push({
        key: nodeKey(node),
        call: c,
        stmtStart: c.startLine,
        at: c.endLine,
        child: resolveFn(node, ctx, c, false),
      });
    }
  }
}

function addRequestPipeline(r, node, ctx) {
  const pipeline = requestPipeline(node);
  const globalsAt = r.headLen;
  for (const hook of pipeline) {
    const idx =
      hook.placement === '@global'
        ? -1
        : r.lines.findIndex((l) => l.includes(hook.placement));
    const at = idx < 0 ? globalsAt : idx;
    const call = {
      args: [],
      startLine: Math.max(at, 0),
      endLine: at,
      inArgsOf: [],
    };
    let child;
    if (hook.functionName) {
      const target = projectIndex.functions.find(
        (n) =>
          n.file === hook.file &&
          n.name === hook.functionName &&
          (n.className ?? null) === (hook.className ?? null),
      );
      if (!target)
        throw new Error(`Không phân giải được pipeline ${hook.label}`);
      const id = identityOf(target);
      if (ctx.seen.has(id)) continue;
      ctx.seen.add(id);
      child = resolveFn(
        { ...target, kind: 'fn', tag: 'CONTROLLER', item: {}, helpers: [] },
        ctx,
        call,
        false,
      );
    } else {
      const lines = hook.lines.filter((l) => l.trim());
      const indent = Math.min(
        ...lines
          .slice(1)
          .filter((l) => l.trim())
          .map(leading),
        leading(lines[0]),
      );
      child = {
        kind: 'frag',
        tag: 'CONTROLLER',
        label: hook.label,
        className: null,
        lines: lines.map((l) => l.slice(Math.min(indent, leading(l)))),
        syn: lines.map(() => 0),
        children: [],
        deps: null,
        sourceFile: hook.file,
        sourceRange: [hook.sourceStart, hook.sourceEnd],
        groups: [
          { file: hook.file, spans: [[hook.sourceStart, hook.sourceEnd]] },
        ],
      };
      ctx.sources.add(hook.file);
      claimChildren(child, ctx);
    }
    r.children.push({
      key: hook.label,
      call,
      stmtStart: Math.max(at, 0),
      at,
      child,
    });
  }
}

function resolveFrag(f, ctx) {
  const built = extractBand({
    tag: f.tag,
    file: f.item.file,
    ranges: f.ranges,
    inline: [],
  });
  // nhãn: title của item, hoặc câu SQL đầu tiên (CREATE TABLE … / CREATE UNIQUE INDEX …), hoặc tên file
  const sql = built.lines
    .map((l) =>
      /^\s*(CREATE|ALTER)\s+(UNIQUE\s+)?(TABLE|INDEX|TYPE|EXTENSION)\b[^(]*/i.exec(
        l,
      ),
    )
    .find(Boolean);
  const label =
    f.item.title ??
    (sql
      ? sql[0].trim().replace(/\s+/g, ' ')
      : path.posix.basename(f.ranges[0].file ?? f.item.file));
  applyInline(
    built.lines,
    f.item.inline ?? [],
    label,
    undefined,
    ctx.inlineApplied,
  );
  return {
    kind: 'frag',
    tag: f.tag,
    label,
    className: null,
    lines: built.lines,
    syn: built.lines.map(() => 0),
    headLen: 0,
    isEntry: false,
    children: [],
    deps: null,
    groups: built.groups.map((g) => ({
      file: g.file,
      spans: g.parts.flatMap((p) => p.spans),
    })),
  };
}

// ----- constructor: dependency của khối + của mọi hop lồng bên dưới gom ở đầu khối hop đầu tiên dưới điểm vào -----
function collectDeps(r, groups) {
  if (r.deps) {
    const key = `${r.deps.file}#${r.deps.cls.name?.text}`;
    const g = groups.get(key) ?? {
      file: r.deps.file,
      cls: r.deps.cls,
      names: new Set(),
    };
    for (const n of r.deps.names) g.names.add(n);
    groups.set(key, g);
  }
  for (const c of r.children) collectDeps(c.child, groups);
}

// thuộc tính class là arrow function đã được bung thành hàm (hop): không in thêm lần nữa như "field" ở phần constructor gom
let CLAIMED_PROP_FNS = new Set();

function placeCtor(r, groups, at, shown) {
  const parts = [];
  for (const g of groups.values()) {
    const info = ctorInfo(g.file, g.cls);
    if (info.body.length) {
      for (const name of usedThis(info.body)) g.names.add(name);
      for (const p of info.props)
        if (new RegExp(`\\b${p.name}\\b`).test(info.body.join('\n')))
          g.names.add(p.name);
    }
    const mark = (kind, n) => `${g.file}|${info.className}|${kind}:${n}`;
    // bỏ tham số/thuộc tính đã hiện (cùng class, hoặc class khác nhưng viết GIỐNG HỆT, vd config: ConfigService<…>)
    const textOf = (kind, x) =>
      `t|${kind}|${kind === 'p' ? x.text : x.lines.join('\n')}`;
    const picked = info.props.filter(
      (p) =>
        g.names.has(p.name) &&
        !shown.has(mark('p', p.name)) &&
        !shown.has(textOf('p', p)),
    );
    const fields = info.fields.filter(
      (f) =>
        g.names.has(f.name) &&
        !CLAIMED_PROP_FNS.has(`${info.className}.${f.name}`) &&
        !shown.has(mark('f', f.name)) &&
        !shown.has(textOf('f', f)),
    );
    if (!picked.length && !fields.length) continue;
    for (const p of picked) shown.add(mark('p', p.name)).add(textOf('p', p));
    for (const f of fields) shown.add(mark('f', f.name)).add(textOf('f', f));
    parts.push({ info, picked, fields });
  }
  if (!parts.length) return;
  const lines = [];
  const syn = [];
  const add = (l, s = 0) => {
    lines.push(l);
    syn.push(s);
  };
  const classTag = (info) => {
    if (info.className !== r.className) add(`// ${info.className}`);
  };
  // 1) thuộc tính khai báo sẵn mà code dùng (vd logger)
  for (const { info, fields } of parts) {
    if (!fields.length) continue;
    classTag(info);
    for (const f of fields) {
      const ind = leading(f.lines[0]);
      for (const l of f.lines) add(l.slice(Math.min(ind, leading(l))));
    }
  }
  // 2) constructor: chỉ các tham số inject mà code dùng
  const withCtor = parts.filter((x) => x.picked.length);
  if (withCtor.length) {
    const [only] = withCtor;
    if (
      withCtor.length === 1 &&
      !only.info.body.length &&
      only.info.single &&
      only.picked.length === only.info.ctor.parameters.length
    ) {
      add(
        only.info.singleLine.slice(
          Math.min(only.info.indent, leading(only.info.singleLine)),
        ),
      );
    } else {
      add(
        'constructor(',
        withCtor.every((x) => x.info.head.trim() === 'constructor(') ? 0 : 2,
      );
      for (const { info, picked } of withCtor) {
        if (info.className !== r.className) add(`  // ${info.className}`);
        for (const p of picked) {
          for (const l of p.lines ?? [`  ${p.text},`])
            add(
              p.lines ? l.slice(Math.min(info.indent, leading(l))) : l,
              p.lines ? 0 : 2,
            );
        }
      }
      const initialized = parts.filter((x) => x.info.body.length);
      if (initialized.length) {
        add(') {', 2);
        for (const { info } of initialized) {
          add(`  // ${info.className}`);
          const indent = Math.min(
            ...info.body.filter((l) => l.trim()).map(leading),
          );
          for (const l of info.body)
            add('  ' + l.slice(Math.min(indent, leading(l))));
        }
        add('}', 2);
      } else
        add(
          ') {}',
          withCtor.every((x) => x.info.tail.trim() === ') {}') ? 0 : 2,
        );
    }
  }
  // điểm vào nằm trong class: thụt như các hàm của class
  const out =
    r.isEntry && r.headLen
      ? lines.map((l) => ' '.repeat(parts[0].info.indent) + l)
      : lines;
  const delta = out.length + 1;
  r.lines.splice(at, 0, ...out, '');
  r.syn.splice(at, 0, ...syn, 0);
  for (const c of r.children) {
    if (c.stmtStart >= at) c.stmtStart += delta;
    if (c.at >= at || (c.at === -1 && at === 0)) c.at += delta; // -1 = trước dòng đầu: sau khi chèn constructor thì nằm ngay sau dòng trống đệm
  }
}

// Constructor gom chung: MỌI dependency mà code của luồng dùng (class điểm vào, service, adapter... ở mọi độ sâu) gom hết vào
// MỘT constructor ngay dưới class của điểm vào, ở đầu trang; class khác ngoài điểm vào có dòng `// TênClass` đứng trước.
function mergeCtors(entry) {
  const keyOf = (r) =>
    r.deps ? `${r.deps.file}#${r.deps.cls.name?.text}` : null;
  const order = (r) => [
    r,
    ...[...r.children]
      .sort((a, b) => a.at - b.at)
      .flatMap((c) => order(c.child)),
  ];
  const groups = new Map(); // class của điểm vào đứng đầu (điểm vào được duyệt trước), rồi các class khác theo thứ tự xuất hiện
  for (const r of order(entry)) {
    if (!r.deps) continue;
    const g = groups.get(keyOf(r)) ?? {
      file: r.deps.file,
      cls: r.deps.cls,
      names: new Set(),
    };
    for (const n of r.deps.names) g.names.add(n);
    groups.set(keyOf(r), g);
  }
  placeCtor(entry, groups, entry.headLen, new Set());
}

const outlineOf = (r, depth = 0) => [
  `${'  '.repeat(depth)}[${r.tag}] ${r.label.split(':')[0]}`,
  ...r.children.flatMap((c) => outlineOf(c.child, depth + 1)),
];

function nestedDoc(ep, doc, stat) {
  const nodes = classifyItems(ep);
  const skipNames = new Set(ep.skip ?? []);
  const pending = nodes.filter(
    (n) => n.kind === 'fn' && !skipNames.has(n.name),
  );
  const ctx = {
    catalog: new Map(pending.map((n) => [identityOf(n), n])),
    seen: new Set(),
    expected: new Set(),
    sources: new Set(),
    pending,
    attach: ep.attach ?? {},
    steps: ep.steps ?? [],
    stepsApplied: new Set(),
    inlineApplied: new Set(),
  };
  const entries = [];
  while (pending.length) {
    // điểm vào đầu tiên = hàm controller đầu tiên; các điểm vào sau = hàm còn chờ mà không hàm nào khác còn chờ gọi tới
    let k = entries.length
      ? -1
      : pending.findIndex((n) => n.tag === 'CONTROLLER');
    if (k < 0)
      k = pending.findIndex(
        (n) => !pending.some((o) => o !== n && calledNames(o).has(n.name)),
      );
    if (k < 0) k = 0;
    const [entry] = pending.splice(k, 1);
    if (ctx.seen.has(identityOf(entry))) continue;
    ctx.seen.add(identityOf(entry));
    ctx.declared = new Set(); // tên biến đã khai báo trong luồng của điểm vào này (cùng phạm vi phẳng)
    entries.push(resolveFn(entry, ctx, null, true));
  }
  const appendix = nodes
    .filter((n) => n.kind === 'frag')
    .map((f) => resolveFrag(f, ctx));
  const missing = [
    ...ep.items.flatMap((i) =>
      (i.inline ?? [])
        .filter((x) => !ctx.inlineApplied.has(x))
        .map((x) => `comment "${x.at}"`),
    ),
    ...ctx.steps
      .filter((s) => !ctx.stepsApplied.has(s))
      .map((s) => `step "${s.at}"`),
  ];
  if (missing.length)
    throw new Error(
      `${ep.n}-${ep.slug}: không thấy trong code đã dựng (hàm bị skip/thay thẳng, hoặc sai anchor): ${missing.join('; ')}`,
    );
  const groups = new Map();
  for (const e of entries) collectDeps(e, groups);
  CLAIMED_PROP_FNS = new Set(
    nodes
      .filter((n) => n.kind === 'fn' && ts.isPropertyDeclaration(n.f.node))
      .map((n) => `${n.className}.${n.name}`),
  );
  if (entries.length)
    placeCtor(entries[0], groups, entries[0].headLen, new Set());
  for (const f of appendix) for (const g of f.groups) ctx.sources.add(g.file);
  stat.sources = [...ctx.sources].sort();

  stat.expanded = [...ctx.seen].sort();
  [...entries, ...appendix].forEach((r, i) => {
    if (i > 0 && doc.length && doc.at(-1).text.trim() !== '')
      doc.push({ kind: 'blank', text: '' });
    emitNode(r, 0, doc, stat);
  });
  return [
    ...entries.flatMap((e) => outlineOf(e)),
    ...appendix.map((a) => `[${a.tag}] ${a.label} (đoạn rời)`),
  ];
}

// ---------- tô màu theo palette GitHub (Primer) ----------
const PRIMITIVE_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'void',
  'unknown',
  'never',
  'any',
  'object',
  'symbol',
  'bigint',
]);
const CONSTANT_WORDS = new Set([
  'true',
  'false',
  'null',
  'undefined',
  'this',
  'super',
]);
const CONTEXTUAL = new Set([
  'type',
  'from',
  'of',
  'as',
  'get',
  'set',
  'async',
  'readonly',
  'public',
  'private',
  'protected',
  'static',
  'abstract',
  'declare',
  'satisfies',
]);

function highlightBlock(text) {
  const toks = scanTokens(text);
  const isTrivia = (k) =>
    k === K.WhitespaceTrivia ||
    k === K.NewLineTrivia ||
    k === K.SingleLineCommentTrivia ||
    k === K.MultiLineCommentTrivia;
  const sig = [];
  toks.forEach((tok, i) => {
    if (!isTrivia(tok.k)) sig.push(i);
  });
  const where = new Map(sig.map((tokIndex, p) => [tokIndex, p]));
  const prevOf = (i) => toks[sig[(where.get(i) ?? 0) - 1]];
  const nextOf = (i) => toks[sig[(where.get(i) ?? 0) + 1]];
  let html = '';
  toks.forEach((tok, i) => {
    const { k, t } = tok;
    let cls = '';
    if (k === K.SingleLineCommentTrivia || k === K.MultiLineCommentTrivia)
      cls = 'pl-c';
    else if (
      k === K.StringLiteral ||
      k === K.NoSubstitutionTemplateLiteral ||
      k === K.TemplateHead ||
      k === K.TemplateMiddle ||
      k === K.TemplateTail
    )
      cls = 'pl-s';
    else if (k === K.NumericLiteral || k === K.BigIntLiteral) cls = 'pl-c1';
    else if (
      k === K.Identifier ||
      (k >= K.FirstKeyword && k <= K.LastKeyword)
    ) {
      const prev = prevOf(i);
      const next = nextOf(i);
      const afterDot =
        prev && (prev.k === K.DotToken || prev.k === K.QuestionDotToken);
      const isKeyword = k !== K.Identifier;
      if (
        isKeyword &&
        !afterDot &&
        !(next?.k === K.ColonToken && CONTEXTUAL.has(t))
      ) {
        if (t === 'constructor') cls = 'pl-en';
        else if (CONSTANT_WORDS.has(t) || PRIMITIVE_TYPES.has(t)) cls = 'pl-c1';
        else cls = 'pl-k';
      } else if (prev?.k === K.AtToken) cls = 'pl-en';
      else if (
        prev &&
        (prev.k === K.NewKeyword ||
          prev.k === K.ClassKeyword ||
          prev.k === K.InterfaceKeyword ||
          prev.k === K.ExtendsKeyword ||
          prev.k === K.ImplementsKeyword)
      )
        cls = 'pl-en';
      else if (prev?.k === K.ConstKeyword && next?.k !== K.OpenParenToken)
        cls = 'pl-c1';
      else if (next?.k === K.OpenParenToken) cls = 'pl-en';
      else if (CONSTANT_WORDS.has(t)) cls = 'pl-c1';
      else if (/^[A-Z][A-Z0-9_]+$/.test(t)) cls = 'pl-c1';
      else if (
        /^[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*$/.test(t) &&
        next?.k !== K.DotToken
      )
        cls = 'pl-en';
    }
    html += t
      .split('\n')
      .map((p) =>
        p === '' ? '' : cls ? `<span class="${cls}">${esc(p)}</span>` : esc(p),
      )
      .join('\n');
  });
  return html.split('\n');
}

// ---------- dựng tài liệu của một endpoint ----------
const BOLD_RULE = `// ${'═'.repeat(76)}`;

function git(argv) {
  return execFileSync('git', argv, { cwd: repoDir, encoding: 'utf8' }).trim();
}

// file nguồn nào đang có thay đổi chưa commit (hoặc chưa được theo dõi) so với HEAD của bản clone
function dirtyOf(files) {
  if (files.length === 0) return [];
  const out = execFileSync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all', '--', ...files],
    { cwd: repoDir, encoding: 'utf8' },
  );
  return out
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3).trim());
}

// mọi file nguồn mà endpoint chép code từ đó (bản cũ: items; bản cây lồng nhau: tree + các node con)
function sourceFiles(ep) {
  const out = [];
  const walk = (n) => {
    if (!n) return;
    if (n.file) out.push(n.file);
    for (const r of n.ranges ?? []) if (r.file) out.push(r.file);
    for (const h of n.helpers ?? []) out.push(h.file);
    for (const c of n.children ?? []) walk(c.node);
  };
  for (const i of ep.items ?? []) if (!i.schema) walk(i);
  return [...new Set(out)];
}

function stampFor(features) {
  const commit = git(['rev-parse', '--short', 'HEAD']);
  const sources = [
    ...new Set(
      features.flatMap((f) => f.endpoints.flatMap((e) => sourceFiles(e))),
    ),
  ];
  const dirty = git(['status', '--porcelain', '--', ...sources]) !== '';
  return {
    commit: dirty ? `${commit} + thay đổi chưa commit` : commit,
    base: commit,
    date: new Date().toISOString().slice(0, 10),
  };
}

// nguồn của một trang: "pushed" = mọi file nguồn khớp commit đã đẩy (PR #84); "local" = có file chưa commit/chưa đẩy
const originChip = (ep, stamp) => {
  const o = ep.origin;
  if (!o || o.kind === 'unknown') return '';
  if (o.kind === 'local') {
    const tip = `Code trang này đọc từ working tree CHƯA COMMIT (nền ${stamp.base}); chưa có trên GitHub. File: ${o.files.join(', ')}`;
    return `<span class="org org-local" title="${esc(tip).replaceAll('"', '&quot;')}">local · chưa commit</span>`;
  }
  return `<span class="org org-pushed" title="Mọi file nguồn khớp commit ${esc(stamp.base)} đã đẩy lên PR #84">đã đẩy · PR #84</span>`;
};
const originText = (ep) =>
  ep.origin?.kind === 'local'
    ? 'local, chưa commit'
    : ep.origin?.kind === 'pushed'
      ? 'đã đẩy (PR #84)'
      : '';
// nút sang trang kiến trúc 10M của tính năng và sang sơ đồ sản phẩm ở trang gốc; `up` = đường lên thư mục chứa code-10m/
const archButtons = (feature, up) =>
  [
    feature.arch
      ? `<a class="btn" href="${up}architecture-10m/${feature.arch}.html">Kiến trúc 10M</a>`
      : '',
    feature.diagramAnchor
      ? `<a class="btn" href="${up}index.html#${feature.diagramAnchor}">Sơ đồ sản phẩm</a>`
      : '',
  ]
    .filter(Boolean)
    .join('\n      ');

const labeled = (label, text) =>
  wrapText(text, `//  ${label.padEnd(10)} `, `//  ${' '.repeat(10)} `);
// items: chuỗi, hoặc danh sách [tên, vai trò] — mỗi mục 1 đoạn "tên — vai trò", mục đầu nằm cạnh nhãn.
const pairBlock = (label, items) => {
  if (typeof items === 'string') return labeled(label, items);
  const first = `//  ${label.padEnd(10)} `;
  const rest = `//  ${' '.repeat(10)} `;
  return items.flatMap(([name, desc], i) =>
    wrapText(`${name} — ${desc}`, i === 0 ? first : rest, `${rest}  `),
  );
};
const tableNames = (ep) => ep.tables.map((t) => (Array.isArray(t) ? t[0] : t));
const mergeSpans = (spans) =>
  spans.reduce(
    (acc, [a, b]) =>
      acc.length && acc.at(-1)[1] + 1 === a
        ? [...acc.slice(0, -1), [acc.at(-1)[0], b]]
        : [...acc, [a, b]],
    [],
  );
const baseName = (ep) => `${ep.n}-${ep.slug}`;
const isCodeLine = (l) => !isCommentLine(l) && l.trim() !== '';

function buildDoc(feature, ep, stamp) {
  const doc = [];
  const push = (kind, text, tier, extra) =>
    doc.push({ kind, text, ...(tier ? { tier } : {}), ...(extra ?? {}) });
  const blank = () => {
    if (doc.length && doc.at(-1).kind !== 'blank') push('blank', '');
  };
  push('sec', `//  ${ep.method} ${ep.route}`);
  push('sec', `//  ${ep.title}`);
  blank();

  let codeLineCount = 0;
  let outline = [];
  let sources = sourceFiles(ep);
  let expanded = [];
  if (ep.nested) {
    const stat = { code: 0, step: 0, steps: [] };
    outline = nestedDoc(ep, doc, stat);
    codeLineCount += stat.code;
    sources = stat.sources;
    expanded = stat.expanded;
    doc.stepList = stat.steps;
  }
  for (const item of ep.nested ? [] : (ep.items ?? [])) {
    const { lines, spans } = extract(item);
    const base = path.posix.basename(item.file);
    const spanText = mergeSpans(spans)
      .map(([a, b]) => (a === b ? `L${a}` : `L${a}–${b}`))
      .join(', ');
    push(
      'tag',
      `// ${item.tag ? `[${item.tag}] ` : ''}${base}${item.title ? ` · ${item.title}` : ''} · ${spanText}`,
      item.tag,
    );
    const html = highlightBlock(lines.join('\n'));
    lines.forEach((text, i) => doc.push({ kind: 'code', text, html: html[i] }));
    codeLineCount += lines.filter(isCodeLine).length;
    blank();
  }
  while (doc.length && doc.at(-1).text.trim() === '') doc.pop();
  const steps = doc.stepList ?? [];
  doc.splice(
    2,
    0,
    ...steps.map((text) => ({ kind: 'head', text: `//  ${text}` })),
  );
  return { doc, codeLineCount, outline, sources, steps, expanded };
}

// ---------- xuất các dòng của cây lồng nhau ----------
const spanOf = (spans) =>
  mergeSpans(spans)
    .map(([a, b]) => (a === b ? `L${a}` : `L${a}–${b}`))
    .join(', ');
const isBlankRow = (r) => r.text.trim() === '';

function emitNode(r, base, rows, stat) {
  const pad = ' '.repeat(base);
  const byFile = new Map();
  for (const g of r.groups)
    byFile.set(g.file, [...(byFile.get(g.file) ?? []), ...g.spans]);
  const sourceFile = [...byFile.keys()][0];
  const displayPath = (file) =>
    file.includes('/modules/')
      ? file.split('/modules/')[1]
      : file.replace(/^apps\/core-api\/src\//, '');
  const ref =
    sourceFile !== stat.currentFile
      ? [...byFile.keys()].map(displayPath).join(' + ')
      : '';
  stat.currentFile = sourceFile;
  rows.push({
    kind: 'nhead',
    text: `${pad}// [${r.tag}] ${r.label}${ref ? ` · ${ref}` : ''}`,
    tier: r.tag,
    html: `${pad}<span class="pl-c">// <b class="tg tg-${r.tag.toLowerCase()}">[${r.tag}]</b> <span class="ttl">${esc(r.label)}</span>${ref ? ` <span class="rf">· ${esc(ref)}</span>` : ''}</span>`,
  });
  const html = highlightBlock(r.lines.join('\n'));
  const at = new Map();
  for (const c of r.children) at.set(c.at, [...(at.get(c.at) ?? []), c]);
  const gap = () => {
    if (rows.length && !isBlankRow(rows.at(-1)))
      rows.push({ kind: 'code', text: '', html: '', tier: r.tag });
  };
  const placeChildren = (i) => {
    for (const c of at.get(i) ?? []) {
      gap();
      emitNode(c.child, base + leading(r.lines[c.stmtStart]), rows, stat);
      // không chèn dòng trống ngay trước ngoặc đóng của hàm cha
      if (i + 1 < r.lines.length && !/^\s*[})\]]/.test(r.lines[i + 1])) gap();
    }
  };
  placeChildren(-1); // lời gọi trong điều kiện của câu lệnh đầu tiên: khối lồng nằm trước dòng đầu
  r.lines.forEach((text, i) => {
    stat.currentFile = sourceFile;
    if (text.trim() === '') gap();
    else if (text.endsWith('\u0001')) {
      // comment / Step: ngắt dòng theo thụt lề thật để mỗi dòng ≤ 98 cột; Step được gán số theo thứ tự xuất hiện trong file
      const ind = leading(text);
      const prefix = `${' '.repeat(ind)}// `;
      const wrapped = wrapText(
        text.slice(ind + 3, -1),
        prefix,
        prefix,
        98 - base,
      );
      const isStep = wrapped[0].startsWith(`${prefix}Step #:`);
      if (isStep) {
        stat.step += 1;
        stat.steps.push(
          text.trim().slice(3, -1).replace('Step #:', `Step ${stat.step}:`),
        );
        wrapped[0] = wrapped[0].replace('Step #:', `Step ${stat.step}:`);
        if (rows.length && rows.at(-1).kind !== 'nhead') gap();
      }
      for (const w of wrapped)
        rows.push({
          kind: 'code',
          text: pad + w,
          html: `${pad}<span class="pl-c">${esc(w)}</span>`,
          tier: r.tag,
          ...(isStep ? { step: true } : {}),
        });
    } else {
      rows.push({
        kind: 'code',
        text: pad + text,
        html: pad + html[i],
        tier: r.tag,
        ...(r.syn[i] ? { syn: r.syn[i] } : {}),
      });
    }
    placeChildren(i);
  });
  stat.code += r.lines.filter(isCodeLine).length;
}

// ---------- HTML kiểu GitHub ----------
function renderEndpointHtml(feature, ep, built, stamp) {
  const { doc } = built;
  const indOf = doc.map((l) =>
    (l.kind === 'code' || l.kind === 'nhead') && l.text.trim()
      ? Math.floor(l.text.match(/^ */)[0].length / 2) * 2
      : null,
  );
  const prevInd = [];
  const nextInd = [];
  let carry = 0;
  indOf.forEach((v, i) => {
    if (v !== null) carry = v;
    prevInd[i] = carry;
  });
  carry = 0;
  for (let i = indOf.length - 1; i >= 0; i -= 1) {
    if (indOf[i] !== null) carry = indOf[i];
    nextInd[i] = carry;
  }
  const indentOf = (i) =>
    indOf[i] !== null
      ? indOf[i]
      : doc[i].kind === 'blank' || doc[i].kind === 'code'
        ? Math.min(prevInd[i], nextInd[i])
        : 0;
  const rows = doc
    .map((l, i) => {
      const n = i + 1;
      let inner;
      if (l.kind === 'code')
        inner = l.text.trim().startsWith('//')
          ? colorTags(l.html || '')
          : l.html || '&nbsp;';
      else if (l.kind === 'blank') inner = '&nbsp;';
      else if (l.kind === 'nhead') inner = l.html;
      else inner = `<span class="pl-c">${colorTags(esc(l.text))}</span>`;
      const tier = l.tier ? ` tier-${l.tier.toLowerCase()}` : '';
      const syn =
        (l.syn ? ` syn${l.syn === 1 ? ' synfirst' : ''}` : '') +
        (l.step ? ' step' : '');
      return `<div class="ln ${l.kind}${tier}${syn}" id="L${n}"><a class="n" href="#L${n}" data-n="${n}"></a><span class="t"${indentOf(i) ? ` style="--ind:${indentOf(i)}"` : ''}>${inner}</span></div>`;
    })
    .join('\n');
  const nav = feature.endpoints
    .map(
      (e) =>
        `<a href="${baseName(e)}.html"${e === ep ? ' class="cur"' : ''}>${e.n} ${e.method} ${esc(e.short)}</a>`,
    )
    .join('');
  const used = TIERS.filter((t) => doc.some((l) => l.text.includes(`[${t}]`)));
  const legend = used.length
    ? `<div class="legend"><span>Tầng:</span>${used.map((t) => `<b class="lg tg-${t.toLowerCase()}">${t}</b>`).join('')}</div>`
    : '';
  const file = `${baseName(ep)}.ts`;
  const blob = `${REPO}/blob/main/code-10m/${feature.id}/${file}`;
  const raw = `https://raw.githubusercontent.com/ducmanh001/litmatch-feature-flows/main/code-10m/${feature.id}/${file}`;
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="description" content="${esc(ep.title).replaceAll('"', '&quot;')}"/>
<title>${esc(ep.method)} ${esc(ep.route)} — ${esc(feature.title)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<div class="box">
  <div class="bar">
    <div class="path"><a href="${REPO}">litmatch-feature-flows</a> / <a href="${REPO}/tree/main/code-10m/${feature.id}">${esc(feature.id)}</a> / <b>${esc(file)}</b><span class="meta">${doc.length} dòng · ${built.codeLineCount} dòng code · litmatch @ ${esc(stamp.base)} ${originChip(ep, stamp)}</span></div>
    <div class="actions">
      <a class="btn" href="../index.html">Tổng quan</a>
      <a class="btn" href="index.html">Các endpoint</a>
      ${archButtons(feature, '../../')}
      <a class="btn" href="../../code/index.html">Bản gốc (/code)</a>
      <a class="btn" href="${blob}">GitHub</a>
      <a class="btn" href="${raw}">Raw</a>
      <button class="btn" id="copy" type="button">Sao chép</button>
      <button class="btn" id="wrap" type="button" title="Bật/tắt xuống dòng cho dòng dài">Xuống dòng</button>
      <button class="btn" id="theme" type="button" title="Đổi theme">Theme: Tự động</button>
    </div>
  </div>
  <nav class="toc">${nav}</nav>
  ${legend}
  <div class="src">
${rows}
  </div>
</div>
</main>
<script>${JS}</script>
</body>
</html>
`;
}

function renderIndexHtml(feature, stamp) {
  const rows = feature.endpoints
    .map(
      (e) =>
        `<tr><td class="num">${e.n}</td><td class="ep"><span class="m m-${e.method.toLowerCase()}">${e.method}</span> <code>${esc(e.route)}</code><div class="rt">${originChip(e, stamp)}</div></td><td>${esc(e.title)}</td><td class="tb">${esc(tableNames(e).join(', '))}</td><td class="lk"><a href="${baseName(e)}.html">Xem</a> · <a href="${REPO}/blob/main/code-10m/${feature.id}/${baseName(e)}.ts">GitHub</a></td></tr>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(feature.title)}: code theo từng endpoint</title>
<style>${CSS}</style>
</head>
<body>
<main>
<div class="box">
  <div class="bar">
    <div class="path"><a href="${REPO}">litmatch-feature-flows</a> / <a href="${REPO}/tree/main/code-10m/${feature.id}">${esc(feature.id)}</a> / <b>các endpoint</b></div>
    <div class="actions"><a class="btn" href="../index.html">Tổng quan</a>${archButtons(feature, '../../')}<a class="btn" href="../../code/index.html">Bản gốc (/code)</a><button class="btn" id="theme" type="button" title="Đổi theme">Theme: Tự động</button></div>
  </div>
  <div class="idx">
    <h1>${esc(feature.title)}: code theo từng endpoint</h1>
    <p>Mỗi endpoint là một file, đọc từ trên xuống theo thứ tự chạy: code controller, hàm nó gọi được chép ngay tại dòng gọi, ngang cấp (chỉ thân hàm; chỉ khối { } của code mới thụt vào), cứ thế xuống service, Postgres, Redis, worker. Mỗi khối có dòng tiêu đề [TẦNG] tô màu (CONTROLLER, SERVICE, WORKER, POSTGRES, REDIS, KAFKA, BULLMQ, EXTERNAL, GATEWAY), có đánh số Step, và một constructor gom hạ tầng trực tiếp và phần khởi tạo liên quan ở đầu trang. Có cấu hình và logic middleware, guard, interceptor, pipe và exception filter thực sự áp dụng. Chỉ lược DTO, Metrics và implementation của thư viện ngoài. Comment chỉ trả lời "vì sao" ở chỗ logic khó.</p>
    <table class="tbl"><thead><tr><th>#</th><th>Endpoint</th><th>Làm gì</th><th>Bảng</th><th></th></tr></thead><tbody>
${rows}
    </tbody></table>
  </div>
</div>
</main>
<script>${JS_THEME}</script>
</body>
</html>
`;
}

function renderReadme(feature) {
  const rows = feature.endpoints
    .map(
      (e) =>
        `| ${e.n} | \`${e.method} ${e.route}\` | ${e.title} | ${tableNames(e).join(', ')} | [${baseName(e)}.ts](${baseName(e)}.ts) · [Pages](${SITE}/code-10m/${feature.id}/${baseName(e)}.html) | ${originText(e)} |`,
    )
    .join('\n');
  return `# ${feature.title}: code theo từng endpoint

Mỗi file là **một endpoint**, đọc từ trên xuống theo thứ tự chạy: code controller, rồi hàm nó gọi được chép ngay tại dòng gọi, ngang cấp (service, Postgres, Redis, worker...; chỉ khối { } của code mới thụt vào), đánh số Step N.
Mỗi khối có dòng tiêu đề "// [TẦNG] Class.method" (CONTROLLER, SERVICE, WORKER, POSTGRES, REDIS, KAFKA, BULLMQ, EXTERNAL, GATEWAY); bản Pages tô màu các nhãn này. Một constructor gom hạ tầng trực tiếp và phần khởi tạo liên quan ở đầu trang.
Code trích nguyên văn từ repo (đường dẫn nguồn hiện khi chuyển file, không ghi số dòng), đã lược import, comment cũ, decorator Swagger, class và chữ ký của hàm được gọi; ngoại lệ là các dòng "const ... = ..." ở đầu mỗi khối (tham số truyền vào, do công cụ gán từ chỗ gọi). Comment viết thêm chỉ trả lời "vì sao" ở chỗ logic khó, đặt ngay cạnh dòng code liên quan.
Pipeline request lấy từ main.ts, AppModule và decorator thực tế của endpoint. Lời gọi nội bộ bung đệ quy tới hạ tầng; mỗi hàm chỉ bung một lần. Cho phép lược DTO và Metrics; thư viện ngoài giữ lời gọi.

| # | Endpoint | Làm gì | Bảng | File | Nguồn |
|---|----------|--------|------|------|-------|
${rows}

${feature.arch ? `Kiến trúc 10M của tính năng: ${SITE}/architecture-10m/${feature.arch}.html\n\n` : ''}${feature.diagramAnchor ? `Sơ đồ sản phẩm của tính năng: ${SITE}/#${feature.diagramAnchor}\n` : ''}`;
}

// ---------- trang tổng quan: tên từng chức năng + giới thiệu + link tới trang của nó ----------
const flowTiers = (ep) =>
  [
    ...new Set([...(ep.flow ?? '').matchAll(/\[([A-Z]+)\]/g)].map((m) => m[1])),
  ].filter((t) => TIERS.includes(t));
const featureNo = (f) => f.id.split('-')[0];

function renderOverviewHtml(features) {
  const total = features.reduce((n, f) => n + f.endpoints.length, 0);
  const sections = features
    .map((f) => {
      const rows = f.endpoints
        .map((e) => {
          const chips = flowTiers(e)
            .map((t) => `<b class="lg tg-${t.toLowerCase()}">${t}</b>`)
            .join('');
          return `<tr><td class="fn"><a href="${f.id}/${baseName(e)}.html">${esc(e.name ?? e.title)}</a><div class="rt"><span class="m m-${e.method.toLowerCase()}">${e.method}</span> <code>${esc(e.route).replaceAll('/', '/<wbr>')}</code></div><div class="rt">${originChip(e, stamp)}</div></td><td>${esc(e.title)}</td><td class="tiers">${chips}</td></tr>`;
        })
        .join('\n');
      const links = [
        f.arch
          ? `<a href="../architecture-10m/${f.arch}.html">Kiến trúc: ${esc(archTitle(f.arch))}</a>`
          : '',
        f.diagramAnchor
          ? `<a href="../index.html#${f.diagramAnchor}">Sơ đồ sản phẩm (luồng + kiến trúc cơ bản)</a>`
          : '',
        `<a href="${f.id}/index.html">Các trang code</a>`,
      ]
        .filter(Boolean)
        .join(' · ');
      return `<h2 id="${esc(f.id)}">${esc(featureNo(f))} · ${esc(f.title)}</h2>${f.summary ? `\n<p class="sum">${esc(f.summary)}</p>` : ''}
<p class="lnk">${links}</p>
<table class="tbl ov"><thead><tr><th>Chức năng</th><th>Làm gì</th><th>Tầng đi qua</th></tr></thead><tbody>
${rows}
</tbody></table>`;
    })
    .join('\n');
  const legend = TIERS.map(
    (t) => `<b class="lg tg-${t.toLowerCase()}">${t}</b>`,
  ).join('');
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Litmatch ở 10 triệu đồng thời: code thật của các luồng khó đã đổi</title>
<style>${CSS}</style>
</head>
<body>
<main>
<div class="box">
  <div class="bar">
    <div class="path"><a href="${REPO}">litmatch-feature-flows</a> / <b>code-10m</b><span class="meta">${total} chức năng</span></div>
    <div class="actions"><a class="btn" href="../architecture-10m/index.html">Kiến trúc 10M</a><a class="btn" href="../index.html">Sơ đồ sản phẩm</a><a class="btn" href="../code/index.html">Bản gốc (/code)</a><button class="btn" id="theme" type="button" title="Đổi theme">Theme: Tự động</button></div>
  </div>
  <div class="legend"><span>Tầng:</span>${legend}</div>
  <div class="idx">
${INTRO_HTML}
${sections}
  </div>
</div>
</main>
<script>${JS_THEME}</script>
</body>
</html>
`;
}

function renderOverviewReadme(features) {
  const sections = features
    .map((f) => {
      const rows = f.endpoints
        .map(
          (e) =>
            `| [${e.name ?? e.title}](${f.id}/${baseName(e)}.ts) | \`${e.method} ${e.route}\` | ${e.title} | ${flowTiers(e).join(' → ')} | [Pages](${SITE}/code-10m/${f.id}/${baseName(e)}.html) | ${originText(e)} |`,
        )
        .join('\n');
      const links = [
        f.arch
          ? `Kiến trúc: [${archTitle(f.arch)}](${SITE}/architecture-10m/${f.arch}.html)`
          : '',
        f.diagramAnchor
          ? `Sơ đồ sản phẩm: [${f.diagramAnchor}](${SITE}/#${f.diagramAnchor})`
          : '',
      ]
        .filter(Boolean)
        .join(' · ');
      return `## ${featureNo(f)} · ${f.title}\n\n${f.summary ? `${f.summary}\n\n` : ''}${links ? `${links}\n\n` : ''}| Chức năng | Endpoint | Làm gì | Tầng đi qua | Trang | Nguồn |\n|---|---|---|---|---|---|\n${rows}\n`;
    })
    .join('\n');
  return `${INTRO_MD}
${sections}
Kiến trúc 10M: ${SITE}/architecture-10m/index.html · Sơ đồ sản phẩm: ${SITE}/
`;
}

const TIER_VARS_LIGHT =
  '--t-controller:#1a7f37;--t-service:#bc4c00;--t-worker:#8250df;--t-postgres:#0969da;--t-redis:#cf222e;--t-kafka:#57606a;--t-bullmq:#bf3989;--t-external:#0a7a6b;--t-gateway:#9a6700;--on-t:#fff;--guide:#d8dee4';
const TIER_VARS_DARK =
  '--t-controller:#56d364;--t-service:#ffa657;--t-worker:#d2a8ff;--t-postgres:#58a6ff;--t-redis:#ff7b72;--t-kafka:#c9d1d9;--t-bullmq:#ff80c8;--t-external:#39d0bb;--t-gateway:#e3b341;--on-t:#0d1117;--guide:#3d444d';
const TIER_CSS = TIERS.map((t) => {
  const c = t.toLowerCase();
  return (
    `.tg-${c}{color:var(--t-${c})}.ln.tag.tier-${c}{box-shadow:inset 4px 0 0 var(--t-${c})}` +
    `.ln.code.tier-${c},.ln.nhead.tier-${c}{border-left-color:var(--t-${c})}`
  );
}).join('');

const CSS = `
:root{color-scheme:light;--bg:#fff;--fg:#1f2328;--muted:#59636e;--border:#d1d9e0;--subtle:#f6f8fa;--accent:#0969da;--lnum:#818b98;--target:#fff8c5;--sec:#ddf4ff;--secfg:#0550ae;
--pl-c:#6e7781;--pl-k:#cf222e;--pl-en:#8250df;--pl-c1:#0550ae;--pl-s:#0a3069;--ok:#1a7f37;--info:#0969da;--warn:#bc4c00;${TIER_VARS_LIGHT}}
:root[data-theme=dark]{color-scheme:dark;--bg:#0d1117;--fg:#e6edf3;--muted:#8b949e;--border:#30363d;--subtle:#161b22;--accent:#4493f8;--lnum:#6e7681;--target:#3b2e0b;--sec:#10294a;--secfg:#79c0ff;
--pl-c:#8b949e;--pl-k:#ff7b72;--pl-en:#d2a8ff;--pl-c1:#79c0ff;--pl-s:#a5d6ff;--ok:#56d364;--info:#58a6ff;--warn:#ffa657;${TIER_VARS_DARK}}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;--bg:#0d1117;--fg:#e6edf3;--muted:#8b949e;--border:#30363d;--subtle:#161b22;--accent:#4493f8;--lnum:#6e7681;--target:#3b2e0b;--sec:#10294a;--secfg:#79c0ff;
--pl-c:#8b949e;--pl-k:#ff7b72;--pl-en:#d2a8ff;--pl-c1:#79c0ff;--pl-s:#a5d6ff;--ok:#56d364;--info:#58a6ff;--warn:#ffa657;${TIER_VARS_DARK}}}
*{box-sizing:border-box}html,body{margin:0}
body{background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif}
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
.legend{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;padding:8px 16px;border-bottom:1px solid var(--border);font-size:12px;color:var(--muted)}
.lg{font:700 11px/18px ui-monospace,SFMono-Regular,Consolas,monospace;padding:0 8px;border:1px solid currentColor;border-radius:999px}
.src{overflow-x:auto;padding:8px 0;font:12px/20px ui-monospace,SFMono-Regular,"SF Mono","Cascadia Mono",Menlo,Consolas,"Liberation Mono",monospace;tab-size:2}
.ln{display:flex;min-width:max-content;border-left:3px solid transparent}
.ln .n{flex:none;width:56px;padding:0 16px 0 0;text-align:right;color:var(--lnum);user-select:none;text-decoration:none}
.ln .n::before{content:attr(data-n)}.ln .n:hover{color:var(--fg)}
.ln .t{white-space:pre;padding-right:24px;background:repeating-linear-gradient(to right,var(--guide) 0,var(--guide) 1px,transparent 1px,transparent 2ch) no-repeat;background-size:calc(var(--ind,0) * 1ch) 100%}
.src.wrap .ln{min-width:0}
.src.wrap .ln.rule .t{white-space:pre;overflow:hidden;padding-left:0;text-indent:0}
.src.wrap .ln .t{white-space:pre-wrap;overflow-wrap:anywhere;padding-left:calc(var(--ind,0) * 1ch);text-indent:calc(var(--ind,0) * -1ch)}
.ln:target{background:var(--target)}
.ln.tag{background:var(--subtle);border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin-top:2px}
.ln.sec{background:var(--sec)}.ln.sec .pl-c{color:var(--secfg);font-weight:600}.ln.rule .pl-c{color:var(--border)}
.pl-c{color:var(--pl-c)}.pl-k{color:var(--pl-k)}.pl-en{color:var(--pl-en)}.pl-c1{color:var(--pl-c1)}.pl-s{color:var(--pl-s)}
.tg{font-weight:700}
.ln.nhead .ttl{font-weight:600}
.ln.step .pl-c{color:var(--fg);font-weight:700}
.ln.synfirst .t::after{content:"  ← tham số";color:var(--muted);font:italic 11px -apple-system,"Segoe UI",sans-serif}
${TIER_CSS}
.idx{padding:20px 24px 28px}.idx h1{margin:0 0 8px;font-size:22px;font-weight:600}.idx p{margin:0 0 16px;color:var(--muted);max-width:820px}
.idx h2{margin:30px 0 4px;font-size:17px;font-weight:600}.idx .sum{margin:0 0 10px}
.tbl td.fn>a{font-weight:600}.tbl td.fn .rt{margin-top:3px;color:var(--muted)}.tbl td.tiers .lg{display:inline-block;margin:0 4px 4px 0}
.tbl.ov{table-layout:fixed}.tbl.ov th:nth-child(1){width:32%}.tbl.ov th:nth-child(2){width:40%}.tbl.ov th:nth-child(3){width:28%}.tbl.ov code{overflow-wrap:anywhere}
.tbl{width:100%;border-collapse:collapse;font-size:14px}.tbl th,.tbl td{padding:8px 12px;text-align:left;border-top:1px solid var(--border);vertical-align:top}
.tbl th{background:var(--subtle);font-size:12px;color:var(--muted);font-weight:600}.tbl td.num{color:var(--muted);font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
.tbl td.tb{color:var(--muted);font-size:12px}.tbl td.lk,.tbl td.ep{white-space:nowrap}
.tbl code{font:12px ui-monospace,SFMono-Regular,Consolas,monospace;background:var(--subtle);border:1px solid var(--border);border-radius:6px;padding:1px 6px}
.m{display:inline-block;min-width:44px;text-align:center;font:700 11px/18px ui-monospace,SFMono-Regular,Consolas,monospace;border-radius:4px;border:1px solid var(--border);padding:0 6px}
.m-job{color:var(--t-worker)}.m-ws{color:var(--t-gateway)}.m-get{color:var(--ok)}.m-post{color:var(--info)}.m-put{color:var(--warn)}.m-http{color:var(--t-external)}.m-boot{color:var(--t-gateway)}.m-queue{color:var(--t-redis)}
.org{display:inline-block;font:600 11px/18px -apple-system,"Segoe UI",sans-serif;padding:0 8px;border:1px solid currentColor;border-radius:999px;white-space:nowrap;cursor:help}
.org-pushed{color:var(--ok)}.org-local{color:var(--warn)}
.idx p.lnk{margin:0 0 10px;font-size:13px}
@media (max-width:760px){
main{padding:8px 0 32px}
.box{border-radius:0;border-left:0;border-right:0}
.bar{padding:8px 12px;gap:6px 8px}
.path{font-size:13px;overflow-wrap:anywhere}.meta{display:block;margin:2px 0 0}
.actions{gap:6px}.btn{padding:2px 10px}
.toc{flex-direction:column;gap:2px;padding:8px 12px}
.legend{padding:8px 12px}
.src{font-size:11px;line-height:18px;padding:6px 0}
.ln{border-left-width:2px}.ln .n{width:34px;padding-right:8px}.ln .t{padding-right:12px}
.idx{padding:14px 12px}.idx h1{font-size:19px}
.tbl{table-layout:auto}.tbl thead{display:none}
.tbl,.tbl tbody,.tbl tr,.tbl td{display:block;width:auto}
.tbl tr{border-top:1px solid var(--border);padding:8px 0}.tbl td{border:0;padding:2px 0}
.tbl td.num,.tbl td.tb{display:none}
.tbl td.lk,.tbl td.ep{white-space:normal}
}
`;

const JS_THEME = `(function(){
var root=document.documentElement,key='litmatch-code-theme',btn=document.getElementById('theme'),labels={auto:'Tự động',light:'Sáng',dark:'Tối'};
var mode='auto';try{var s=localStorage.getItem(key);if(s==='light'||s==='dark')mode=s}catch(e){}
function apply(){if(mode==='auto')root.removeAttribute('data-theme');else root.setAttribute('data-theme',mode);btn.textContent='Theme: '+labels[mode]}
apply();
btn.addEventListener('click',function(){mode=mode==='auto'?'light':mode==='light'?'dark':'auto';try{if(mode==='auto')localStorage.removeItem(key);else localStorage.setItem(key,mode)}catch(e){}apply()});
})();`;

const JS = `${JS_THEME}
(function(){
var copy=document.getElementById('copy');
copy.addEventListener('click',function(){
var text=Array.prototype.map.call(document.querySelectorAll('.ln .t'),function(n){return n.textContent.replace(/\\u00a0/g,'')}).join('\\n')+'\\n';
var done=function(){copy.textContent='Đã sao chép';setTimeout(function(){copy.textContent='Sao chép'},1500)};
if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(done,function(){})}
else{var a=document.createElement('textarea');a.value=text;document.body.appendChild(a);a.select();try{document.execCommand('copy');done()}catch(e){}document.body.removeChild(a)}
});
})();
(function(){
var btn=document.getElementById('wrap'),src=document.querySelector('.src');if(!btn||!src)return;
var key='litmatch-code-wrap',on=null;try{var s=localStorage.getItem(key);if(s==='1'||s==='0')on=s==='1'}catch(e){}
if(on===null)on=!!(window.matchMedia&&window.matchMedia('(max-width:760px)').matches);
function apply(){if(on)src.classList.add('wrap');else src.classList.remove('wrap');btn.textContent=on?'Cuộn ngang':'Xuống dòng'}
apply();
btn.addEventListener('click',function(){on=!on;try{localStorage.setItem(key,on?'1':'0')}catch(e){}apply()});
})();`;

// ---------- chạy ----------
const selected = annotatedFeatures.filter((f) => !only || f.id === only);
if (selected.length === 0) throw new Error(`Không có tính năng ${only}`);
const stamp = stampFor(selected);
// --survey: thử dựng lồng nhau cho mọi endpoint (không ghi file), in cây hoặc lỗi — để soát trước khi bật `nested: true`
if (args.includes('--survey')) {
  for (const feature of selected) {
    for (const ep of feature.endpoints) {
      const saved = ep.nested;
      ep.nested = true;
      try {
        const b = buildDoc(feature, ep, stamp);
        console.log(`OK  ${feature.id}/${ep.n} ${b.doc.length} dòng`);
        for (const l of b.outline) console.log(`      ${l}`);
      } catch (e) {
        console.log(
          `ERR ${feature.id}/${ep.n}: ${String(e.message).split('\n')[0]}`,
        );
      }
      ep.nested = saved;
    }
  }
  process.exit(0);
}
for (const feature of selected) {
  const dir = path.join(outRoot, feature.id);
  mkdirSync(dir, { recursive: true });
  for (const ep of feature.endpoints) {
    const built = buildDoc(feature, ep, stamp);
    const text = `${built.doc.map((l) => l.text).join('\n')}\n`;
    const dirty = dirtyOf(built.sources);
    // Trang có file nguồn dirty nhưng nội dung HIỂN THỊ giống hệt bản đã xuất bản (dựng từ commit đã đẩy) vẫn là "đã đẩy".
    let identical = false;
    if (process.env.LITMATCH_BASELINE_DIR) {
      try {
        identical =
          readFileSync(
            path.join(
              process.env.LITMATCH_BASELINE_DIR,
              feature.id,
              `${baseName(ep)}.ts`,
            ),
            'utf8',
          ).replace(/\r\n/g, '\n') === text;
      } catch {
        /* chưa từng xuất bản: dùng quy tắc file dirty */
      }
    }
    ep.origin =
      dirty.length && !identical
        ? { kind: 'local', files: dirty }
        : { kind: 'pushed', files: [], ...(dirty.length ? { identical } : {}) };
    writeFileSync(path.join(dir, `${baseName(ep)}.ts`), text);
    // dòng do công cụ thêm (phép gán tham số): verify-annotated.mjs đọc để không đòi "nguyên văn trong repo"
    writeFileSync(
      path.join(dir, `${baseName(ep)}.sources.json`),
      JSON.stringify(
        {
          origin: ep.origin,
          sources: built.sources,
          steps: built.steps,
          expanded: built.expanded,
        },
        null,
        2,
      ),
    );
    writeFileSync(
      path.join(dir, `${baseName(ep)}.syn.json`),
      JSON.stringify(built.doc.filter((l) => l.syn).map((l) => l.text.trim())),
    );
    writeFileSync(
      path.join(dir, `${baseName(ep)}.html`),
      renderEndpointHtml(feature, ep, built, stamp),
    );
    console.log(
      `${baseName(ep)}: ${built.doc.length} dòng (${built.codeLineCount} dòng code) · ${ep.method} ${ep.route}`,
    );
    for (const l of built.outline) console.log(`    ${l}`);
  }
  writeFileSync(path.join(dir, 'index.html'), renderIndexHtml(feature, stamp));
  writeFileSync(path.join(dir, 'README.md'), renderReadme(feature));
}
mkdirSync(outRoot, { recursive: true });
// chạy --only: các tính năng không dựng lần này lấy nhãn nguồn từ manifest của lần dựng trước (nếu có)
for (const feature of annotatedFeatures)
  for (const ep of feature.endpoints) {
    if (ep.origin) continue;
    try {
      ep.origin = JSON.parse(
        readFileSync(
          path.join(outRoot, feature.id, `${baseName(ep)}.sources.json`),
          'utf8',
        ),
      ).origin;
    } catch {
      /* chưa dựng: không có nhãn */
    }
  }
writeFileSync(
  path.join(outRoot, 'index.html'),
  renderOverviewHtml(annotatedFeatures),
);
writeFileSync(
  path.join(outRoot, 'README.md'),
  renderOverviewReadme(annotatedFeatures),
);
console.log(
  `snapshot ${stamp.commit} · ${stamp.date} · tổng quan: ${annotatedFeatures.reduce((n, f) => n + f.endpoints.length, 0)} chức năng`,
);

if (shotDir) {
  const { chromium } = await import('@playwright/test');
  mkdirSync(shotDir, { recursive: true });
  const browser = await chromium.launch({
    executablePath:
      process.env.LITMATCH_BROWSER ??
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  });
  try {
    for (const feature of selected) {
      const targets = feature.endpoints
        .filter((e) => !shotEp || e.n === shotEp)
        .map((e) => [baseName(e), `${baseName(e)}.html`]);
      for (const scheme of ['light', 'dark']) {
        const context = await browser.newContext({
          viewport: { width: 1180, height: 900 },
          colorScheme: scheme,
          deviceScaleFactor: 1.5,
        });
        const page = await context.newPage();
        for (const [name, file] of targets) {
          await page.goto(
            `file:///${path.join(outRoot, feature.id, file).replaceAll('\\', '/')}`,
          );
          const height = await page.evaluate(
            () => document.documentElement.scrollHeight,
          );
          for (const [part, y] of [
            ['a', 0],
            ['b', 2600],
            ['c', 5200],
          ]) {
            if (y >= height) continue;
            await page.screenshot({
              fullPage: true,
              path: path.join(shotDir, `${name}-${scheme}-${part}.png`),
              clip: {
                x: 0,
                y,
                width: 1180,
                height: Math.min(1700, height - y),
              },
            });
          }
          console.log(`${name} ${scheme}: cao ${height}px`);
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
