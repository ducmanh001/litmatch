// Crawlable reading aids only. review-module: N/A — no business implementation changes.
// Run after the published-code header transform. --check detects source/output drift.
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { featureCatalog } from './feature-catalog.mjs';
import { layerFlowCatalog } from './layer-flow-catalog.mjs';
import { dependencyCatalog } from './dependency-catalog.mjs';
import {
  extraFeatures,
  extraDependencies,
  extraLayerFlows,
} from './extra-feature-catalog.mjs';
import { drawDependencyArchitecture } from './architecture-layout.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SITE_URL = 'https://ducmanh001.github.io/litmatch-feature-flows/';
const PUBLIC_REPO = 'https://github.com/ducmanh001/litmatch-feature-flows';
export const AI_PATHS = Object.freeze([
  'llms.txt',
  'llms-full.txt',
  'sitemap.xml',
  'ai/index.html',
  'ai/index.json',
  'ai/flows.json',
]);
const diagramInputs = [
  'feature-catalog.mjs',
  'layer-flow-catalog.mjs',
  'dependency-catalog.mjs',
  'extra-feature-catalog.mjs',
  'architecture-layout.mjs',
];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const url = (relative) => `${SITE_URL}${relative}`;
const esc = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export function safeRelativePath(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    /[\\\0?#:]/u.test(value) ||
    path.posix.isAbsolute(value) ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error(`Unsafe relative path: ${value}`);
  return value;
}

export function currentAI_PATHS({ flows, diagrams }) {
  return [
    ...AI_PATHS,
    ...flows.map((flow) => `ai/flows/${safeRelativePath(flow.id)}.json`),
    ...diagrams.map(
      (diagram) => `ai/diagrams/${safeRelativePath(diagram.id)}.json`,
    ),
  ].sort();
}

export function isAiOutputPath(relative) {
  safeRelativePath(relative);
  return (
    AI_PATHS.includes(relative) ||
    /^ai\/flows\/[a-z\d-]+\/\d{2}-[a-z\d-]+\.json$/u.test(relative) ||
    /^ai\/diagrams\/[a-z\d-]+\.json$/u.test(relative)
  );
}

export function parseSteps(source, declaredSteps = []) {
  const lines = source.split(/\r?\n/u);
  const summaries = new Map();
  for (const line of lines) {
    const match = /^\/\/  Step (\d+):\s*(.+)$/u.exec(line);
    if (match) {
      const number = Number(match[1]);
      if (summaries.has(number))
        throw new Error(`Duplicate summary Step ${number}`);
      summaries.set(number, match[2]);
    }
  }
  return lines.flatMap((line, index) => {
    const match = /^\s*\/\/ Step (\d+):\s*(.+)$/u.exec(line);
    if (!match) return [];
    const number = Number(match[1]);
    const candidates = declaredSteps.filter((step) =>
      step.text?.startsWith(match[2]),
    );
    return [
      {
        number,
        text:
          summaries.get(number) ??
          (candidates.length === 1 ? candidates[0].text : match[2]),
        line: index + 1,
      },
    ];
  });
}

// Capture labels/edges from the actual renderer without loading diagram images.
export function architectureSummary(feature, dependency) {
  const label = (value) =>
    encodeURIComponent(Array.isArray(value) ? value.join('\n') : value);
  const component = (parts, _x, _y, _w, _h, value) =>
    parts.push(`<g data-label="${label(value)}" />`);
  const rendered = drawDependencyArchitecture(feature, dependency, {
    node: component,
    cylinder: component,
    connector: (parts, _path, _arrow, both) =>
      parts.push(`<g data-connector="true" data-both="${Boolean(both)}" />`),
    pill: (parts, _x, _y, _w, value) =>
      parts.push(`<g data-label="${label(value)}" />`),
    text: () => '',
    wrap: (value) => [String(value)],
    measure: (value) => String(value).length * 8,
    footer: () => 0,
    finish: (parts) => parts.join('\n'),
  });
  const components = [
    ...rendered.matchAll(/<g data-component="([^"]+)" data-label="([^"]*)"/gu),
  ].map((match) => ({ id: match[1], label: decodeURIComponent(match[2]) }));
  const edges = [
    ...rendered.matchAll(
      /<g data-connector="true" data-edge="([^"]+)" data-from="([^"]+)" data-to="([^"]+)" data-both="(true|false)"[^>]*\/>\s*<g data-edge-caption="[^"]+" data-label="([^"]*)"/gu,
    ),
  ].map((match) => ({
    id: match[1],
    from: match[2],
    to: match[3],
    bidirectional: match[4] === 'true',
    protocol: decodeURIComponent(match[5]),
  }));
  if (!components.length || !edges.length)
    throw new Error(`Empty architecture summary: ${feature.id}`);
  return { source: 'architecture-layout.mjs', components, edges };
}

function sequenceText(stages, prefix = '') {
  return stages.flatMap((stage, index) => {
    const position = `${prefix}${index + 1}`;
    if (!stage.branch)
      return [
        `${position}. ${stage.actor ? `${stage.actor}: ` : ''}${stage.text}${stage.edge ? ` [${stage.edge}]` : ''}`,
      ];
    return [
      `${position}. ${stage.actor ? `${stage.actor}: ` : ''}${stage.branch}`,
      ...(stage.options ?? []).flatMap((option, optionIndex) => [
        `${position}.${optionIndex + 1}. ${option.label}${option.continues === false ? ' [continues=false]' : ''}${option.text ? `: ${option.text}` : ''}`,
        ...sequenceText(option.steps ?? [], `${position}.${optionIndex + 1}.`),
      ]),
    ];
  });
}

const readingGuide = [
  'These are curated, catalog-driven code walkthroughs and diagram projections, not executable TypeScript or production-readiness evidence. Basic CRUD and other context may be omitted.',
  'Read the numbered Steps in order, then the body and its tier headers. Selected called bodies appear after their call. The selection is controlled by source ranges, helpers, skip and attach metadata; it is not a complete automatically expanded call graph.',
  '[CONTROLLER], [SERVICE], [WORKER], [POSTGRES], [REDIS], [KAFKA], [BULLMQ], [EXTERNAL] and [GATEWAY] label responsibilities or infrastructure. Source paths and original line ranges may remain in headers.',
  'The walkthrough flattens source scopes. Repeated variable names, return statements and constructor groups can belong to different original functions or classes; retain that scope when interpreting the code. It is a reading aid, not code to compile or run.',
  'Constructor groups retain dependencies selected by the walkthrough catalog. Generated const bindings connect call arguments to expanded parameters. Some simple helper return expressions are substituted; other calls may stay unexpanded. See sourceContext and omittedContext before drawing dependency conclusions.',
  'Inline why-comments retain their exact src evidence in each flow chunk. src can cite a source comment, document, or stated inference; treat it as the catalog attribution rather than independently verified proof.',
  'Each Step links to the HTML line anchor and the public GitHub raw-file view at that line. rawUrl serves the full plain TypeScript file; code.content and code.sha256 preserve its exact contents and SHA-256 digest. No image reading or JavaScript execution is needed.',
  'Diagram chunks preserve all feature, layer-flow and dependency catalog fields, including explicit actors, ordering, branch labels/conditions, continuation flags, entities, Redis roles, providers, protocols and notes. Architecture components and protocol edges come from the actual renderer.',
  'Canonical source, service contracts and ADRs own behavior. The diagrams describe the catalogs; this site does not independently certify deployment/provider readiness.',
];

function sourceContext(endpoint) {
  return {
    items: endpoint.items ?? [],
    ranges: (endpoint.items ?? []).flatMap((item) =>
      (item.ranges ?? []).map((range) => ({
        file: typeof range === 'object' ? (range.file ?? item.file) : item.file,
        range,
      })),
    ),
    helpers: (endpoint.items ?? []).flatMap((item) =>
      (item.helpers ?? []).map((helper) => ({
        ownerFile: item.file,
        ...helper,
      })),
    ),
    skip: endpoint.skip ?? [],
    attach: endpoint.attach ?? {},
    nested: endpoint.nested ?? false,
  };
}

function flowText(flow) {
  const pairs = (title, rows) => [
    `### ${title}`,
    '',
    ...(rows.length
      ? rows.map(([name, role]) => `- ${name}: ${role}`)
      : ['- None declared.']),
    '',
  ];
  return [
    `## ${flow.feature} — ${flow.name}`,
    '',
    `${flow.method} ${flow.route}`,
    '',
    flow.title,
    '',
    `Flow: ${flow.flow}`,
    '',
    `- HTML: ${flow.htmlUrl}`,
    `- Raw TypeScript: ${flow.rawUrl}`,
    `- JSON chunk: ${flow.chunkUrl}`,
    `- Code SHA-256: ${flow.code.sha256}`,
    '',
    ...pairs('Roles', flow.roles),
    ...pairs('Tables and roles', flow.tables),
    ...pairs('Redis keys and roles', flow.redis),
    ...pairs('Related modules', flow.related),
    '### Full Steps',
    '',
    ...flow.steps.map(
      (step) =>
        `${step.number}. ${step.text}\n   HTML: ${step.htmlUrl}\n   Raw-file line: ${step.rawLineUrl}`,
    ),
    '',
    '### Why-comments and exact src attribution',
    '',
    ...flow.whyComments.map(
      (comment) =>
        `- ${comment.text.join(' ')}\n  at: ${comment.at}\n  src: ${comment.src}\n  source: ${comment.file}`,
    ),
    '',
    '### Source selection and omitted context',
    '',
    flow.omittedContext.note,
    '',
    '```json',
    json({
      sources: flow.sources,
      sourceContext: flow.sourceContext,
      omittedContext: flow.omittedContext,
      sourceManifest: flow.sourceManifest,
    }).trimEnd(),
    '```',
    '',
    '### Complete annotated code',
    '',
    '```typescript',
    flow.code.content.trimEnd(),
    '```',
    '',
  ].join('\n');
}

function diagramText(diagram) {
  return [
    `## Diagram: ${diagram.title}`,
    '',
    `- Visual page: ${diagram.url}`,
    `- JSON chunk: ${diagram.chunkUrl}`,
    '',
    '### Feature sequence and conditions',
    '',
    ...diagram.featureSequence,
    '',
    '### Layer sequence and protocols',
    '',
    ...diagram.layerSequence,
    '',
    '### Architecture components',
    '',
    ...diagram.architecture.components.map(
      (component) => `- ${component.id}: ${component.label}`,
    ),
    '',
    '### Architecture edges',
    '',
    ...diagram.architecture.edges.map(
      (edge) =>
        `- ${edge.from} ${edge.bidirectional ? '↔' : '→'} ${edge.to}: ${edge.protocol}`,
    ),
    '',
    '### Complete diagram catalogs, notes and provenance',
    '',
    '```json',
    json({
      feature: diagram.feature,
      layerFlow: diagram.layerFlow,
      dependencies: diagram.dependencies,
      provenance: diagram.provenance,
    }).trimEnd(),
    '```',
    '',
  ].join('\n');
}

function htmlIndex(payload) {
  const link = (href, title) => `<a href="${esc(href)}">${esc(title)}</a>`;
  const pairs = (title, rows) =>
    `<h3>${title}</h3><ul>${rows.map(([name, role]) => `<li><strong>${esc(name)}</strong>: ${esc(role)}</li>`).join('')}</ul>`;
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Litmatch — text and code index for crawlers</title><link rel="canonical" href="${url('ai/index.html')}"><style>body{font:16px/1.6 system-ui,sans-serif;max-width:1000px;margin:2rem auto;padding:0 1rem;color:#162433}a{color:#1458a1}article,section{margin:2rem 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}code{overflow-wrap:anywhere}</style></head><body>
<h1>Litmatch: diagrams and code in text</h1><p>${esc(payload.evidence)}</p>
<nav>${AI_PATHS.filter((relative) => relative !== 'ai/index.html')
    .map((relative) => link(url(relative), relative))
    .join(
      ' · ',
    )} · ${link(SITE_URL, 'Visual diagrams')} · ${link(url('code/index.html'), 'Code overview')}</nav>
<section><h2>Reading guide</h2>${readingGuide.map((text) => `<p>${esc(text)}</p>`).join('\n')}</section>
<nav><h2>All ${payload.flows.length} code flows</h2><ul>${payload.flows.map((flow) => `<li>${link(`#flow-${flow.id.replaceAll('/', '-')}`, `${flow.feature} — ${flow.name}`)} · ${link(flow.chunkUrl, 'JSON with complete code')} · ${link(flow.htmlUrl, 'HTML')} · ${link(flow.rawUrl, 'raw TypeScript')}</li>`).join('\n')}</ul><h2>All ${payload.diagrams.length} diagrams</h2><ul>${payload.diagrams.map((diagram) => `<li>${link(`#diagram-${diagram.id}`, diagram.title)} · ${link(diagram.chunkUrl, 'complete diagram JSON')}</li>`).join('\n')}</ul></nav>
${payload.flows.map((flow) => `<article id="flow-${flow.id.replaceAll('/', '-')}"><h2>${esc(flow.feature)} — ${esc(flow.name)}</h2><p><code>${esc(flow.method)} ${esc(flow.route)}</code></p><p>${esc(flow.title)}</p><p>${esc(flow.flow)}</p><p>${link(flow.chunkUrl, 'Complete metadata and code JSON')} · ${link(flow.htmlUrl, 'HTML walkthrough')} · ${link(flow.rawUrl, 'Plain TypeScript')}</p>${pairs('Roles', flow.roles)}${pairs('Tables and roles', flow.tables)}${pairs('Redis keys and roles', flow.redis)}${pairs('Related modules', flow.related)}<h3>Full Steps</h3><ol>${flow.steps.map((step) => `<li>${esc(step.text)} — ${link(step.htmlUrl, 'HTML line')} · ${link(step.rawLineUrl, 'raw-file line')}</li>`).join('')}</ol><h3>Why-comments and exact src</h3><ul>${flow.whyComments.map((comment) => `<li>${esc(comment.text.join(' '))}<br><code>src: ${esc(comment.src)}</code></li>`).join('')}</ul><p>${esc(flow.omittedContext.note)}</p><p>Code SHA-256: <code>${flow.code.sha256}</code>. Source selection, helpers, skip and attach are preserved in ${link(flow.chunkUrl, 'the flow chunk')}.</p></article>`).join('\n')}
${payload.diagrams.map((diagram) => `<article id="diagram-${diagram.id}"><h2>${esc(diagram.title)}</h2><p>${link(diagram.url, 'Visual diagram')} · ${link(diagram.chunkUrl, 'Complete catalog JSON')}</p><h3>Feature sequence and conditions</h3><pre>${esc(diagram.featureSequence.join('\n'))}</pre><h3>Layer sequence and protocols</h3><pre>${esc(diagram.layerSequence.join('\n'))}</pre><h3>Architecture labels and edges</h3><ul>${diagram.architecture.components.map((component) => `<li>${esc(component.id)}: ${esc(component.label)}</li>`).join('')}${diagram.architecture.edges.map((edge) => `<li>${esc(edge.from)} ${edge.bidirectional ? '↔' : '→'} ${esc(edge.to)}: ${esc(edge.protocol)}</li>`).join('')}</ul><h3>Dependencies, provider conditions and notes</h3><pre>${esc(json({ core: diagram.feature.core, archNotes: diagram.feature.archNotes, flowNotes: diagram.feature.flowNotes, dependencies: diagram.dependencies, layerNotes: Object.fromEntries(Object.entries(diagram.layerFlow).filter(([key]) => key !== 'stages')) }))}</pre></article>`).join('\n')}
</body></html>\n`;
}

export async function buildAiFiles(sourceDir = here) {
  const catalogFiles = readdirSync(sourceDir)
    .filter(
      (file) =>
        /^annotated-.+\.mjs$/u.test(file) && file !== 'annotated-source.mjs',
    )
    .sort();
  const annotated = [];
  for (const file of catalogFiles) {
    const { annotatedFeatures } = await import(
      pathToFileURL(path.join(sourceDir, file)).href
    );
    if (!Array.isArray(annotatedFeatures))
      throw new Error(`Missing annotatedFeatures: ${file}`);
    for (const feature of annotatedFeatures)
      annotated.push({
        feature,
        catalog: file,
        catalogSha256: sha256(readFileSync(path.join(sourceDir, file))),
      });
  }
  const ids = new Set();
  const flows = annotated
    .sort((a, b) => a.feature.id.localeCompare(b.feature.id))
    .flatMap(({ feature, catalog, catalogSha256 }) =>
      feature.endpoints.map((endpoint) => {
        const id = safeRelativePath(
          `${feature.id}/${endpoint.n}-${endpoint.slug}`,
        );
        if (ids.has(id)) throw new Error(`Duplicate flow: ${id}`);
        ids.add(id);
        const relative = `code/${id}.ts`;
        const bytes = readFileSync(path.join(sourceDir, relative));
        const source = bytes.toString('utf8');
        const digest = sha256(bytes);
        const manifestFile = path.join(
          sourceDir,
          relative.replace(/\.ts$/u, '.sources.json'),
        );
        const manifest = existsSync(manifestFile)
          ? JSON.parse(readFileSync(manifestFile, 'utf8'))
          : null;
        if (manifest?.codeSha256 && manifest.codeSha256 !== digest)
          throw new Error(`Stale source manifest: ${id}`);
        const verified = manifest?.codeSha256 === digest;
        const context = sourceContext(endpoint);
        const sources = [
          ...new Set([
            ...(verified ? (manifest.sources ?? []) : []),
            ...(endpoint.items ?? [])
              .flatMap((item) => [
                item.file,
                ...(item.ranges ?? []).map((range) => range?.file),
                ...(item.helpers ?? []).map((helper) => helper.file),
              ])
              .filter(Boolean),
          ]),
        ].sort();
        const steps = parseSteps(source, endpoint.steps ?? []);
        if (
          !steps.length ||
          steps.some((step, index) => step.number !== index + 1)
        )
          throw new Error(`Missing or nonsequential Steps: ${id}`);
        const htmlUrl = url(`code/${id}.html`);
        const htmlFile = path.join(sourceDir, `code/${id}.html`);
        const html = existsSync(htmlFile)
          ? readFileSync(htmlFile, 'utf8')
          : null;
        const linkedSteps = steps.map((step) => {
          if (html && !new RegExp(`id=["']L${step.line}["']`, 'u').test(html))
            throw new Error(`Missing HTML Step anchor: ${id}#L${step.line}`);
          return {
            ...step,
            htmlUrl: `${htmlUrl}#L${step.line}`,
            rawLineUrl: `${PUBLIC_REPO}/blob/main/${relative}#L${step.line}`,
          };
        });
        const whyComments = (endpoint.items ?? []).flatMap((item) =>
          (item.inline ?? []).map((comment) => {
            if (!comment.src)
              throw new Error(`Why comment without src: ${id}: ${comment.at}`);
            return {
              ...comment,
              text: Array.isArray(comment.text) ? comment.text : [comment.text],
              file: item.file,
            };
          }),
        );
        const { endpoints: _endpoints, ...featureMetadata } = feature;
        return {
          id,
          featureId: feature.id,
          feature: feature.title,
          summary: feature.summary,
          name: endpoint.name,
          title: endpoint.title,
          method: endpoint.method,
          route: endpoint.route,
          rawUrl: url(relative),
          htmlUrl,
          chunkUrl: url(`ai/flows/${id}.json`),
          diagramUrl: `${SITE_URL}#${feature.diagramAnchor ?? feature.id}`,
          catalog,
          flow: endpoint.flow,
          roles: endpoint.roles ?? [],
          tables: endpoint.tables ?? [],
          redis: endpoint.redis ?? [],
          related: endpoint.related ?? [],
          steps: linkedSteps,
          declaredSteps: endpoint.steps ?? [],
          whyComments,
          sources,
          sourceContext: context,
          omittedContext: {
            note: 'Curated source selection; unlisted call bodies, shared request infrastructure, DTOs and other context may be omitted. skip names stay unexpanded; helpers may be substituted; attach controls placement. Flattened scopes are not executable code.',
            skip: context.skip,
            attach: context.attach,
            helpers: context.helpers,
          },
          featureMetadata,
          endpointCatalog: endpoint,
          sourceManifest: verified
            ? { verifiedCodeSha256: true, ...manifest }
            : {
                verifiedCodeSha256: false,
                status: manifest
                  ? 'Unverified sidecar ignored; catalog and displayed code used.'
                  : 'No sidecar; catalog and displayed code used.',
              },
          code: {
            path: relative,
            sha256: digest,
            hashAlgorithm: 'sha256',
            content: source,
          },
          provenance: {
            catalog: { path: catalog, sha256: catalogSha256 },
            displayedCodeSha256: digest,
          },
        };
      }),
    );
  if (!flows.length) throw new Error('No annotated flows found');
  const dependencies = { ...dependencyCatalog, ...extraDependencies };
  const layers = { ...layerFlowCatalog, ...extraLayerFlows };
  const inputHashes = diagramInputs.map((file) => ({
    path: file,
    sha256: sha256(readFileSync(path.join(here, file))),
  }));
  const diagrams = [...featureCatalog, ...Object.values(extraFeatures)]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((feature) => {
      safeRelativePath(feature.id);
      const dependency = dependencies[feature.id];
      const layer = layers[feature.id];
      if (!dependency || !layer)
        throw new Error(`Missing diagram catalog: ${feature.id}`);
      return {
        id: feature.id,
        title: feature.title,
        url: `${SITE_URL}#${feature.id}`,
        chunkUrl: url(`ai/diagrams/${feature.id}.json`),
        feature,
        layerFlow: layer,
        dependencies: dependency,
        architecture: architectureSummary(feature, dependency),
        featureSequence: sequenceText(feature.flow ?? []),
        layerSequence: sequenceText(layer.stages ?? []),
        provenance: { inputs: inputHashes },
      };
    });
  const payload = {
    schemaVersion: 2,
    siteUrl: SITE_URL,
    evidence:
      'Generated reading aids from curated source catalogs and displayed code; not executable applications or production-readiness evidence.',
    readingGuide,
    flows,
    diagrams,
  };
  const paths = currentAI_PATHS(payload);
  for (const relative of paths)
    if (!isAiOutputPath(relative))
      throw new Error(`Unpublishable AI path: ${relative}`);
  const featureIds = [...new Set(flows.map((flow) => flow.featureId))];
  const urls = [
    ...new Set([
      SITE_URL,
      url('code/index.html'),
      url('code/README.md'),
      ...paths.map(url),
      ...featureIds.flatMap((id) => [
        url(`code/${id}/index.html`),
        url(`code/${id}/README.md`),
      ]),
      ...flows.flatMap((flow) => [flow.rawUrl, flow.htmlUrl]),
    ]),
  ].sort();
  payload.inventory = {
    paths,
    urls,
    flowCount: flows.length,
    diagramCount: diagrams.length,
  };
  const index = {
    schemaVersion: payload.schemaVersion,
    siteUrl: SITE_URL,
    evidence: payload.evidence,
    readingGuide,
    resources: AI_PATHS.map((relative) => ({
      path: relative,
      url: url(relative),
    })),
    flows: flows.map((flow) => ({
      id: flow.id,
      title: flow.title,
      name: flow.name,
      feature: flow.feature,
      method: flow.method,
      route: flow.route,
      flow: flow.flow,
      chunkUrl: flow.chunkUrl,
      htmlUrl: flow.htmlUrl,
      rawUrl: flow.rawUrl,
      codeSha256: flow.code.sha256,
      steps: flow.steps,
    })),
    diagrams: diagrams.map((diagram) => ({
      id: diagram.id,
      title: diagram.title,
      chunkUrl: diagram.chunkUrl,
      url: diagram.url,
    })),
    inventory: payload.inventory,
  };
  const llms = [
    '# Litmatch feature flows',
    '',
    `> ${payload.evidence}`,
    '',
    '## Crawl entrypoints',
    '',
    `- [Static text index](${url('ai/index.html')}): ordinary HTML links to all ${flows.length} code flows and ${diagrams.length} diagram chunks; no JavaScript or images required.`,
    `- [Complete text and code](${url('llms-full.txt')}): reading guide, full metadata, Steps, evidence, diagram labels/conditions and complete displayed code.`,
    `- [Machine index](${url('ai/index.json')}): small URL inventory and flow/diagram chunk links.`,
    `- [Full JSON bundle](${url('ai/flows.json')}): all metadata, catalog selections, code contents and SHA-256 digests.`,
    `- [Sitemap](${url('sitemap.xml')}): every generated AI resource plus code overview, feature pages and raw/HTML walkthroughs.`,
    '',
    '## Reading guide',
    '',
    ...readingGuide.map((text) => `- ${text}`),
    '',
    `## All ${flows.length} raw code flows`,
    '',
    ...flows.map(
      (flow) =>
        `- [${flow.feature} — ${flow.name}](${flow.rawUrl}): ${flow.method} ${flow.route}; [complete metadata and code](${flow.chunkUrl}).`,
    ),
    '',
    `## All ${diagrams.length} text diagram chunks`,
    '',
    ...diagrams.map(
      (diagram) =>
        `- [${diagram.title}](${diagram.chunkUrl}): feature sequence, actors, branches/conditions, dependencies and architecture edges.`,
    ),
    '',
  ].join('\n');
  const files = {
    'llms.txt': llms,
    'llms-full.txt': [
      '# Litmatch — complete text, diagram catalogs and annotated code',
      '',
      payload.evidence,
      '',
      '## Reading guide',
      '',
      ...readingGuide.map((text) => `- ${text}`),
      '',
      '## Code flows',
      '',
      ...flows.map(flowText),
      '## Diagrams in text',
      '',
      ...diagrams.map(diagramText),
    ].join('\n'),
    'ai/index.html': htmlIndex(payload),
    'ai/index.json': json(index),
    'ai/flows.json': json(payload),
    'sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((value) => `  <url><loc>${esc(value)}</loc></url>`).join('\n')}\n</urlset>\n`,
  };
  for (const flow of flows) files[`ai/flows/${flow.id}.json`] = json(flow);
  for (const diagram of diagrams)
    files[`ai/diagrams/${diagram.id}.json`] = json(diagram);
  return files;
}

export async function generateAi({ sourceDir = here, check = false } = {}) {
  const files = await buildAiFiles(sourceDir);
  for (const [relative, contents] of Object.entries(files)) {
    const destination = path.join(sourceDir, relative);
    if (check) {
      if (
        !existsSync(destination) ||
        readFileSync(destination, 'utf8') !== contents
      )
        throw new Error(`Stale ${relative}; run generate-ai.mjs`);
    } else {
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, contents);
    }
  }
  return JSON.parse(files['ai/flows.json']);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const unknown = process.argv.slice(2).filter((arg) => arg !== '--check');
  if (unknown.length)
    throw new Error(`Unknown arguments: ${unknown.join(' ')}`);
  const result = await generateAi({ check: process.argv.includes('--check') });
  console.log(
    `AI docs ${process.argv.includes('--check') ? 'current' : 'generated'}: ${result.flows.length} flows, ${result.diagrams.length} diagrams, ${result.inventory.paths.length} files`,
  );
}
