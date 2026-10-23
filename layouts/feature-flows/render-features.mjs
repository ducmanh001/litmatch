import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { featureCatalog as originalFeatureCatalog } from './feature-catalog.mjs';
import { dependencyCatalog as originalDependencyCatalog } from './dependency-catalog.mjs';
import {
  extraFeatures,
  extraDependencies,
  extraLayerFlows,
} from './extra-feature-catalog.mjs';
import { layerFlowCatalog as existingLayerFlows } from './layer-flow-catalog.mjs';
import {
  productCapabilities,
  registryCoverage,
  deferredCoverage,
} from './feature-coverage.mjs';
import { drawDependencyArchitecture } from './architecture-layout.mjs';
import { drawLayerFlow } from './flow-layout.mjs';
import {
  checkFeatureCoverage,
  writeCompleteGallery,
} from './gallery-layout.mjs';

const featureCatalog = [
  ...originalFeatureCatalog,
  ...Object.values(extraFeatures),
].sort((a, b) => a.id.localeCompare(b.id));
const dependencyCatalog = {
  ...originalDependencyCatalog,
  ...extraDependencies,
};
const layerFlowCatalog = { ...existingLayerFlows, ...extraLayerFlows };

// Reuse the visual primitives of generate.mjs / matchingSvg().
// Measure the actual font before laying out text; never guess by character count.
const colors = {
  background: '#121314',
  node: '#0d273f',
  nodeBorder: '#1c354b',
  text: '#83c3ff',
  line: '#666666',
  accent: '#68a9e0',
  prose: '#b8bec5',
};
const font = '"trebuchet ms", verdana, arial, sans-serif';
const outputDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(outputDir, '../..');
const coverage = checkFeatureCoverage(
  featureCatalog,
  dependencyCatalog,
  layerFlowCatalog,
  { productCapabilities, registryCoverage, deferredCoverage },
  repoDir,
);
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7);
const selected = only
  ? featureCatalog.filter((feature) => feature.id === only)
  : featureCatalog;
if (selected.length === 0) throw new Error(`Unknown feature: ${only}`);
const protectedFiles = [
  '00-project-architecture',
  '01-matching-queue-flow',
  '10-matching-speed-up',
  '14-preference-khi-matching',
]
  .flatMap((id) =>
    ['png', 'svg'].map((extension) =>
      path.join(outputDir, `${id}.${extension}`),
    ),
  )
  .filter(existsSync);
const hash = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex');
const before = new Map(protectedFiles.map((file) => [file, hash(file)]));
const escape = (text) =>
  String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
let metrics;

function measure(text, size, weight = 600) {
  const key = `${size}:${weight}`;
  return [...String(text)].reduce(
    (total, character) => total + (metrics[key][character] ?? metrics[key].M),
    0,
  );
}

function wrap(text, maxWidth, size, weight = 600) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/u).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure(candidate, size, weight) > maxWidth) {
        lines.push(line);
        line = word;
      } else line = candidate;
      if (measure(line, size, weight) > maxWidth)
        throw new Error(`Unbreakable text is too wide: ${line}`);
    }
    lines.push(line);
  }
  return lines;
}

function text(
  x,
  firstBaseline,
  lines,
  size = 24,
  weight = 600,
  anchor = 'middle',
  fill = colors.text,
  lineHeight = size + 6,
) {
  return `<text font-family='${font}' font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}">${lines.map((line, index) => `<tspan x="${x}" y="${firstBaseline + index * lineHeight}">${escape(line)}</tspan>`).join('')}</text>`;
}

function node(
  parts,
  x,
  y,
  width,
  height,
  label,
  size = 24,
  capsule = false,
  dashed = false,
) {
  const lines = wrap(label, width - 44, size);
  const lineHeight = size + 6;
  const baseline =
    y + height / 2 - ((lines.length - 1) * lineHeight) / 2 + size * 0.34;
  parts.push(
    `<g data-container="${escape(label.split('\n')[0])}" data-x="${x}" data-y="${y}" data-w="${width}" data-h="${height}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${capsule ? Math.min(24, height / 2) : 26}" fill="${capsule ? colors.background : colors.node}" stroke="${capsule ? colors.accent : colors.nodeBorder}" stroke-width="2"${dashed ? ' stroke-dasharray="4 4"' : ''}/>${text(x + width / 2, baseline, lines, size)}</g>`,
  );
}

function cylinder(parts, x, y, width, height, label) {
  const ry = 15;
  const lines = wrap(label, width - 16, 18);
  const baseline = y + height / 2 - ((lines.length - 1) * 24) / 2 + 13;
  parts.push(
    `<g data-container="${escape(label)}" data-x="${x}" data-y="${y}" data-w="${width}" data-h="${height}"><path d="M ${x} ${y + ry} V ${y + height - ry} C ${x} ${y + height + 5} ${x + width} ${y + height + 5} ${x + width} ${y + height - ry} V ${y + ry} Z" fill="${colors.node}" stroke="${colors.nodeBorder}" stroke-width="2"/><ellipse cx="${x + width / 2}" cy="${y + ry}" rx="${width / 2}" ry="${ry}" fill="${colors.node}" stroke="${colors.nodeBorder}" stroke-width="2"/>${text(x + width / 2, baseline, lines, 18, 600, 'middle', colors.text, 24)}</g>`,
  );
}

function connector(parts, d, arrow = true, bidirectional = false) {
  parts.push(
    `<path data-connector="true" d="${d}" fill="none" stroke="${colors.line}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${arrow ? ' marker-end="url(#arrow)"' : ''}${bidirectional ? ' marker-start="url(#arrow)"' : ''}/>`,
  );
}

function pill(parts, x, centerY, maxWidth, label, size = 17) {
  const lines = wrap(label, maxWidth - 44, size);
  const width = Math.min(
    maxWidth,
    Math.max(...lines.map((line) => measure(line, size))) + 44,
  );
  const height = Math.max(34, lines.length * (size + 6) + 12);
  node(parts, x, centerY - height / 2, width, height, label, size, true);
}

function footer(parts, y, width, feature, notes, architecture) {
  const margin = architecture ? 28 : 32;
  const size = architecture ? 20 : 23;
  const lineHeight = architecture ? 28 : 33;
  const maxWidth = width - 2 * margin;
  y += architecture ? 30 : 38;
  parts.push(
    `<line x1="${margin}" x2="${width - margin}" y1="${y}" y2="${y}" stroke="#343a40" stroke-width="1"/>`,
  );
  y += architecture ? 42 : 52;
  for (const [key, heading] of [
    ['important', 'Điểm quan trọng'],
    ['caution', 'Lưu ý'],
    ['followup', 'Luồng tiếp theo'],
  ]) {
    if (!notes[key]) continue;
    parts.push(
      text(
        margin,
        y,
        [heading],
        architecture ? 21 : 24,
        700,
        'start',
        colors.prose,
      ),
    );
    const lines = wrap(notes[key], maxWidth, size, 400);
    y += architecture ? 32 : 37;
    parts.push(
      `<g data-note="${key}">${text(margin, y, lines, size, 400, 'start', colors.prose, lineHeight)}</g>`,
    );
    y += lines.length * lineHeight + (architecture ? 22 : 28);
  }
  const sourceLines = wrap(
    `Nguồn: ${feature.sources.slice(0, 3).join(' · ')}${feature.sources.length > 3 ? ' · Chi tiết: render-verification.json' : ''}`,
    maxWidth,
    17,
    400,
  );
  parts.push(
    text(margin, y + 2, sourceLines, 17, 400, 'start', colors.accent, 25),
  );
  return y + sourceLines.length * 25 + 36;
}

function finish(parts, width, height, feature, type) {
  return {
    width,
    height: Math.ceil(height),
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.ceil(height)}" viewBox="0 0 ${width} ${Math.ceil(height)}" role="img" aria-label="${escape(`${feature.title} — ${type}`)}"><title>${escape(`${feature.title} — ${type}`)}</title><rect width="100%" height="100%" fill="${colors.background}"/><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10" fill="none" stroke="${colors.line}" stroke-width="1.4"/></marker></defs>${parts.join('')}</svg>`,
  };
}

function flowSvg(feature) {
  return drawLayerFlow(feature, layerFlowCatalog[feature.id], {
    colors,
    connector,
    pill,
    text,
    wrap,
    measure,
    footer,
    finish,
  });
}

function architectureSvg(feature) {
  const dependency = dependencyCatalog[feature.id];
  if (!dependency)
    throw new Error(`Missing full dependency map: ${feature.id}`);
  return drawDependencyArchitecture(feature, dependency, {
    colors,
    node,
    cylinder,
    connector,
    pill,
    text,
    wrap,
    measure,
    footer,
    finish,
  });
}

async function validate(page, featureId, kind) {
  const problems = await page.evaluate((diagramKind) => {
    const elements = [...document.querySelectorAll('g[data-container]')];
    const issues = [];
    const boxes = elements.map((element) => ({
      element,
      label: element.dataset.container,
      x: Number(element.dataset.x),
      y: Number(element.dataset.y),
      w: Number(element.dataset.w),
      h: Number(element.dataset.h),
      component: element.dataset.component,
      captionFor: element.dataset.edgeCaption,
    }));
    for (const box of boxes) {
      for (const element of box.element.querySelectorAll('text')) {
        const bounds = element.getBBox();
        if (
          bounds.x < box.x + 3 ||
          bounds.y < box.y + 2 ||
          bounds.x + bounds.width > box.x + box.w - 3 ||
          bounds.y + bounds.height > box.y + box.h - 2
        ) {
          issues.push(`Text outside node: ${box.label}`);
        }
      }
    }
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (
          a.x < b.x + b.w - 1 &&
          a.x + a.w > b.x + 1 &&
          a.y < b.y + b.h - 1 &&
          a.y + a.h > b.y + 1
        ) {
          issues.push(`Overlapping nodes/labels: ${a.label} / ${b.label}`);
        }
      }
    }
    const notes = [...document.querySelectorAll('g[data-note]')].map((group) =>
      group.getBBox(),
    );
    for (let i = 1; i < notes.length; i += 1)
      if (notes[i].y < notes[i - 1].y + notes[i - 1].height + 10)
        issues.push('Note paragraphs overlap');
    // All connector paths are orthogonal. Shared forks/merges are allowed;
    // an intersection in the interior of two different lanes is not.
    const paths = [...document.querySelectorAll('path[data-connector]')].map(
      (element) => {
        const commands = element
          .getAttribute('d')
          .match(/[MHV]|-?\d+(?:\.\d+)?/gu);
        const segments = [];
        let x = 0;
        let y = 0;
        let i = 0;
        let start;
        while (i < commands.length) {
          const command = commands[i++];
          if (command === 'M') {
            x = Number(commands[i++]);
            y = Number(commands[i++]);
            start ??= { x, y };
            continue;
          }
          const nextX = command === 'H' ? Number(commands[i++]) : x;
          const nextY = command === 'V' ? Number(commands[i++]) : y;
          if (x !== nextX || y !== nextY)
            segments.push({ x1: x, y1: y, x2: nextX, y2: nextY });
          x = nextX;
          y = nextY;
        }
        segments.edge = element.dataset.edge;
        segments.from = element.dataset.from;
        segments.to = element.dataset.to;
        segments.start = start;
        segments.end = { x, y };
        return segments;
      },
    );
    const inside = (value, start, end) =>
      value > Math.min(start, end) + 1 && value < Math.max(start, end) - 1;
    for (let i = 0; i < paths.length; i += 1)
      for (let j = i + 1; j < paths.length; j += 1) {
        for (const a of paths[i])
          for (const b of paths[j]) {
            const horizontal = a.y1 === a.y2 ? a : b;
            const vertical = a.y1 === a.y2 ? b : a;
            if (horizontal.y1 !== horizontal.y2 || vertical.x1 !== vertical.x2)
              continue;
            if (
              inside(vertical.x1, horizontal.x1, horizontal.x2) &&
              inside(horizontal.y1, vertical.y1, vertical.y2)
            ) {
              issues.push('Connector lanes cross');
            }
          }
      }
    const solidBoxes = boxes.filter((box) => {
      const rectangle = box.element.querySelector('rect');
      return !rectangle || rectangle.getAttribute('fill') !== '#121314';
    });
    for (const segments of paths)
      for (const segment of segments)
        for (const box of solidBoxes) {
          const vertical = segment.x1 === segment.x2;
          const crosses = vertical
            ? inside(segment.x1, box.x, box.x + box.w) &&
              Math.max(segment.y1, segment.y2) > box.y + 2 &&
              Math.min(segment.y1, segment.y2) < box.y + box.h - 2
            : inside(segment.y1, box.y, box.y + box.h) &&
              Math.max(segment.x1, segment.x2) > box.x + 2 &&
              Math.min(segment.x1, segment.x2) < box.x + box.w - 2;
          if (crosses)
            issues.push(`Connector passes through node: ${box.label}`);
        }
    if (diagramKind === 'architecture' || diagramKind === 'flow') {
      for (const box of solidBoxes)
        if (!box.component)
          issues.push(
            `Architecture node lacks component metadata: ${box.label}`,
          );
      const components = new Map(
        boxes.filter((box) => box.component).map((box) => [box.component, box]),
      );
      const edgeIds = new Set();
      const attached = (point, box) => {
        if (!point || !box) return false;
        const between = (value, lower, upper) =>
          value >= lower - 4 && value <= upper + 4;
        return (
          ((Math.abs(point.x - box.x) <= 4 ||
            Math.abs(point.x - (box.x + box.w)) <= 4) &&
            between(point.y, box.y, box.y + box.h)) ||
          ((Math.abs(point.y - box.y) <= 4 ||
            Math.abs(point.y - (box.y + box.h)) <= 4) &&
            between(point.x, box.x, box.x + box.w))
        );
      };
      for (const edge of paths) {
        if (!edge.edge || !edge.from || !edge.to) {
          issues.push('Architecture connector lacks component metadata');
          continue;
        }
        if (edgeIds.has(edge.edge)) issues.push(`Duplicate edge: ${edge.edge}`);
        edgeIds.add(edge.edge);
        if (!attached(edge.start, components.get(edge.from)))
          issues.push(`Detached connector source: ${edge.edge} / ${edge.from}`);
        if (!attached(edge.end, components.get(edge.to)))
          issues.push(`Detached connector target: ${edge.edge} / ${edge.to}`);
        const captions = boxes.filter((box) => box.captionFor === edge.edge);
        if (!captions.length)
          issues.push(`Architecture connector has no caption: ${edge.edge}`);
        for (const caption of captions) {
          const center = {
            x: caption.x + caption.w / 2,
            y: caption.y + caption.h / 2,
          };
          const onWire = edge.some((segment) => {
            const horizontal = segment.y1 === segment.y2;
            return horizontal
              ? Math.abs(center.y - segment.y1) <= 1 &&
                  center.x >= Math.min(segment.x1, segment.x2) - 1 &&
                  center.x <= Math.max(segment.x1, segment.x2) + 1
              : Math.abs(center.x - segment.x1) <= 1 &&
                  center.y >= Math.min(segment.y1, segment.y2) - 1 &&
                  center.y <= Math.max(segment.y1, segment.y2) + 1;
          });
          if (!onWire) issues.push(`Caption is off its wire: ${edge.edge}`);
        }
      }
      for (const caption of boxes.filter((box) => box.captionFor))
        if (!edgeIds.has(caption.captionFor))
          issues.push(
            `Caption refers to a missing edge: ${caption.captionFor}`,
          );
      for (const [id] of components)
        if (!paths.some((edge) => edge.from === id || edge.to === id))
          issues.push(`Component has no connection: ${id}`);
      for (const edge of paths)
        for (const segment of edge)
          for (const caption of boxes.filter((box) => box.captionFor)) {
            if (caption.captionFor === edge.edge) continue;
            const vertical = segment.x1 === segment.x2;
            const crosses = vertical
              ? inside(segment.x1, caption.x, caption.x + caption.w) &&
                Math.max(segment.y1, segment.y2) > caption.y + 2 &&
                Math.min(segment.y1, segment.y2) < caption.y + caption.h - 2
              : inside(segment.y1, caption.y, caption.y + caption.h) &&
                Math.max(segment.x1, segment.x2) > caption.x + 2 &&
                Math.min(segment.x1, segment.x2) < caption.x + caption.w - 2;
            if (crosses)
              issues.push(
                `Connector passes through another edge caption: ${edge.edge} / ${caption.captionFor}`,
              );
          }
    }
    return issues;
  }, kind);
  if (problems.length)
    throw new Error(`${featureId} ${kind}: ${problems.join('; ')}`);
}

const browser = await chromium.launch({
  executablePath:
    process.env.LITMATCH_BROWSER ??
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
});
const report = [];
try {
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    viewport: { width: 2048, height: 1000 },
  });
  const page = await context.newPage();
  const allCharacters = [
    ...new Set([
      ...JSON.stringify(featureCatalog),
      ...JSON.stringify(dependencyCatalog),
      ...JSON.stringify(layerFlowCatalog),
      ...'Điểm quan trọng Lưu ý Luồng tiếp theo Nguồn Socket: sự kiện realtime Client: Web / Admin PostgreSQL Redis core-api signaling-gateway xác thực socket và fanout media-server LiveKit Hạ tầng chung publish sau commit',
    ]),
  ];
  metrics = await page.evaluate(
    ({ characters, fontFamily }) => {
      const canvas = document.createElement('canvas');
      const context2d = canvas.getContext('2d');
      const table = {};
      for (const size of [16, 17, 18, 19, 20, 21, 22, 23, 24, 26]) {
        for (const weight of [400, 600, 700]) {
          context2d.font = `${weight} ${size}px ${fontFamily}`;
          table[`${size}:${weight}`] = Object.fromEntries(
            characters.map((character) => [
              character,
              context2d.measureText(character).width,
            ]),
          );
        }
      }
      return table;
    },
    { characters: allCharacters, fontFamily: font },
  );
  for (const feature of selected) {
    const dependency = dependencyCatalog[feature.id];
    if (!dependency) throw new Error(`Missing dependency map: ${feature.id}`);
    for (const source of [
      ...feature.sources,
      ...dependency.sources,
      ...(layerFlowCatalog[feature.id]?.sources ?? []),
    ])
      if (!existsSync(path.join(repoDir, source)))
        throw new Error(`Missing source ${source}`);
    for (const kind of ['architecture', 'flow']) {
      const diagram =
        kind === 'architecture' ? architectureSvg(feature) : flowSvg(feature);
      const stem =
        kind === 'architecture' ? `${feature.id}-architecture` : feature.id;
      await page.setViewportSize({
        width: diagram.width,
        height: Math.min(1000, diagram.height),
      });
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"/></head><body style="margin:0;background:${colors.background}">${diagram.svg}</body></html>`,
      );
      await page.evaluate(() => document.fonts.ready);
      await validate(page, feature.id, kind);
      let architectureConnections;
      let flowConnections;
      if (kind === 'flow') {
        flowConnections = await page.evaluate(() => ({
          steps: [...document.querySelectorAll('g[data-layer]')].map(
            (element) => ({
              number: element.dataset.step,
              actor: element.dataset.layer,
              node: element.dataset.component,
            }),
          ),
          edges: [...document.querySelectorAll('path[data-edge]')].map(
            (element) => ({
              id: element.dataset.edge,
              from: element.dataset.from,
              to: element.dataset.to,
            }),
          ),
        }));
        if (
          !flowConnections.steps.length ||
          flowConnections.steps.some((step) => !step.actor || !step.number)
        )
          throw new Error(
            `${feature.id}: flow contains a step without actor or number`,
          );
      }
      if (kind === 'architecture') {
        architectureConnections = await page.evaluate(() => ({
          components: [...document.querySelectorAll('g[data-component]')].map(
            (element) => element.dataset.component,
          ),
          edges: [...document.querySelectorAll('path[data-edge]')].map(
            (element) => ({
              id: element.dataset.edge,
              from: element.dataset.from,
              to: element.dataset.to,
            }),
          ),
        }));
        const businessRedis = (dependency.redis?.business ?? []).filter(
          (role) => !/HTTP throttle/iu.test(role.label),
        );
        const expected = [
          'client',
          ...(!dependency.frontendOnly ? ['core'] : []),
          ...(dependency.entities?.length ? ['postgres'] : []),
          ...(businessRedis.length ||
          dependency.redis?.signaling ||
          dependency.redis?.mediaCluster
            ? ['redis']
            : []),
          ...(dependency.redis?.signaling ? ['gateway'] : []),
          ...dependency.externals.map((external) => external.id),
        ];
        const actual = architectureConnections.components;
        const missing = expected.filter((id) => !actual.includes(id));
        const unexpected = actual.filter((id) => !expected.includes(id));
        if (
          missing.length ||
          unexpected.length ||
          new Set(actual).size !== actual.length
        )
          throw new Error(
            `${feature.id}: component coverage differs; missing=${missing.join(',')} unexpected=${unexpected.join(',')}`,
          );
      }
      const entityNames = [
        ...new Set(dependency.modules.flatMap((module) => module.entities)),
      ];
      await page.locator('svg').screenshot({
        path: path.join(outputDir, `${stem}.png`),
        timeout: 30000,
        animations: 'disabled',
      });
      writeFileSync(path.join(outputDir, `${stem}.svg`), diagram.svg, 'utf8');
      report.push({
        feature: feature.id,
        kind,
        width: diagram.width * 2,
        height: diagram.height * 2,
        layout: 'PASS',
        entities: entityNames,
        modules: dependency.modules.map((module) => module.name),
        providers: dependency.externals.map((external) => external.lines[0]),
        dependencyCoverage: kind === 'architecture' ? 'PRIMARY_GRAPH' : 'FLOW',
        ...(architectureConnections ? { architectureConnections } : {}),
        ...(flowConnections ? { flowConnections } : {}),
        sources: [
          ...new Set([
            ...feature.sources,
            ...dependency.sources,
            ...(layerFlowCatalog[feature.id]?.sources ?? []),
            'docs/adr/0004-api-gateway-nginx-ingress.md',
            'docs/adr/0006-cloudflare-global-routing.md',
            'docs/03-architecture.md',
          ]),
        ],
      });
    }
    process.stdout.write(`${feature.id}: architecture + flow PASS\n`);
  }
  writeCompleteGallery(featureCatalog, coverage, outputDir, colors, font);
  for (const [file, oldHash] of before)
    if (hash(file) !== oldHash)
      throw new Error(`Protected Matching artifact changed: ${file}`);
  writeFileSync(
    path.join(outputDir, 'render-verification.json'),
    `${JSON.stringify(
      {
        features: selected.length,
        images: report.length,
        scale: 2,
        protectedMatching: 'UNCHANGED',
        coverage,
        checks: [
          'text within nodes',
          'nodes and edge labels do not overlap',
          'connector lanes do not cross',
          'connectors do not pass through nodes',
          'architecture connectors attach to the named source and target',
          'architecture captions are centered on their own wire',
          'architecture wires do not pass through another edge caption',
          'each active infrastructure component has one connected node',
          'each external provider has a separate node',
          'note paragraphs separated',
          'source files resolve',
        ],
        diagrams: report,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  process.stdout.write(
    `Rendered ${report.length} PNG + SVG. Layout validation PASS. Matching unchanged.\n`,
  );
} finally {
  await browser.close();
}
