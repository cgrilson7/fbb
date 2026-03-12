'use client'

interface StripData {
  franchise: string
  values: number[]
  isSelected: boolean
}

interface StripChartProps {
  data: StripData[]
  metricLabel: string
  subtitle?: string
  /** If true, sort by median ascending (lower = better) */
  lowerIsBetter?: boolean
  /** Round values to this increment for staggering (default 1) */
  roundTo?: number
  formatTick?: (v: number) => string
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  if (n === 0) return 0
  return n % 2 === 1 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
}

export default function BoxPlotChart({ data, metricLabel, subtitle, lowerIsBetter, roundTo = 1, formatTick }: StripChartProps) {
  const processed = data
    .filter(d => d.values.length > 0)
    .map(d => ({ ...d, med: median(d.values) }))

  processed.sort((a, b) => lowerIsBetter ? a.med - b.med : b.med - a.med)

  if (processed.length === 0) {
    return <p className="text-sm text-gray-400">No data for {metricLabel}</p>
  }

  const fmt = formatTick ?? ((v: number) => v.toFixed(0))

  // Layout
  const labelWidth = 180
  const chartWidth = 520
  const rowHeight = 28
  const dotRadius = 2.5
  const staggerY = 8 // how far above/below center line dots go
  const padding = { top: 26, right: 40, bottom: 20 }
  const svgWidth = labelWidth + chartWidth + padding.right
  const svgHeight = padding.top + processed.length * rowHeight + padding.bottom

  // Global x domain
  const allVals = processed.flatMap(d => d.values)
  const allMin = Math.min(...allVals)
  const allMax = Math.max(...allVals)
  const range = allMax - allMin || 1
  const xMin = allMin - range * 0.04
  const xMax = allMax + range * 0.04
  const xScale = (v: number) => labelWidth + ((v - xMin) / (xMax - xMin)) * chartWidth

  // Nice ticks
  const tickCount = 6
  const rawStep = (xMax - xMin) / tickCount
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const niceStep = [1, 2, 5, 10].map(m => m * mag).find(s => s >= rawStep) ?? rawStep
  const ticks: number[] = []
  for (let t = Math.ceil(xMin / niceStep) * niceStep; t <= xMax; t += niceStep) ticks.push(t)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-0.5">{metricLabel}</h3>
      {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{subtitle}</p>}
      <div className="overflow-x-auto">
        <svg width={svgWidth} height={svgHeight}>
          {/* Grid + ticks */}
          {ticks.map((tick, i) => (
            <g key={i}>
              <line
                x1={xScale(tick)} y1={padding.top - 2}
                x2={xScale(tick)} y2={svgHeight - padding.bottom}
                className="stroke-gray-200 dark:stroke-gray-700" strokeWidth={0.5}
              />
              <text x={xScale(tick)} y={padding.top - 6} textAnchor="middle"
                className="fill-gray-400 dark:fill-gray-500" fontSize={9}>
                {fmt(tick)}
              </text>
            </g>
          ))}

          {/* Rows */}
          {processed.map((d, i) => {
            const centerY = padding.top + i * rowHeight + rowHeight / 2
            const isSelected = d.isSelected

            const labelClass = isSelected
              ? 'fill-blue-600 dark:fill-blue-400 font-semibold'
              : 'fill-gray-600 dark:fill-gray-400'

            // Round values and assign stagger: at each rounded bucket,
            // alternate dots above/below the center line
            const rounded = d.values
              .map(v => ({ raw: v, bucket: Math.round(v / roundTo) * roundTo }))
              .sort((a, b) => a.bucket - b.bucket)

            // Group by bucket to stagger within each
            const bucketCounts = new Map<number, number>()
            const dots = rounded.map(({ raw, bucket }) => {
              const idx = bucketCounts.get(bucket) ?? 0
              bucketCounts.set(bucket, idx + 1)
              const above = idx % 2 === 0 // even index above, odd below
              return { x: raw, above }
            })

            return (
              <g key={d.franchise}>
                {/* Label */}
                <text x={labelWidth - 8} y={centerY + 4} textAnchor="end" fontSize={11} className={labelClass}>
                  {d.franchise.length > 22 ? d.franchise.slice(0, 20) + '...' : d.franchise}
                </text>

                {/* Center axis line */}
                <line
                  x1={labelWidth} y1={centerY}
                  x2={labelWidth + chartWidth} y2={centerY}
                  className="stroke-gray-200 dark:stroke-gray-700" strokeWidth={0.5}
                />

                {/* Dots */}
                {dots.map((dot, j) => (
                  <circle
                    key={j}
                    cx={xScale(dot.x)}
                    cy={centerY + (dot.above ? -staggerY : staggerY)}
                    r={dotRadius}
                    className={isSelected
                      ? 'fill-blue-500 dark:fill-blue-400'
                      : 'fill-gray-400 dark:fill-gray-500'}
                    opacity={0.8}
                  />
                ))}

                {/* Median marker */}
                <line
                  x1={xScale(d.med)} y1={centerY - staggerY - 3}
                  x2={xScale(d.med)} y2={centerY + staggerY + 3}
                  className={isSelected
                    ? 'stroke-blue-700 dark:stroke-blue-300'
                    : 'stroke-gray-600 dark:stroke-gray-300'}
                  strokeWidth={1.5}
                  strokeDasharray="2,2"
                />

                {/* Count */}
                <text x={svgWidth - padding.right + 4} y={centerY + 3} fontSize={9}
                  className="fill-gray-400 dark:fill-gray-500">
                  {d.values.length}
                </text>
              </g>
            )
          })}

          {/* Bottom axis */}
          <line
            x1={labelWidth} y1={svgHeight - padding.bottom}
            x2={labelWidth + chartWidth} y2={svgHeight - padding.bottom}
            className="stroke-gray-300 dark:stroke-gray-600" strokeWidth={1}
          />
        </svg>
      </div>
    </div>
  )
}
