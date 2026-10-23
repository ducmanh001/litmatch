// Kiểm tra các file code theo endpoint đã sinh ra:  node layouts/feature-flows/verify-annotated.mjs [--only=<feature-id>]
//  - mọi dòng code phải có NGUYÊN VĂN trong file nguồn (không sửa dòng nào);
//  - đủ phần tổng quan (name, title, flow, roles, tables dạng [tên, vai trò]), nhãn tầng hợp lệ;
//  - comment chỉ trả lời "vì sao": không In/Out, không tham chiếu docs/§, mỗi comment inline có `src` (bằng chứng);
//  - không có dòng lược "// …" (hàm phải chép nguyên vẹn).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(here, '../..');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
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
const files = readdirSync(here)
  .filter((f) => /^annotated-.+\.mjs$/.test(f) && f !== 'annotated-source.mjs')
  .sort();
let problems = 0;
const bad = (msg) => {
  problems += 1;
  console.log(`  ✗ ${msg}`);
};
for (const f of files) {
  let features;
  try {
    features = (await import(pathToFileURL(path.join(here, f)).href))
      .annotatedFeatures;
  } catch (e) {
    console.log(`${f}: KHÔNG LOAD ĐƯỢC: ${String(e.message).split('\n')[0]}`);
    problems += 1;
    continue;
  }
  for (const feature of features.filter((x) => !only || x.id === only)) {
    for (const ep of feature.endpoints) {
      const name = `${feature.id}/${ep.n}-${ep.slug}`;
      const out = path.join(here, 'code-10m', feature.id, `${ep.n}-${ep.slug}.ts`);
      console.log(name);
      if (!existsSync(out)) {
        bad(
          'chưa sinh file .ts (chạy annotated-source.mjs --only=' +
            feature.id +
            ')',
        );
        continue;
      }
      for (const k of ['name', 'title', 'flow']) if (!ep[k]) bad(`thiếu ${k}`);
      // JOB/WS (không qua controller) thường chỉ có 2 vai trò và có thể không đụng bảng nào
      if (!Array.isArray(ep.roles) || ep.roles.length < 2)
        bad('roles cần ≥ 2 tầng [[TẦNG, vai trò], ...]');
      if (
        !Array.isArray(ep.tables) ||
        !ep.tables.every((t) => Array.isArray(t) && t.length === 2)
      )
        bad('tables phải là [[tên bảng, vai trò], ...] (có thể rỗng)');
      for (const [t] of ep.roles ?? [])
        if (!TIERS.includes(t)) bad(`tầng không hợp lệ: ${t}`);
      // nested = cây lồng nhau tự dựng từ items (hàm được gọi thụt vào dưới dòng gọi); không có nested = bản cũ theo hàm
      const parts = [...ep.items];
      for (const item of parts) {
        if (!TIERS.includes(item.tag))
          bad(`đoạn ${item.file ?? item.title} thiếu/ sai tag: ${item.tag}`);
        for (const ins of item.inline ?? [])
          if (!ins.src)
            bad(`comment inline thiếu src (bằng chứng): "${ins.at}"`);
      }
      const manifestFile = out.replace(/\.ts$/, '.sources.json');
      const manifest = existsSync(manifestFile)
        ? JSON.parse(readFileSync(manifestFile, 'utf8'))
        : null;
      if (!manifest) bad('thiếu source manifest');
      const sources = [
        ...new Set([
          ...(manifest?.sources ?? []),
          ...parts
            .flatMap((i) => [
              i.file,
              ...(i.ranges ?? []).map((r) => r.file),
              ...(i.helpers ?? []).map((h) => h.file),
            ])
            .filter(Boolean),
        ]),
      ];
      const all = sources
        .map((s) =>
          readFileSync(path.join(repoDir, s), 'utf8').replace(/\r\n/g, '\n'),
        )
        .join('\n');
      const lines = readFileSync(out, 'utf8').split('\n');
      // dòng do công cụ thêm (phép gán tham số `const tên = giá trị từ chỗ gọi;`), engine ghi vào <file>.syn.json
      const synFile = out.replace(/\.ts$/, '.syn.json');
      const syn = new Set(
        existsSync(synFile) ? JSON.parse(readFileSync(synFile, 'utf8')) : [],
      );
      let synCount = 0;
      const steps = [];
      let code = 0;
      let comments = 0;
      let header = true;
      for (const [i, l] of lines.entries()) {
        const t = l.trim();
        if (!t) {
          if (i > 0 && lines[i - 1].trim() === '' && false)
            bad(`dòng trống thừa ở ${i + 1}`);
          continue;
        }
        if (header && !t.startsWith('//')) header = false;
        if (header) continue;
        if (t.startsWith('//')) {
          if (/^\/\/ \[[A-Z]+\] \S+ · L\d/.test(t)) continue; // dòng định vị (bản cũ)
          if (/^\/\/ [A-Z][A-Za-z0-9_]*$/.test(t)) continue; // nhóm dependency của 1 class trong constructor gom chung: "// TênClass"
          if (ep.nested && /^\/\/ \[[A-Z]+\] /.test(t)) {
            if (
              manifest?.mode !== 'published-presentation' &&
              /\.ts L\d/.test(t)
            )
              bad(`tiêu đề khối còn số dòng ở ${i + 1}`);
            continue; // dòng tiêu đề của khối lồng nhau
          }
          const stepM = /^\/\/ Step (\d+): \S/.exec(t);
          if (stepM) {
            steps.push(Number(stepM[1])); // dòng "Step N: …" (đánh số bước), không tính vào comment "vì sao"
            if (l.length > 100)
              bad(`dòng Step dài ${l.length} cột ở dòng ${i + 1}`);
            continue;
          }
          comments += 1;
          if (/^\/\/ \S+ = /.test(t)) continue;
          if (l.length > 100)
            bad(`comment dài ${l.length} cột ở dòng ${i + 1}`);
          if (/docs\/|§/.test(t))
            bad(`comment tham chiếu docs/§ ở dòng ${i + 1}: ${t.slice(0, 60)}`);
          if (/^\/\/ …/.test(t))
            bad(`dòng lược "// …" ở dòng ${i + 1} (phải chép nguyên vẹn hàm)`);
          if (/^\/\/ (In|Out):/.test(t)) bad(`comment In/Out ở dòng ${i + 1}`);
          continue;
        }
        if (t.startsWith('/*') || t.startsWith('*')) {
          bad(
            `khối comment đầu hàm ở dòng ${i + 1} (chỉ dùng comment inline "vì sao")`,
          );
          continue;
        }
        code += 1;
        if (syn.has(t)) {
          // dòng tham số: mọi tên/chuỗi trong đó phải có trong file nguồn (không bịa tên), và phải là phép gán const
          synCount += 1;
          const ids =
            t
              .replace(/`[^`]*`/g, (s) => s.replace(/[^\w$.{}]+/g, ' '))
              .match(/[A-Za-z_$][\w$]*/g) ?? [];
          for (const id of ids)
            if (id !== 'const' && !all.includes(id))
              bad(`dòng tham số ${i + 1} có tên không thấy trong nguồn: ${id}`);
          continue;
        }
        if (!all.includes(t))
          bad(
            `dòng ${i + 1} không có nguyên văn trong nguồn: ${t.slice(0, 80)}`,
          );
      }
      const summarySteps = lines.filter((l) => /^\/\/  Step \d+:/.test(l));
      if (summarySteps.length !== steps.length)
        bad('danh sách Step đầu trang không khớp thân code');
      if (
        manifest &&
        JSON.stringify(summarySteps.map((l) => l.slice(4))) !==
          JSON.stringify(manifest.steps)
      )
        bad('nội dung Step đầu trang không đầy đủ');
      if (
        ep.nested &&
        manifest?.mode !== 'published-presentation' &&
        lines.filter((l) => /^\s*constructor\(/.test(l)).length !== 1
      )
        bad('phải có đúng một constructor');
      if (
        lines
          .slice(
            0,
            lines.findIndex((l) => l.includes('[CONTROLLER]')),
          )
          .some((l) =>
            /Luồng|Vai trò từng tầng|Cách đọc|\/\/  (Bảng|Redis|Liên quan)/.test(
              l,
            ),
          )
      )
        bad('header còn metadata dành cho AI');
      if (synCount)
        console.log(
          `  ${synCount} dòng tham số do công cụ gán (const ... = giá trị ở chỗ gọi)`,
        );
      if (ep.nested) {
        if (steps.length < 3)
          bad(`cần ghi Step cho các bước chính (đang có ${steps.length})`);
        if (steps.some((s, k) => s !== k + 1))
          bad(`số Step không liên tục 1..${steps.length}: ${steps.join(',')}`);
        console.log(`  ${steps.length} step`);
      }
      console.log(
        `  ${lines.length} dòng · ${code} dòng code · ${comments} dòng comment inline · ${parts.length} đoạn`,
      );
      if (comments < 3) bad('quá ít comment "vì sao" (cần giải thích chỗ khó)');
      // luồng liền mạch chỉ chứa câu lệnh (không có chữ ký hàm) nên số dòng code ít hơn → nới ngưỡng
      const maxRatio = ep.nested ? 0.35 : 0.15;
      if (comments > code * maxRatio)
        bad(`quá nhiều comment (${comments}/${code}); chỉ giải thích chỗ khó`);
    }
  }
}
console.log(
  problems === 0 ? '\nOK: không có vấn đề.' : `\n${problems} vấn đề.`,
);
process.exit(problems === 0 ? 0 : 1);
