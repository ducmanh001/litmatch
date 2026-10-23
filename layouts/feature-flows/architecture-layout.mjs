// A single Matching-style graph: component names on nodes, real protocols on edges.
// Entity/module/job inventories remain in the verified source catalogs.
export function drawDependencyArchitecture(feature, dependency, kit) {
  const {
    node,
    cylinder,
    connector,
    pill,
    text,
    wrap,
    measure,
    footer,
    finish,
  } = kit;
  const width = dependency.frontendOnly ? 1208 : 2048;
  const parts = [
    text(24, 38, [`${feature.title} — Sơ đồ kiến trúc`], 26, 700, 'start'),
  ];
  const business = (dependency.redis?.business ?? []).filter(
    (entry) => !/HTTP throttle/iu.test(entry.label),
  );
  const hasGateway = Boolean(dependency.redis?.signaling);
  const hasMediaRedis = Boolean(dependency.redis?.mediaCluster);
  const hasRedis = business.length > 0 || hasGateway || hasMediaRedis;
  const hasPostgres = Boolean(dependency.entities?.length);

  // LiveKit first leaves a corridor to Redis above the client/provider lanes.
  const externals = [...(dependency.externals ?? [])].sort(
    (a, b) => Number(b.id === 'livekit') - Number(a.id === 'livekit'),
  );
  const direct = externals.filter((external) => external.direct);
  const controls = externals.filter(
    (external) => external.request || external.callback,
  );
  const controlCount =
    Number(hasPostgres) + Number(business.length > 0) + controls.length;
  const boxes = {
    client: {
      x: 18,
      y: 104,
      w: 246,
      h: Math.max(100, 80 + (direct.length + Number(hasGateway)) * 24),
    },
    core: { x: 577, y: 56, w: 328, h: Math.max(152, 72 + controlCount * 24) },
    postgres: { x: 1311, y: 64, w: 154, h: 100 },
    redis: { x: 1355, y: 232, w: 134, h: 100 },
    gateway: { x: 1752, y: 232, w: 272, h: 108 },
  };
  const providerTop = hasRedis ? 380 : 236;
  externals.forEach((external, index) => {
    boxes[external.id] = {
      x: 1311,
      y: providerTop + index * 132,
      w: 300,
      h: 92,
    };
  });
  const right = (box) => box.x + box.w;
  const bottom = (box) => box.y + box.h;
  const middleY = (box) => box.y + box.h / 2;
  const escape = (value) =>
    String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;');

  function component(id, label, database = false) {
    const box = boxes[id];
    if (database) cylinder(parts, box.x, box.y, box.w, box.h, label);
    else
      node(parts, box.x, box.y, box.w, box.h, label, id === 'core' ? 22 : 20);
    parts[parts.length - 1] = parts[parts.length - 1].replace(
      '<g ',
      `<g data-component="${escape(id)}" `,
    );
  }

  // Position captions by measured centers, exactly on their own wire segment.
  function caption(edgeId, centerX, centerY, label, maxWidth = 240) {
    const size = 17;
    const lines = wrap(label, maxWidth - 44, size);
    const actualWidth = Math.min(
      maxWidth,
      Math.max(...lines.map((line) => measure(line, size))) + 44,
    );
    pill(parts, centerX - actualWidth / 2, centerY, maxWidth, label, size);
    parts[parts.length - 1] = parts[parts.length - 1].replace(
      '<g ',
      `<g data-edge-caption="${escape(edgeId)}" `,
    );
  }

  function wire(
    id,
    from,
    to,
    points,
    label,
    centerX,
    centerY,
    both = false,
    maxWidth = 240,
  ) {
    let path = `M ${points[0][0]} ${points[0][1]}`;
    for (let index = 1; index < points.length; index += 1) {
      const [x, y] = points[index];
      const [previousX, previousY] = points[index - 1];
      if (x !== previousX && y !== previousY)
        throw new Error(`Non-orthogonal architecture edge: ${id}`);
      if (x !== previousX) path += ` H ${x}`;
      else if (y !== previousY) path += ` V ${y}`;
    }
    connector(parts, path, true, both);
    parts[parts.length - 1] = parts[parts.length - 1].replace(
      'data-connector="true"',
      `data-connector="true" data-edge="${escape(id)}" data-from="${escape(from)}" data-to="${escape(to)}"`,
    );
    caption(id, centerX, centerY, label, maxWidth);
  }

  if (dependency.frontendOnly) {
    if (externals.length !== 1 || controls.length || hasPostgres || hasRedis)
      throw new Error(
        `${feature.id}: frontend-only diagram has backend dependencies`,
      );
    const external = externals[0];
    boxes.client = { x: 18, y: 100, w: 246, h: 100 };
    boxes[external.id] = { x: 870, y: 100, w: 310, h: 100 };
    const points = [
      [right(boxes.client), 150],
      [boxes[external.id].x, 150],
    ];
    const toClient = external.direction === 'to-client';
    wire(
      'client-provider',
      toClient ? external.id : 'client',
      toClient ? 'client' : external.id,
      toClient ? [...points].reverse() : points,
      'HTTPS · analytics',
      (right(boxes.client) + boxes[external.id].x) / 2,
      150,
      external.direction === 'both',
      360,
    );
    component('client', 'Frontend · Web');
    component(external.id, external.lines[0]);
    const height = footer(parts, 256, width, feature, feature.archNotes, true);
    return finish(parts, width, height, feature, 'Sơ đồ kiến trúc');
  }

  wire(
    'client-core',
    'client',
    'core',
    [
      [right(boxes.client), 140],
      [boxes.core.x, 140],
    ],
    'REST: yêu cầu nghiệp vụ',
    (right(boxes.client) + boxes.core.x) / 2,
    140,
    false,
    294,
  );

  // Higher destinations get the outer trunks; lower destinations nest inside.
  let controlIndex = 0;
  function controlWire(id, target, label, direction = 'write', both = false) {
    const box = boxes[target];
    const sourceY = 100 + controlIndex * 24;
    const trunkX = 1102 - controlIndex * 28;
    controlIndex += 1;
    const targetY = target === 'postgres' ? sourceY : middleY(box);
    const points =
      target === 'postgres'
        ? [
            [right(boxes.core), sourceY],
            [box.x, targetY],
          ]
        : [
            [right(boxes.core), sourceY],
            [trunkX, sourceY],
            [trunkX, targetY],
            [box.x, targetY],
          ];
    const labelX =
      target === 'postgres'
        ? (right(boxes.core) + box.x) / 2
        : (trunkX + box.x) / 2;
    const availableWidth =
      target === 'postgres'
        ? box.x - right(boxes.core) - 28
        : box.x - trunkX - 18;
    if (direction === 'read') {
      wire(
        id,
        target,
        'core',
        [...points].reverse(),
        label,
        labelX,
        targetY,
        both,
        Math.min(270, availableWidth),
      );
    } else
      wire(
        id,
        'core',
        target,
        points,
        label,
        labelX,
        targetY,
        both,
        Math.min(270, availableWidth),
      );
  }

  if (hasPostgres) {
    const pgQueue = dependency.entities.some((entity) =>
      /(?:MovieMatch|PalmMatch)QueueEntry$/u.test(entity),
    );
    controlWire(
      'core-postgres',
      'postgres',
      pgQueue ? 'state bền vững · queue' : 'state bền vững',
    );
  }
  if (business.length) {
    const tags = [
      ...new Set(
        business.map((entry) => {
          const role = entry.role.toLowerCase();
          if (role === 'pub/sub') return 'Pub/Sub';
          if (role === 'rate limit') return 'quota';
          return role;
        }),
      ),
    ];
    const reads = business.some(
      (entry) => entry.direction === 'read' || entry.direction === 'both',
    );
    const writes = business.some(
      (entry) => entry.direction === 'write' || entry.direction === 'both',
    );
    controlWire(
      'core-redis',
      'redis',
      tags.join(' · '),
      reads && !writes ? 'read' : 'write',
      reads && writes,
    );
  }

  function controlLabel(external) {
    if (external.id === 'broker') return 'stream (tuỳ cấu hình)';
    if (external.id === 'livekit') return 'API · webhook';
    if (external.id === 'payos') return 'payment · webhook';
    if (external.id === 'apple-iap') return 'receipt · webhook';
    if (external.id === 'google-iap') return 'verify · RTDN';
    if (external.id === 'identity') return 'verify token (HTTP)';
    if (external.id === 'push') return 'push';
    if (external.id === 'storage') return 'presign · media';
    if (external.id === 'video-storage') return 'upload/media';
    if (external.id === 'transcode') return 'transcode (dev)';
    const callback = external.callback ?? '';
    const webhook =
      /\/webhooks\//u.test(callback) && !/chưa|không/iu.test(callback);
    return webhook ? 'API · webhook' : 'provider API';
  }
  for (const external of controls) {
    const hasRequest = Boolean(external.request);
    const hasResult = Boolean(external.callback);
    controlWire(
      `core-${external.id}`,
      external.id,
      controlLabel(external),
      hasRequest ? 'write' : 'read',
      hasRequest && hasResult,
    );
  }

  if (hasGateway) {
    wire(
      'redis-gateway',
      'redis',
      'gateway',
      [
        [right(boxes.redis), 258],
        [boxes.gateway.x, 258],
      ],
      'realtime Pub/Sub',
      (right(boxes.redis) + boxes.gateway.x) / 2,
      258,
    );
    wire(
      'gateway-redis',
      'gateway',
      'redis',
      [
        [boxes.gateway.x, 304],
        [right(boxes.redis), 304],
      ],
      'presence · quota',
      (right(boxes.redis) + boxes.gateway.x) / 2,
      304,
    );
  }
  if (hasMediaRedis) {
    const livekitBox = boxes.livekit;
    if (!livekitBox)
      throw new Error(`mediaCluster without LiveKit component: ${feature.id}`);
    const portY = livekitBox.y + 28;
    const redisX = boxes.redis.x + boxes.redis.w / 2;
    const returnY = bottom(boxes.redis) + 22;
    wire(
      'livekit-redis',
      'livekit',
      'redis',
      [
        [right(livekitBox), portY],
        [1640, portY],
        [1640, returnY],
        [redisX, returnY],
        [redisX, bottom(boxes.redis)],
      ],
      'Pub/Sub',
      (1640 + redisX) / 2,
      returnY,
      true,
      160,
    );
  }

  function directLabel(external) {
    if (external.id === 'livekit') return 'Âm thanh trực tiếp / WebRTC';
    if (external.id === 'push') return 'push';
    if (external.id === 'storage' || external.id === 'video-storage')
      return 'upload/media';
    if (external.id === 'identity') return 'social sign-in';
    if (external.id === 'video-source') return 'video playback';
    if (['payos', 'apple-iap', 'google-iap'].includes(external.id))
      return 'payment';
    return 'direct provider';
  }

  const providerBottom = externals.length
    ? bottom(boxes[externals[externals.length - 1].id])
    : 0;
  const laneTop = Math.max(360, providerBottom + 64, bottom(boxes.core) + 56);
  let graphBottom = Math.max(
    bottom(boxes.client),
    bottom(boxes.core),
    hasPostgres ? bottom(boxes.postgres) : 0,
    hasRedis ? bottom(boxes.redis) : 0,
    providerBottom,
  );
  direct.forEach((external, index) => {
    const box = boxes[external.id];
    const clientY = 174 + (direct.length - 1 - index) * 24;
    const leftX = 310 + index * 32;
    const rightX = 1708 - index * 28;
    const laneY = laneTop + (direct.length - 1 - index) * 48;
    const providerY = box.y + 64;
    const points = [
      [right(boxes.client), clientY],
      [leftX, clientY],
      [leftX, laneY],
      [rightX, laneY],
      [rightX, providerY],
      [right(box), providerY],
    ];
    const centerX = (leftX + rightX) / 2;
    const id = `client-${external.id}`;
    if (external.direction === 'to-client') {
      wire(
        id,
        external.id,
        'client',
        [...points].reverse(),
        directLabel(external),
        centerX,
        laneY,
        false,
        340,
      );
    } else
      wire(
        id,
        'client',
        external.id,
        points,
        directLabel(external),
        centerX,
        laneY,
        external.direction === 'both',
        340,
      );
    graphBottom = Math.max(graphBottom, laneY);
  });
  if (hasGateway) {
    const socketY = laneTop + direct.length * 48 + 36;
    const clientY = 174 + direct.length * 24;
    const gatewayX = boxes.gateway.x + boxes.gateway.w / 2;
    wire(
      'gateway-client',
      'gateway',
      'client',
      [
        [gatewayX, bottom(boxes.gateway)],
        [gatewayX, socketY],
        [286, socketY],
        [286, clientY],
        [right(boxes.client), clientY],
      ],
      'Socket: realtime',
      (286 + gatewayX) / 2,
      socketY,
      true,
      290,
    );
    graphBottom = Math.max(graphBottom, socketY);
  }

  component('client', 'Client: Web / Admin');
  component('core', 'core-api');
  if (hasPostgres) component('postgres', 'PostgreSQL', true);
  if (hasRedis) component('redis', 'Redis', true);
  if (hasGateway) component('gateway', 'signaling-gateway');
  for (const external of externals) {
    component(
      external.id,
      external.id === 'livekit' ? 'media-server\nLiveKit' : external.lines[0],
    );
  }

  const caveats = [];
  if (business.some((entry) => entry.role === 'rate limit'))
    caveats.push(
      'quota trên Redis là hạn mức nghiệp vụ, không phải queue ghép cặp.',
    );
  if (externals.some((external) => external.id === 'broker'))
    caveats.push(
      'Kafka/stream chỉ khi Economy outbox relay được bật; không khẳng định có consumer nghiệp vụ.',
    );
  if (hasMediaRedis)
    caveats.push(
      'Dây LiveKit–Redis dành cho self-host có cấu hình cluster; LiveKit Cloud do provider quản lý.',
    );
  if (
    externals.some((external) =>
      ['video-storage', 'transcode'].includes(external.id),
    )
  )
    caveats.push(
      'Video storage/transcode hiện là dev/unavailable adapters; production vendor và webhook transcode chưa có.',
    );
  if (externals.some((external) => external.id === 'push'))
    caveats.push(
      'Push cần provider/credential và endpoint phù hợp; in-app vẫn ở PostgreSQL.',
    );
  if (externals.some((external) => external.id === 'identity'))
    caveats.push('Social verify dùng HTTP/JWKS; OTP hiện không gửi SMS.');
  const sources = [
    ...new Set([
      ...feature.sources,
      ...(dependency.sources ?? []),
      'docs/03-architecture.md',
    ]),
  ];
  const height = footer(
    parts,
    graphBottom + 56,
    width,
    { ...feature, sources },
    {
      ...feature.archNotes,
      caution: [feature.archNotes.caution, ...caveats]
        .filter(Boolean)
        .join(' '),
    },
    true,
  );
  return finish(parts, width, height, feature, 'Sơ đồ kiến trúc');
}
