import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useAnalysisStore } from '../store/analysisStore'
import { AdSlot } from './AdSlot'

export function RateLimitModal() {
  const { t } = useTranslation()
  const { rateLimitReset, setRateLimit } = useAnalysisStore()
  const [countdown, setCountdown] = useState('')
  const adSlotModal = import.meta.env.VITE_ADSENSE_SLOT_MODAL

  useEffect(() => {
    if (!rateLimitReset) return

    const interval = setInterval(() => {
      const reset = new Date(rateLimitReset).getTime()
      const now = Date.now()
      const diff = reset - now

      if (diff <= 0) {
        setCountdown('00:00:00')
        setRateLimit('')
        return
      }

      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setCountdown(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }, 1000)

    return () => clearInterval(interval)
  }, [rateLimitReset, setRateLimit])

  return (
    <AnimatePresence>
      {rateLimitReset && (
        <motion.div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-md w-full text-center"
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
          >
            <div className="text-5xl mb-4">⏳</div>
            <h3 className="text-white text-xl font-bold mb-2">{t('limit.reached')}</h3>
            <p className="text-gray-400 text-sm mb-4">{t('limit.countdown')}</p>
            <div className="text-3xl font-mono text-violet-400 font-bold mb-6">{countdown}</div>

            <AdSlot slot={adSlotModal} format="rectangle" className="mb-4" />

            <button
              onClick={() => setRateLimit('')}
              className="text-gray-500 text-sm hover:text-gray-300 transition-colors"
            >
              ✕ Close
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
