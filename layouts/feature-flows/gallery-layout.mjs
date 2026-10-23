import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function checkFeatureCoverage(
  features,
  dependencies,
  flows,
  maps,
  repoDir,
) {
  const registry = JSON.parse(
    readFileSync(path.join(repoDir, 'docs/feature-registry.json'), 'utf8'),
  );
  const productSource = readFileSync(
    path.join(repoDir, 'docs/01-product-features.md'),
    'utf8',
  );
  const productNumbers = [
    ...productSource.matchAll(/\|\s*(\d+)\s*\|\s*\*\*/gu),
  ].map((match) => Number(match[1]));
  const ids = new Set(features.map((feature) => feature.id));
  if (ids.size !== features.length) throw new Error('Duplicate diagram IDs');
  if (
    maps.productCapabilities.length !== productNumbers.length ||
    productNumbers.some(
      (number) =>
        !maps.productCapabilities.some((item) => item.number === number),
    )
  )
    throw new Error('Product coverage differs from canonical docs/01');
  const checkMapping = (name, mapped) => {
    if (!mapped?.length || mapped.some((id) => !ids.has(id)))
      throw new Error(`Invalid coverage mapping: ${name}`);
  };
  for (const item of maps.productCapabilities)
    checkMapping(item.title, item.features);
  for (const item of registry.features)
    checkMapping(item.id, maps.registryCoverage[item.id]);
  if (
    Object.keys(maps.registryCoverage).some(
      (id) => !registry.features.some((item) => item.id === id),
    )
  )
    throw new Error('Coverage includes a noncanonical registry entry');
  if (
    maps.deferredCoverage.length !== registry.deferredDecisions.length ||
    registry.deferredDecisions.some(
      (item) =>
        !maps.deferredCoverage.some(
          (entry) => entry.id === item.id && entry.status === item.status,
        ),
    )
  )
    throw new Error('Deferred coverage differs from canonical registry');
  for (const feature of features)
    if (!dependencies[feature.id] || !flows[feature.id]?.stages?.length)
      throw new Error(`Missing architecture or actor flow: ${feature.id}`);
  return {
    verdict: 'PASS',
    productGroups: maps.productCapabilities.length,
    implementedRegistryGroups: registry.features.length,
    diagramSections: features.length,
    imageCount: features.length * 2,
    ...maps,
    sources: ['docs/01-product-features.md', 'docs/feature-registry.json'],
  };
}

export function writeCompleteGallery(
  features,
  coverage,
  outputDir,
  colors,
  font,
) {
  const escape = (value) =>
    String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  const titles = new Map(
    features.map((feature) => [feature.id, feature.title]),
  );
  const markdownLinks = (ids) =>
    ids.map((id) => `[${titles.get(id)}](./index.html#${id})`).join(' · ');
  const htmlLinks = (ids) =>
    ids
      .map((id) => `<a href="#${id}">${escape(titles.get(id))}</a>`)
      .join(' · ');
  const images = features
    .map(
      (feature) =>
        `| ${feature.title} | [PNG](./${feature.id}-architecture.png) · [SVG](./${feature.id}-architecture.svg) | [PNG](./${feature.id}.png) · [SVG](./${feature.id}.svg) |`,
    )
    .join('\n');
  const productRows = coverage.productCapabilities
    .map(
      (item) =>
        `| ${item.number} | ${item.title} | ${markdownLinks(item.features)} |`,
    )
    .join('\n');
  const deferredRows = coverage.deferredCoverage
    .map((item) => `| ${item.id} | deferred | ${item.note} |`)
    .join('\n');
  const readme = `# Sơ đồ các chức năng Litmatch

Danh sách sản phẩm có **${coverage.productGroups} nhóm**; registry có **${coverage.implementedRegistryGroups} nhóm evidence** theo cách gộp khác. Gallery có **${coverage.diagramSections} mục, ${coverage.imageCount} ảnh**: mỗi mục gồm kiến trúc và luồng xử lý, PNG 2× và SVG.

[Xem gallery](./index.html) · [Bảng coverage](./feature-coverage.json) · [Kết quả render](./render-verification.json).

Gallery cũ có 19 mục vì chưa đưa Speed-up và Preference vào trang. Bộ mới thêm Matching Engine, Speed-up, Preference, User Profile/Privacy, Analytics/privacy notice và Realtime Fanout. 25 mục sơ đồ không có nghĩa sản phẩm có 25 nhóm canonical.

Kiến trúc dùng bố cục và màu Matching, mỗi provider có node riêng. Luồng ghi tên actor và số bước ở đầu mỗi ô, giao tiếp/điều kiện trên dây. Branch A/B/C đánh dấu lựa chọn. PostgreSQL giữ state; Redis chỉ vẽ vai trò thực sự được dùng.

## 21 nhóm sản phẩm

| # | Nhóm sản phẩm | Mục sơ đồ |
| --- | --- | --- |
${productRows}

## Các ảnh

| Mục | Sơ đồ kiến trúc | Luồng xử lý |
| --- | --- | --- |
${images}

## Mục còn deferred

Các mục dưới đây giữ trạng thái registry, không được vẽ thành hành vi đã triển khai.

| ID | Trạng thái | Ghi chú |
| --- | --- | --- |
${deferredRows}

Renderer kiểm tra chữ/node/dây không chồng chéo, đầu dây chạm đúng bước/component, nhãn nằm trên chính dây đó và coverage đủ danh sách sản phẩm/registry. Provider/config phụ thuộc runtime được ghi trong note. Analytics mô tả startup frontend hiện tại, không suy ra active consent gate từ helper chưa được gọi.

Render toàn bộ bằng \`node layouts/feature-flows/render-features.mjs\`; một mục bằng \`--only=04-party-room\`. Matching mẫu cũ và bản preview được giữ riêng.

review-module: N/A — minh họa source hiện có và sửa tooling/gallery; không sửa business code, schema hoặc deployment.
`;
  const navigation = features
    .map((feature) => `<a href="#${feature.id}">${escape(feature.title)}</a>`)
    .join('');
  const productTable = coverage.productCapabilities
    .map(
      (item) =>
        `<tr><td>${item.number}</td><td>${escape(item.title)}</td><td>${htmlLinks(item.features)}</td></tr>`,
    )
    .join('');
  const registryTable = Object.entries(coverage.registryCoverage)
    .map(
      ([id, mapped]) =>
        `<tr><td>${escape(id)}</td><td>${htmlLinks(mapped)}</td></tr>`,
    )
    .join('');
  const deferredTable = coverage.deferredCoverage
    .map(
      (item) =>
        `<tr><td>${escape(item.id)}</td><td>deferred</td><td>${escape(item.note)}</td></tr>`,
    )
    .join('');
  const sections = features
    .map(
      (feature) =>
        `<section data-feature="${feature.id}" id="${feature.id}"><h2>${escape(feature.title)}</h2><p>Mỗi mục có 2 ảnh. Mở PNG hoặc SVG để xem toàn bộ ở độ phân giải gốc.</p><h3>Sơ đồ kiến trúc</h3><a href="${feature.id}-architecture.png"><img src="${feature.id}-architecture.png" alt="${escape(feature.title)} — kiến trúc" loading="lazy"/></a><p><a href="${feature.id}-architecture.png">Kiến trúc PNG</a> · <a href="${feature.id}-architecture.svg">Kiến trúc SVG</a></p><details><summary>Luồng xử lý · thành phần + số bước + giao tiếp</summary><a href="${feature.id}.png"><img class="flow" src="${feature.id}.png" alt="${escape(feature.title)} — luồng theo thành phần" loading="lazy"/></a><p><a href="${feature.id}.png">Luồng PNG</a> · <a href="${feature.id}.svg">Luồng SVG</a></p></details><p><a href="#top">Về đầu trang</a></p></section>`,
    )
    .join('\n');
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Litmatch — Đủ chức năng và luồng xử lý</title><style>html{scroll-behavior:smooth}body{margin:0;background:${colors.background};color:${colors.prose};font:16px/1.6 ${font}}main{max-width:1440px;margin:auto;padding:28px}h1,h2,h3,summary,a{color:${colors.text}}h1{font-size:28px}h2{font-size:23px}h3{font-size:18px}nav{display:flex;flex-wrap:wrap;gap:10px 22px;margin:24px 0}section{margin:54px 0;padding-top:12px;border-top:1px solid #343a40;scroll-margin-top:16px}img{display:block;width:100%;height:auto}.flow{max-width:960px;margin:20px auto}summary{cursor:pointer;padding:16px 0}a{text-decoration:none}a:hover{text-decoration:underline}p{margin:12px 0}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #343a40;vertical-align:top}.table-scroll{overflow-x:auto}.stats{font-size:19px;color:${colors.text};padding:12px 0}.coverage{padding:12px 0;border-bottom:1px solid #343a40}</style></head><body><main id="top"><h1>Litmatch — Sơ đồ kiến trúc và luồng xử lý</h1><p class="stats" data-product-count="${coverage.productGroups}" data-diagram-count="${coverage.diagramSections}" data-image-count="${coverage.imageCount}">${coverage.productGroups} nhóm sản phẩm · ${coverage.diagramSections} mục sơ đồ · ${coverage.imageCount} ảnh</p><p>Luồng ghi rõ thành phần xử lý và số bước ở đầu mỗi ô; dây ghi giao tiếp hoặc điều kiện. Matching Engine và các mục Profile/Privacy, Analytics, Realtime bổ sung cách đọc xuyên các thành phần.</p><details class="coverage"><summary>Đối chiếu đủ ${coverage.productGroups} nhóm sản phẩm</summary><div class="table-scroll"><table><thead><tr><th>#</th><th>Nhóm sản phẩm</th><th>Sơ đồ</th></tr></thead><tbody>${productTable}</tbody></table></div></details><details class="coverage"><summary>Đối chiếu ${coverage.implementedRegistryGroups} nhóm trong registry</summary><div class="table-scroll"><table><thead><tr><th>Registry ID</th><th>Sơ đồ</th></tr></thead><tbody>${registryTable}</tbody></table></div><p><a href="feature-coverage.json">Bảng coverage JSON</a> · <a href="render-verification.json">Kết quả kiểm tra ảnh</a></p></details><nav>${navigation}</nav>${sections}<h2>Mục còn deferred</h2><p>Các mục này được giữ đúng trạng thái trong registry.</p><div class="table-scroll"><table><thead><tr><th>Mục</th><th>Trạng thái</th><th>Ghi chú</th></tr></thead><tbody>${deferredTable}</tbody></table></div></main></body></html>`;
  writeFileSync(path.join(outputDir, 'README.md'), readme, 'utf8');
  writeFileSync(path.join(outputDir, 'index.html'), html, 'utf8');
  writeFileSync(
    path.join(outputDir, 'feature-coverage.json'),
    `${JSON.stringify(coverage, null, 2)}\n`,
    'utf8',
  );
}
