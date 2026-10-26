/** Lightweight SVG charts: no chart library, so the bundle stays small and they theme with CSS variables. */

export interface Point { label: string; value: number; valueLabel: string }

export function TrendChart({ points }: { points: Point[] }) {
  if (!points.length) return null
  const W = 600, H = 150, top = 24, bottom = H - 22, left = 16, right = W - 16
  const vals = points.map(p => p.value)
  const min = Math.min(...vals), max = Math.max(...vals)
  const flat = max - min < 1e-6
  const x = (i: number) => (points.length === 1 ? (left + right) / 2 : left + ((right - left) * i) / (points.length - 1))
  const y = (v: number) => (flat ? (top + bottom) / 2 : bottom - ((v - min) / (max - min)) * (bottom - top))
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ')
  const area = `M${x(0)},${bottom} ${points.map((p, i) => `L${x(i)},${y(p.value)}`).join(' ')} L${x(points.length - 1)},${bottom} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full" role="img" aria-label="trend">
      <defs>
        <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.2" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={left} x2={right} y1={bottom} y2={bottom} stroke="var(--line)" />
      <path d={area} fill="url(#trend-fill)" />
      <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r="5" fill="var(--card)" />
          <circle cx={x(i)} cy={y(p.value)} r="3.5" fill="var(--primary)" />
          <text x={x(i)} y={y(p.value) - 9} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text)">{p.valueLabel}</text>
          {(points.length <= 6 || i % 2 === (points.length - 1) % 2) && (
            <text x={x(i)} y={H - 4} textAnchor="middle" fontSize="11" fill="var(--muted)">{p.label}</text>
          )}
        </g>
      ))}
    </svg>
  )
}

export function RadarChart({ labels, values, color }: { labels: string[]; values: number[]; color: string }) {
  const size = 320, c = size / 2, r = c - 52, n = labels.length
  const vertex = (i: number, radius: number) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n
    return [c + radius * Math.cos(a), c + radius * Math.sin(a)] as const
  }
  const poly = (radius: (i: number) => number) =>
    Array.from({ length: n }, (_, i) => vertex(i, radius(i)).join(',')).join(' ')
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto w-full max-w-sm" role="img" aria-label="radar">
      {[1, 2, 3, 4].map(l => <polygon key={l} points={poly(() => (r * l) / 4)} fill="none" stroke="var(--line)" />)}
      {labels.map((_, i) => {
        const [px, py] = vertex(i, r)
        return <line key={i} x1={c} y1={c} x2={px} y2={py} stroke="var(--line)" />
      })}
      <polygon
        points={poly(i => (r * Math.min(Math.max(values[i], 0), 100)) / 100)}
        fill={color} fillOpacity="0.22" stroke={color} strokeWidth="2" strokeLinejoin="round"
        style={{ transition: 'all 400ms ease' }}
      />
      {labels.map((label, i) => {
        const [px, py] = vertex(i, (r * Math.min(Math.max(values[i], 0), 100)) / 100)
        const [lx, ly] = vertex(i, r + 26)
        return (
          <g key={label}>
            <circle cx={px} cy={py} r="3.5" fill={color} />
            <text x={lx} y={ly - 2} textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--text)">{label}</text>
            <text x={lx} y={ly + 13} textAnchor="middle" fontSize="11" fill="var(--muted)">{Math.round(values[i])}</text>
          </g>
        )
      })}
    </svg>
  )
}
