interface AdSlotProps {
  slot: string
  format?: 'banner' | 'rectangle' | 'leaderboard'
  className?: string
}

const DIMENSIONS: Record<string, { w: number; h: number }> = {
  banner: { w: 320, h: 50 },
  leaderboard: { w: 728, h: 90 },
  rectangle: { w: 300, h: 250 },
}

export function AdSlot({ slot, format = 'banner', className = '' }: AdSlotProps) {
  const client = import.meta.env.VITE_ADSENSE_CLIENT
  const { w, h } = DIMENSIONS[format]

  if (!client || !slot) {
    return (
      <div
        className={`ad-placeholder flex items-center justify-center bg-gray-900 border border-dashed border-gray-700 rounded text-gray-600 text-xs ${className}`}
        style={{ width: '100%', maxWidth: w, height: h }}
      >
        Ad {w}×{h}
      </div>
    )
  }

  return (
    <div className={`flex justify-center ${className}`}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', width: w, height: h }}
        data-ad-client={client}
        data-ad-slot={slot}
      />
    </div>
  )
}
