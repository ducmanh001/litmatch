// Xuất bản thư mục code/ lên repo công khai bằng GraphQL createCommitOnBranch (không cần clone), chia lô theo dung lượng.
//   node layouts/feature-flows/publish-code.mjs --tmp=<thư mục tạm>            # xem trước (mặc định, không đẩy gì)
//   node layouts/feature-flows/publish-code.mjs --tmp=<thư mục tạm> --push     # đẩy thật
// - Ghi đè file dự kiến (suy ra từ catalog), giữ nguyên mọi file khác trên remote; không xoá file.
// - Không bao giờ đụng file ngoài code/. Commit không có trailer Co-Authored-By.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const codeDir = path.join(here, 'code');
const OWNER_REPO = 'ducmanh001/litmatch-feature-flows';
const args = process.argv.slice(2);
const push = args.includes('--push');
const tmp = args.find((a) => a.startsWith('--tmp='))?.slice(6) ?? os.tmpdir();
const MAX_BATCH_BYTES = 4_500_000; // base64 mỗi lô

const gh = (a, opts = {}) =>
  execFileSync('gh', a, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  });

const files = readdirSync(here)
  .filter((f) => /^annotated-.+\.mjs$/.test(f) && f !== 'annotated-source.mjs')
  .sort();
const features = [];
for (const f of files) {
  try {
    features.push(
      ...(await import(pathToFileURL(path.join(here, f)).href))
        .annotatedFeatures,
    );
  } catch (e) {
    console.error(`BỎ QUA ${f}: ${String(e.message).split('\n')[0]}`);
  }
}
features.sort((a, b) => a.id.localeCompare(b.id));

// --only=<feature-id>: chỉ đẩy các trang endpoint (.ts/.html) của tính năng đó, không đụng file nào khác và không xoá gì
// (dùng để đăng thử 1 trang trước khi đổi cả bộ). --message="..." đặt tiêu đề commit.
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const message = args.find((a) => a.startsWith('--message='))?.slice(10);
const expected = only ? [] : ['index.html', 'README.md'];
for (const feature of features.filter((f) => !only || f.id === only)) {
  if (!only)
    expected.push(`${feature.id}/index.html`, `${feature.id}/README.md`);
  for (const ep of feature.endpoints)
    expected.push(
      `${feature.id}/${ep.n}-${ep.slug}.ts`,
      `${feature.id}/${ep.n}-${ep.slug}.html`,
    );
}
if (only && expected.length === 0) {
  console.error(`Không có tính năng ${only}`);
  process.exit(1);
}
const missing = expected.filter((p) => !existsSync(path.join(codeDir, p)));
if (missing.length) {
  console.error(
    'Thiếu file đã sinh (chạy annotated-source.mjs trước):\n' +
      missing.map((m) => '  ' + m).join('\n'),
  );
  process.exit(1);
}

const remote = gh([
  'api',
  `repos/${OWNER_REPO}/git/trees/main?recursive=1`,
  '--jq',
  '.tree[] | select(.type=="blob") | .path',
])
  .split('\n')
  .filter((p) => p.startsWith('code/'))
  .map((p) => p.slice('code/'.length));
const expectedSet = new Set(expected);
const deletions = []; // Publication is additions/updates only; deletion requires separate user approval.

const adds = expected.map((p) => ({
  path: `code/${p}`,
  contents: readFileSync(path.join(codeDir, p)).toString('base64'),
}));
const batches = [[]];
let size = 0;
for (const a of adds) {
  if (size + a.contents.length > MAX_BATCH_BYTES && batches.at(-1).length) {
    batches.push([]);
    size = 0;
  }
  batches.at(-1).push(a);
  size += a.contents.length;
}

console.log(
  `chức năng: ${features.reduce((n, f) => n + f.endpoints.length, 0)} · file ghi đè: ${adds.length} · file xoá trên remote: ${deletions.length} · số lô: ${batches.length}`,
);
for (const d of deletions) console.log(`  xoá  code/${d}`);
if (!push) {
  console.log('(xem trước: chưa đẩy gì; thêm --push để đẩy)');
  process.exit(0);
}

let head = gh([
  'api',
  `repos/${OWNER_REPO}/git/ref/heads/main`,
  '--jq',
  '.object.sha',
]).trim();
batches.forEach((batch, i) => {
  const input = {
    branch: { repositoryNameWithOwner: OWNER_REPO, branchName: 'main' },
    message: {
      headline:
        message ??
        (batches.length === 1
          ? 'Code walkthroughs of the hard flows, with an overview page'
          : `Code walkthroughs of the hard flows (${i + 1}/${batches.length})`),
      body: 'Presentation-only update of the approved cb30743 walkthroughs: complete numbered Steps at the top, reduced headers, and direct AI/text links. The original flow bodies are preserved byte-for-byte.\nBasic CRUD flows are not included. code/index.html is the overview page that links to every flow.',
    },
    fileChanges: {
      additions: batch,
      ...(i === 0 && deletions.length
        ? { deletions: deletions.map((p) => ({ path: `code/${p}` })) }
        : {}),
    },
    expectedHeadOid: head,
  };
  const query =
    'mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid url } } }';
  const file = path.join(tmp, `publish-batch-${i + 1}.json`);
  writeFileSync(file, JSON.stringify({ query, variables: { input } }));
  const res = JSON.parse(gh(['api', 'graphql', '--input', file]));
  if (res.errors) throw new Error(JSON.stringify(res.errors));
  head = res.data.createCommitOnBranch.commit.oid;
  console.log(
    `lô ${i + 1}/${batches.length}: ${res.data.createCommitOnBranch.commit.url}`,
  );
});
