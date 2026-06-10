/**
 * Inline-SVG sparkline. No charting library — Server Components
 * friendly, ~30 lines, scales to fit container, supports an optional
 * "highlight" color band when value > 0 vs < 0 (for margins).
 *
 * Pass `points` as raw numbers (e.g. micros per day). The component
 * computes its own min/max, draws the line, and overlays a thin
 * zero-baseline + the most recent value as a dot.
 */
type SparklineProps = {
  points: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  className?: string;
  showZeroLine?: boolean;
  ariaLabel?: string;
};

export function Sparkline({
  points,
  width = 140,
  height = 36,
  stroke = "currentColor",
  fill = "currentColor",
  className,
  showZeroLine = true,
  ariaLabel,
}: SparklineProps) {
  if (points.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        className={className}
        aria-label={ariaLabel ?? "Empty sparkline"}
        role="img"
      />
    );
  }

  const max = Math.max(...points, 0);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const dx = points.length > 1 ? width / (points.length - 1) : 0;

  const path = points
    .map((y, i) => {
      const px = i * dx;
      const py = height - ((y - min) / range) * height;
      return `${i === 0 ? "M" : "L"} ${px.toFixed(2)} ${py.toFixed(2)}`;
    })
    .join(" ");

  // Optional zero-baseline shading
  const zeroY = height - ((0 - min) / range) * height;

  // Filled area to give the spark some weight
  const areaPath = `${path} L ${(points.length - 1) * dx} ${height} L 0 ${height} Z`;
  const lastX = (points.length - 1) * dx;
  const lastY = height - ((points[points.length - 1]! - min) / range) * height;

  return (
    <svg
      width={width}
      height={height}
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-label={ariaLabel ?? "Sparkline"}
      role="img"
    >
      <path d={areaPath} fill={fill} fillOpacity={0.12} stroke="none" />
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {showZeroLine && (
        <line
          x1={0}
          x2={width}
          y1={zeroY}
          y2={zeroY}
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      )}
      <circle cx={lastX} cy={lastY} r={2.5} fill={stroke} />
    </svg>
  );
}
