/**
 * Sparkline geometry for the check-in weight trend: values → SVG polyline points that fill
 * `width` × `height` inside `pad`. A flat line sits in the middle. Pure.
 */
export function sparkPoints(values: number[], width: number, height: number, pad = 0): { x: number; y: number }[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const w = Math.max(0, width - pad * 2);
  const h = Math.max(0, height - pad * 2);
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  return values.map((v, i) => ({
    x: Math.round((pad + (values.length > 1 ? i * step : w / 2)) * 10) / 10,
    y: Math.round((pad + (span === 0 ? h / 2 : h - ((v - min) / span) * h)) * 10) / 10,
  }));
}

export function pointsAttr(points: { x: number; y: number }[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}
