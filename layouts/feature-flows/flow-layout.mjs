// Matching palette and vertical spine, with explicit actor ownership per step.
// review-module: N/A — presentation only, no business-flow implementation change.
export function drawLayerFlow(feature, definition, kit) {
  const { colors, connector, pill, text, wrap, measure, footer, finish } = kit;
  const width = 1208;
  const center = width / 2;
  const mainWidth = 700;
  const escape = (value) =>
    String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  const stages = definition?.stages;
  if (!Array.isArray(stages) || !stages.length)
    throw new Error(`Missing actor flow: ${feature.id}`);
  const parts = [
    text(32, 40, [`${feature.title} — Luồng xử lý`], 26, 700, 'start'),
    text(
      32,
      75,
      [
        'Tên thành phần ở đầu ô · số bước bên trái · giao tiếp/điều kiện trên dây',
      ],
      18,
      400,
      'start',
      colors.prose,
    ),
  ];
  let edgeCounter = 0;
  let cursor = 110;
  let previous = [];

  function captionGeometry(label, maxWidth, size = 17) {
    const lines = wrap(label, maxWidth - 44, size);
    return {
      width: Math.min(
        maxWidth,
        Math.max(...lines.map((line) => measure(line, size))) + 44,
      ),
      height: Math.max(34, lines.length * (size + 6) + 12),
    };
  }
  const edgeLabel = (value) => value || 'Tiếp tục';
  const gapFor = (label, available = mainWidth) =>
    Math.max(78, captionGeometry(edgeLabel(label), available).height + 42);

  function card(
    stage,
    number,
    xCenter,
    y,
    cardWidth = mainWidth,
    decision = false,
  ) {
    if (!stage.actor || typeof stage.actor !== 'string')
      throw new Error(`${feature.id}: step ${number} has no actor`);
    const body = decision ? stage.branch : stage.text;
    if (typeof body !== 'string' || !body.trim())
      throw new Error(`${feature.id}: step ${number} has no action`);
    const x = xCenter - cardWidth / 2;
    const headerSize = cardWidth < 600 ? 18 : 22;
    const bodySize = cardWidth < 600 ? 21 : 23;
    const actorLines = wrap(stage.actor, cardWidth - 120, headerSize, 700);
    const actionLines = wrap(body, cardWidth - 48, bodySize);
    const headerHeight = Math.max(
      48,
      actorLines.length * (headerSize + 6) + 18,
    );
    const height = Math.max(
      126,
      headerHeight + actionLines.length * (bodySize + 6) + 44,
    );
    const badgeWidth = Math.max(40, measure(number, 16, 700) + 18);
    const badgeX = x + 14;
    const badgeY = y + headerHeight / 2 - 16;
    const actorCenterX = x + 94 + (cardWidth - 110) / 2;
    const actorBaseline =
      y +
      headerHeight / 2 -
      ((actorLines.length - 1) * (headerSize + 6)) / 2 +
      headerSize * 0.34;
    const actionBaseline =
      y +
      headerHeight +
      (height - headerHeight) / 2 -
      ((actionLines.length - 1) * (bodySize + 6)) / 2 +
      bodySize * 0.34;
    const id = `step-${number.replaceAll('.', '-')}`;
    parts.push(
      `<g data-container="${escape(`${number} ${stage.actor}`)}" data-component="${escape(id)}" data-layer="${escape(stage.actor)}" data-step="${escape(number)}" data-x="${x}" data-y="${y}" data-w="${cardWidth}" data-h="${height}"><rect x="${x}" y="${y}" width="${cardWidth}" height="${height}" rx="26" fill="${colors.node}" stroke="${decision ? colors.accent : colors.nodeBorder}" stroke-width="2"${decision ? ' stroke-dasharray="5 4"' : ''}/><line x1="${x + 18}" x2="${x + cardWidth - 18}" y1="${y + headerHeight}" y2="${y + headerHeight}" stroke="${colors.nodeBorder}"/><rect x="${badgeX}" y="${badgeY}" width="${badgeWidth}" height="32" rx="16" fill="${colors.background}" stroke="${colors.accent}" stroke-width="1.5"/>${text(badgeX + badgeWidth / 2, badgeY + 21, [number], 16, 700)}${text(actorCenterX, actorBaseline, actorLines, headerSize, 700)}${text(xCenter, actionBaseline, actionLines, bodySize)}</g>`,
    );
    return {
      id,
      x: xCenter,
      top: y,
      bottom: y + height,
      width: cardWidth,
      edge: stage.edge,
    };
  }

  function wire(from, to, path, label, x, y, available = mainWidth) {
    const id = `flow-edge-${++edgeCounter}`;
    connector(parts, path);
    parts[parts.length - 1] = parts[parts.length - 1].replace(
      'data-connector="true"',
      `data-connector="true" data-edge="${id}" data-from="${from.id}" data-to="${to.id}"`,
    );
    const caption = edgeLabel(label);
    const geometry = captionGeometry(caption, available);
    pill(parts, x - geometry.width / 2, y, available, caption, 17);
    parts[parts.length - 1] = parts[parts.length - 1].replace(
      '<g ',
      `<g data-edge-caption="${id}" `,
    );
  }

  function connect(parents, target) {
    for (const parent of parents) {
      if (parent.x === target.x) {
        wire(
          parent,
          target,
          `M ${parent.x} ${parent.bottom} V ${target.top}`,
          parent.edge,
          parent.x,
          (parent.bottom + target.top) / 2,
          Math.min(parent.width, target.width),
        );
      } else {
        const joinY = target.top - 24;
        const geometry = captionGeometry(
          edgeLabel(parent.edge),
          Math.min(parent.width, mainWidth),
        );
        const captionY = parent.bottom + geometry.height / 2 + 20;
        wire(
          parent,
          target,
          `M ${parent.x} ${parent.bottom} V ${joinY} H ${target.x} V ${target.top}`,
          parent.edge,
          parent.x,
          captionY,
          Math.min(parent.width, mainWidth),
        );
      }
    }
  }

  stages.forEach((stage, index) => {
    const number = String(index + 1).padStart(2, '0');
    const isBranch = typeof stage.branch === 'string';
    const main = card(stage, number, center, cursor, mainWidth, isBranch);
    connect(previous, main);
    if (!isBranch) {
      previous = [main];
      cursor = main.bottom + gapFor(stage.edge);
      return;
    }
    const options = stage.options;
    if (![2, 3].includes(options?.length))
      throw new Error(`${feature.id}: branch ${number} needs 2 or 3 options`);
    const cardWidth = options.length === 2 ? 520 : 360;
    const centers = options.length === 2 ? [302, 906] : [200, 604, 1008];
    const splitY = main.bottom + 30;
    const labelHeight = Math.max(
      ...options.map(
        (option) => captionGeometry(option.label, cardWidth - 18).height,
      ),
    );
    const conditionY = splitY + labelHeight / 2 + 14;
    const startY = conditionY + labelHeight / 2 + 34;
    const continuing = [];
    let lowest = startY;
    options.forEach((option, optionIndex) => {
      if (!option.steps?.length)
        throw new Error(`${feature.id}: branch ${number} has an empty option`);
      let optionCursor = startY;
      let prior;
      option.steps.forEach((child, childIndex) => {
        if (child.branch)
          throw new Error(
            `${feature.id}: nested branch requires its own main stage`,
          );
        const childNumber = `${number}${String.fromCharCode(65 + optionIndex)}.${childIndex + 1}`;
        const childCard = card(
          child,
          childNumber,
          centers[optionIndex],
          optionCursor,
          cardWidth,
        );
        if (prior) connect([prior], childCard);
        else
          wire(
            main,
            childCard,
            `M ${center} ${main.bottom} V ${splitY} H ${childCard.x} V ${childCard.top}`,
            option.label,
            childCard.x,
            conditionY,
            cardWidth - 18,
          );
        prior = childCard;
        optionCursor = childCard.bottom + gapFor(child.edge, cardWidth);
      });
      lowest = Math.max(lowest, prior.bottom);
      if (option.continues !== false) continuing.push(prior);
    });
    if (!continuing.length && index !== stages.length - 1)
      throw new Error(`${feature.id}: closed branch has following stages`);
    previous = continuing;
    const longestCaption = Math.max(
      34,
      ...continuing.map(
        (parent) =>
          captionGeometry(edgeLabel(parent.edge), parent.width).height,
      ),
    );
    cursor = lowest + longestCaption + 76;
  });

  const flowNotes = { ...feature.flowNotes };
  for (const key of ['important', 'caution', 'followup'])
    if (definition[key]) flowNotes[key] = definition[key];
  const height = footer(
    parts,
    cursor - 36,
    width,
    {
      ...feature,
      sources: [
        ...new Set([...feature.sources, ...(definition.sources ?? [])]),
      ],
    },
    flowNotes,
    false,
  );
  return finish(parts, width, height, feature, 'Luồng xử lý theo thành phần');
}
