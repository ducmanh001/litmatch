interface WeeklyRevenueChartProps {
  data: Array<{ label: string; value: number }>;
}

const WIDTH = 700;
const HEIGHT = 240;
const LEFT = 45;
const RIGHT = 680;
const TOP = 25;
const BOTTOM = 210;

/** Biểu đồ 7 ngày được tính trực tiếp từ aggregate backend, không giữ SVG path tĩnh. */
export function WeeklyRevenueChart({ data }: WeeklyRevenueChartProps) {
  const maxValue = Math.max(...data.map((point) => point.value), 1);
  const points = data.map((point, index) => ({
    ...point,
    x: LEFT + (index * (RIGHT - LEFT)) / Math.max(data.length - 1, 1),
    y: BOTTOM - (point.value / maxValue) * (BOTTOM - TOP),
  }));
  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area =
    points.length === 0
      ? ''
      : `M ${points[0]?.x ?? LEFT},${BOTTOM} L ${polyline.replaceAll(' ', ' L ')} L ${points.at(-1)?.x ?? RIGHT},${BOTTOM} Z`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block h-auto w-full"
        role="img"
        aria-label="Diamond đã tiêu trong 7 ngày gần nhất"
      >
        <defs>
          <linearGradient id="admin-revenue-area" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              className="[stop-color:var(--primary)]"
              stopOpacity={0.32}
            />
            <stop
              offset="100%"
              className="[stop-color:var(--primary)]"
              stopOpacity={0}
            />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((ratio) => {
          const y = BOTTOM - ratio * (BOTTOM - TOP);
          return (
            <g key={ratio}>
              <line
                className="stroke-border"
                x1={LEFT}
                y1={y}
                x2={RIGHT}
                y2={y}
              />
              <text
                x="2"
                y={y + 4}
                className="fill-dimmer text-[10px] font-semibold"
              >
                {formatCompact(maxValue * ratio)}
              </text>
            </g>
          );
        })}
        {area !== '' && <path fill="url(#admin-revenue-area)" d={area} />}
        {points.length > 0 && (
          <polyline
            className="fill-none stroke-primary"
            strokeWidth="2.6"
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ filter: 'var(--glow)' }}
            points={polyline}
          />
        )}
        {points.map((point) => (
          <circle
            key={`${point.label}-point`}
            className="fill-background stroke-primary"
            strokeWidth="2.4"
            cx={point.x}
            cy={point.y}
            r="4"
          >
            <title>{`${point.label}: ${point.value.toLocaleString('vi-VN')} Diamond`}</title>
          </circle>
        ))}
        {points.map((point) => (
          <text
            key={`${point.label}-label`}
            x={point.x}
            y="231"
            textAnchor="middle"
            className="fill-dimmer text-[11px] font-bold"
          >
            {point.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat('vi-VN', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}
