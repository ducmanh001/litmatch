export interface DonutSegment {
  /** Tailwind class quyết định màu nét (vd "stroke-primary") — component không tự gán màu. */
  strokeClassName: string;
  value: number;
}

interface DonutChartProps {
  segments: DonutSegment[];
  centerValue: string;
  centerSub: string;
  size?: number;
}

const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface DonutArc {
  segment: DonutSegment;
  dash: number;
  dashOffset: number;
}

/** Hàm thuần ngoài component — tính offset tích luỹ không mutate biến trong thân component. */
function computeArcs(segments: DonutSegment[]): DonutArc[] {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const arcs: DonutArc[] = [];
  for (const segment of segments) {
    const previous = arcs[arcs.length - 1];
    const cumulative =
      previous === undefined ? 0 : previous.dashOffset * -1 + previous.dash;
    const dash = (segment.value / total) * CIRCUMFERENCE;
    arcs.push({ segment, dash, dashOffset: -cumulative });
  }
  return arcs;
}

/** Donut nhiều lát cắt, tổng quát theo tỉ lệ — port từ .donut-* của mockup. */
export function DonutChart({
  segments,
  centerValue,
  centerSub,
  size = 118,
}: DonutChartProps) {
  const arcs = computeArcs(segments);

  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className="shrink-0">
      <circle
        cx="60"
        cy="60"
        r={RADIUS}
        fill="none"
        strokeWidth="14"
        className="stroke-border"
      />
      {arcs.map((arc, index) => (
        <circle
          key={index}
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${arc.dash} ${CIRCUMFERENCE - arc.dash}`}
          strokeDashoffset={arc.dashOffset}
          transform="rotate(-90 60 60)"
          className={arc.segment.strokeClassName}
        />
      ))}
      <text
        x="60"
        y="58"
        textAnchor="middle"
        className="fill-foreground text-[15px] font-extrabold"
      >
        {centerValue}
      </text>
      <text
        x="60"
        y="72"
        textAnchor="middle"
        className="fill-muted-foreground text-[9px] font-bold"
      >
        {centerSub}
      </text>
    </svg>
  );
}
