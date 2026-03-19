import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Verdict, Confidence } from '../types'

interface Props {
  score: number
  verdict: Verdict
  confidence: Confidence
}

const VERDICT_COLOR: Record<Verdict, string> = {
  AI_GENERATED: '#ef4444',
  SUSPICIOUS: '#f59e0b',
  AUTHENTIC: '#22c55e',
}

const VERDICT_GLOW: Record<Verdict, string> = {
  AI_GENERATED: 'shadow-red-500/40',
  SUSPICIOUS: 'shadow-amber-500/40',
  AUTHENTIC: 'shadow-green-500/40',
}

export function ScoreGauge({ score, verdict, confidence }: Props) {
  const { t } = useTranslation()

  const radius = 80
  const stroke = 12
  const normalizedRadius = radius - stroke / 2
  const circumference = normalizedRadius * 2 * Math.PI
  const progress = (score / 100) * circumference
  const offset = circumference - progress

  const color = VERDICT_COLOR[verdict]
  const glow = VERDICT_GLOW[verdict]

  return (
    <div className="flex flex-col items-center gap-4">
      <div className={`relative rounded-full shadow-2xl ${glow}`}>
        <svg width={radius * 2} height={radius * 2} viewBox={`0 0 ${radius * 2} ${radius * 2}`}>
          {/* Background track */}
          <circle
            cx={radius}
            cy={radius}
            r={normalizedRadius}
            fill="none"
            stroke="#1f2937"
            strokeWidth={stroke}
          />
          {/* Animated progress arc */}
          <motion.circle
            cx={radius}
            cy={radius}
            r={normalizedRadius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference}
            transform={`rotate(-90 ${radius} ${radius})`}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
          {/* Score text */}
          <text x={radius} y={radius - 8} textAnchor="middle" fill="white" fontSize="28" fontWeight="bold">
            {score}
          </text>
          <text x={radius} y={radius + 14} textAnchor="middle" fill="#9ca3af" fontSize="11">
            {t('result.score')}
          </text>
        </svg>
      </div>

      <div className="text-center">
        <motion.div
          className="text-2xl font-black tracking-wider"
          style={{ color }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          {t(`result.verdict.${verdict === 'AI_GENERATED' ? 'ai' : verdict === 'SUSPICIOUS' ? 'suspicious' : 'authentic'}`)}
        </motion.div>
        <div className="text-gray-400 text-sm mt-1">
          {t('result.confidence')}: <span className="text-white font-medium">{t(`confidence.${confidence}`)}</span>
        </div>
      </div>
    </div>
  )
}
