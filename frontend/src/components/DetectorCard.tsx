import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { DetectorResult } from '../types'

interface Props {
  name: string
  result: DetectorResult
  index: number
}

export function DetectorCard({ name, result, index }: Props) {
  const { t } = useTranslation()

  const isAbstained = result.abstained && result.score === 0
  const barColor = isAbstained
    ? 'bg-gray-600'
    : result.score >= 70
    ? 'bg-red-500'
    : result.score >= 40
    ? 'bg-amber-500'
    : 'bg-green-500'

  return (
    <motion.div
      className={`bg-gray-900 border rounded-xl p-4 ${isAbstained ? 'border-gray-700 opacity-60' : 'border-gray-800'}`}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.07 }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full flex-none ${result.passed ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-white text-sm font-medium">{t(`detectors.${name}`)}</span>
          {/* Tooltip icon — CSS-only, no JS */}
          <div className="relative group/tip">
            <span className="text-gray-600 hover:text-gray-400 text-xs cursor-help leading-none select-none">ⓘ</span>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20
              hidden group-hover/tip:block
              bg-gray-800 text-gray-300 text-xs rounded-lg px-3 py-2 w-56
              border border-gray-700 shadow-xl pointer-events-none
              whitespace-normal leading-relaxed text-left">
              {t(`detectorTooltips.${name}`)}
              {/* Tooltip arrow */}
              <span className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0
                border-l-[5px] border-r-[5px] border-t-[5px]
                border-l-transparent border-r-transparent border-t-gray-700" />
            </div>
          </div>
        </div>
        <span className="text-gray-400 text-sm font-mono">{result.score}%</span>
      </div>

      <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden mb-2">
        <motion.div
          className={`h-full rounded-full ${barColor}`}
          initial={{ width: 0 }}
          animate={{ width: `${result.score}%` }}
          transition={{ duration: 0.8, delay: index * 0.07 + 0.3, ease: 'easeOut' }}
        />
      </div>

      <p className="text-gray-500 text-xs">{result.label}</p>
    </motion.div>
  )
}
