// In bản tóm tắt để người soát đọc nhanh: tổng quan + từng comment inline kèm bằng chứng (src) và dòng code nó đứng cạnh.
//   node layouts/feature-flows/review-annotated.mjs [--only=<feature-id>] [--ep=<NN-slug>]
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const epOnly = process.argv.find((a) => a.startsWith('--ep='))?.slice(5);
const files = readdirSync(here).filter((f) => /^annotated-.+\.mjs$/.test(f) && f !== 'annotated-source.mjs').sort();
for (const f of files) {
  let features;
  try {
    features = (await import(pathToFileURL(path.join(here, f)).href)).annotatedFeatures;
  } catch (e) {
    console.log(`${f}: KHÔNG LOAD ĐƯỢC: ${String(e.message).split('\n')[0]}`);
    continue;
  }
  for (const feature of features.filter((x) => !only || x.id === only)) {
    for (const ep of feature.endpoints) {
      const id = `${ep.n}-${ep.slug}`;
      if (epOnly && epOnly !== id) continue;
      console.log(`\n=== ${feature.id}/${id} — ${ep.name}`);
      console.log(`${ep.method} ${ep.route}`);
      console.log(`title: ${ep.title}`);
      console.log(`flow: ${ep.flow}`);
      for (const [t, d] of ep.roles ?? []) console.log(`  role ${t}: ${d}`);
      for (const [t, d] of ep.tables ?? []) console.log(`  bảng ${t}: ${d}`);
      for (const [t, d] of Array.isArray(ep.redis) ? ep.redis : []) console.log(`  redis ${t}: ${d}`);
      for (const [t, d] of Array.isArray(ep.related) ? ep.related : []) console.log(`  liên quan ${t}: ${d}`);
      // tree = cây lồng nhau (node + children); items = bản cũ
      const nodes = [];
      const walk = (n, depth) => {
        nodes.push({ n, depth });
        for (const c of n.children ?? []) walk(c.node, depth + 1);
      };
      if (ep.tree) walk(ep.tree, 0);
      else for (const i of ep.items) nodes.push({ n: i, depth: 0 });
      for (const { n: item, depth } of nodes) {
        console.log(`${'  '.repeat(depth)}  [${item.tag}] ${item.name ?? (item.file ? path.posix.basename(item.file) : (item.title ?? ''))}`);
        for (const ins of item.inline ?? []) {
          console.log(`    @ ${ins.at.slice(0, 70)}`);
          console.log(`      ${ins.text.join(' ')}`);
          console.log(`      src: ${ins.src ?? '(thiếu)'}`);
        }
      }
    }
  }
}
