'use client'

export interface PositionCard {
  position: string
  label?: string  // display label if different from position key (e.g. "MI" for the slot)
  players: { name: string; value: number; isFarm: boolean }[]
  totalValue: number
  leagueRank: number | null
  totalFranchises: number
}

interface DiamondProps {
  positions: Record<string, PositionCard>
  mode?: 'roster' | 'bestLineup' | 'depthChart'
}

// 8 standard positions for roster mode
const ROSTER_COORDS: Record<string, { x: number; y: number }> = {
  C:    { x: 300, y: 420 },
  '1B': { x: 450, y: 295 },
  '2B': { x: 370, y: 195 },
  SS:   { x: 230, y: 195 },
  '3B': { x: 150, y: 295 },
  LF:   { x: 100, y: 100 },
  CF:   { x: 300, y: 40 },
  RF:   { x: 500, y: 100 },
}

// Depth chart: wider spacing for tall cards with full player lists
const DEPTH_COORDS: Record<string, { x: number; y: number }> = {
  C:    { x: 450, y: 580 },
  '1B': { x: 670, y: 410 },
  '2B': { x: 550, y: 260 },
  SS:   { x: 350, y: 260 },
  '3B': { x: 230, y: 410 },
  LF:   { x: 150, y: 110 },
  CF:   { x: 450, y: 40 },
  RF:   { x: 750, y: 110 },
}

// Full lineup slots per Section 2.4 — wider viewbox to fit MI/CI/OF
const LINEUP_COORDS: Record<string, { x: number; y: number }> = {
  CF:   { x: 350, y: 25 },
  LF:   { x: 95, y: 90 },
  RF:   { x: 605, y: 90 },
  OF:   { x: 500, y: 45 },
  SS:   { x: 245, y: 195 },
  '2B': { x: 455, y: 195 },
  MI:   { x: 350, y: 155 },
  '3B': { x: 145, y: 300 },
  '1B': { x: 555, y: 300 },
  CI:   { x: 350, y: 360 },
  C:    { x: 350, y: 440 },
}

function RankBadge({ rank, total, size = 'sm' }: { rank: number | null; total: number; size?: 'sm' | 'lg' }) {
  if (rank === null) return null
  const dim = size === 'lg' ? 'w-[18px] h-[18px] text-[9px]' : 'w-4 h-4 text-[8px]'
  const bg = rank === 1 ? 'bg-green-500' : rank <= 3 ? 'bg-blue-500' : rank <= Math.ceil(total / 2) ? 'bg-gray-400' : 'bg-red-400'
  return (
    <span className={`inline-flex items-center justify-center rounded-full text-white font-bold ${dim} ${bg}`}>
      {rank}
    </span>
  )
}

export default function Diamond({ positions, mode = 'roster' }: DiamondProps) {
  const isLineup = mode === 'bestLineup'
  const isDepth = mode === 'depthChart'
  const coords = isDepth ? DEPTH_COORDS : isLineup ? LINEUP_COORDS : ROSTER_COORDS
  const vw = isDepth ? 900 : isLineup ? 700 : 600
  const vh = isDepth ? 750 : 500
  // Center X for diamond shape
  const cx = isDepth ? 450 : isLineup ? 350 : 300

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} className={`w-full ${isDepth ? 'max-w-[900px]' : isLineup ? 'max-w-[700px]' : 'max-w-[600px]'} mx-auto`}>
      {/* Outfield grass */}
      <path
        d={isDepth
          ? `M 30,350 Q 30,10 ${cx},10 Q ${vw - 30},10 ${vw - 30},350 L ${cx + 180},350 Q ${cx + 180},200 ${cx},150 Q ${cx - 180},200 ${cx - 180},350 Z`
          : isLineup
          ? `M 30,260 Q 30,0 ${cx},0 Q ${vw - 30},0 ${vw - 30},260 L ${cx + 130},260 Q ${cx + 130},140 ${cx},100 Q ${cx - 130},140 ${cx - 130},260 Z`
          : `M 30,250 Q 30,10 ${cx},10 Q ${vw - 30},10 ${vw - 30},250 L ${cx + 130},250 Q ${cx + 130},140 ${cx},100 Q ${cx - 130},140 ${cx - 130},250 Z`
        }
        className="fill-green-200 dark:fill-green-900/40"
      />

      {/* Infield dirt */}
      <polygon
        points={isDepth
          ? `${cx},530 ${cx + 180},350 ${cx},170 ${cx - 180},350`
          : isLineup
          ? `${cx},390 ${cx + 130},260 ${cx},130 ${cx - 130},260`
          : `${cx},380 ${cx + 130},250 ${cx},120 ${cx - 130},250`
        }
        className="fill-amber-100 dark:fill-amber-900/30"
      />

      {/* Base paths */}
      <polygon
        points={isDepth
          ? `${cx},530 ${cx + 180},350 ${cx},170 ${cx - 180},350`
          : isLineup
          ? `${cx},390 ${cx + 130},260 ${cx},130 ${cx - 130},260`
          : `${cx},380 ${cx + 130},250 ${cx},120 ${cx - 130},250`
        }
        className="fill-none stroke-white dark:stroke-gray-400"
        strokeWidth="2"
      />

      {/* Bases */}
      {(isDepth
        ? [[cx, 530], [cx + 180, 350], [cx, 170], [cx - 180, 350]]
        : isLineup
        ? [[cx, 390], [cx + 130, 260], [cx, 130], [cx - 130, 260]]
        : [[cx, 380], [cx + 130, 250], [cx, 120], [cx - 130, 250]]
      ).map(([bx, by], i) => (
        <rect key={i} x={bx - 7} y={by - 7} width="14" height="14" transform={`rotate(45 ${bx} ${by})`} className="fill-white" />
      ))}

      {/* Position cards via foreignObject */}
      {Object.entries(coords).map(([pos, coord]) => {
        const card = positions[pos]
        if (!card) return null
        const label = card.label || pos

        if (isDepth) {
          const cardW = 140
          const maxVisiblePlayers = 8
          const playerCount = card.players.length
          const visibleCount = Math.min(playerCount, maxVisiblePlayers)
          const cardH = Math.max(50, 24 + visibleCount * 15 + (playerCount > maxVisiblePlayers ? 14 : 0))
          return (
            <foreignObject
              key={pos}
              x={coord.x - cardW / 2}
              y={coord.y - cardH / 2}
              width={cardW}
              height={cardH}
            >
              <div className="bg-white/90 dark:bg-gray-800/90 rounded shadow-sm border border-gray-200 dark:border-gray-600 p-1.5 text-[10px] leading-tight h-full flex flex-col">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-bold text-gray-700 dark:text-gray-200">{label}</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    {card.totalValue.toFixed(0)}
                  </span>
                  <RankBadge rank={card.leagueRank} total={card.totalFranchises} />
                </div>
                <div className={`flex-1 ${playerCount > maxVisiblePlayers ? 'overflow-y-auto' : ''}`}>
                  {card.players.slice(0, maxVisiblePlayers).map((p, i) => (
                    <div key={i} className={`truncate ${p.isFarm ? 'italic text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'} ${i === 0 && !p.isFarm ? 'font-semibold' : ''}`}>
                      {p.name} <span className="text-gray-400">{p.value.toFixed(0)}</span>
                    </div>
                  ))}
                  {playerCount > maxVisiblePlayers && (
                    <div className="text-gray-400 dark:text-gray-500">+{playerCount - maxVisiblePlayers} more</div>
                  )}
                </div>
              </div>
            </foreignObject>
          )
        }

        if (isLineup) {
          const player = card.players[0]
          const cardW = 115
          const cardH = 48
          return (
            <foreignObject
              key={pos}
              x={coord.x - cardW / 2}
              y={coord.y - cardH / 2}
              width={cardW}
              height={cardH}
            >
              <div className={`rounded shadow border p-1 text-[10px] leading-tight h-full flex flex-col justify-center ${
                player
                  ? 'bg-white/95 dark:bg-gray-800/95 border-gray-200 dark:border-gray-600'
                  : 'bg-gray-100/80 dark:bg-gray-700/80 border-dashed border-gray-300 dark:border-gray-600'
              }`}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-bold text-gray-500 dark:text-gray-400 text-[9px]">{label}</span>
                  <RankBadge rank={card.leagueRank} total={card.totalFranchises} size="sm" />
                </div>
                {player ? (
                  <div className={`truncate ${player.isFarm ? 'italic text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white font-semibold'}`}>
                    {player.name}
                    <span className="ml-1 font-bold text-blue-600 dark:text-blue-400">{player.value.toFixed(0)}</span>
                  </div>
                ) : (
                  <div className="text-gray-400 dark:text-gray-500 text-center">—</div>
                )}
              </div>
            </foreignObject>
          )
        }

        // Roster mode
        const cardW = 120
        const playerCount = card.players.length
        const cardH = Math.max(50, 24 + Math.min(playerCount, 3) * 16 + (playerCount > 3 ? 14 : 0))
        return (
          <foreignObject
            key={pos}
            x={coord.x - cardW / 2}
            y={coord.y - cardH / 2}
            width={cardW}
            height={cardH}
          >
            <div className="bg-white/90 dark:bg-gray-800/90 rounded shadow-sm border border-gray-200 dark:border-gray-600 p-1.5 text-[10px] leading-tight">
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-bold text-gray-700 dark:text-gray-200">{label}</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  {card.totalValue.toFixed(0)}
                </span>
                <RankBadge rank={card.leagueRank} total={card.totalFranchises} />
              </div>
              {card.players.slice(0, 3).map((p, i) => (
                <div key={i} className={`truncate ${p.isFarm ? 'italic text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'} ${i === 0 && !p.isFarm ? 'font-semibold' : ''}`}>
                  {p.name} <span className="text-gray-400">{p.value.toFixed(0)}</span>
                </div>
              ))}
              {playerCount > 3 && (
                <div className="text-gray-400 dark:text-gray-500">+{playerCount - 3} more</div>
              )}
            </div>
          </foreignObject>
        )
      })}
    </svg>
  )
}
