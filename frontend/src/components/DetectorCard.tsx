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

  const barColor = result.score >= 70
    ? 'bg-red-500'
    : result.score >= 40
    ? 'bg-amber-500'
    : 'bg-green-500'

  return (
    <motion.div
      className="bg-gray-900 border border-gray-800 rounded-xl p-4"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.07 }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${result.passed ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-white text-sm font-medium">{t(`detectors.${name}`)}</span>
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
