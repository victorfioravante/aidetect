import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import jsPDF from 'jspdf'
import { useAnalysisStore } from '../store/analysisStore'
import { ScoreGauge } from './ScoreGauge'
import { DetectorCard } from './DetectorCard'
import { AdSlot } from './AdSlot'
import { AnalysisResult } from '../types'

const DETECTOR_KEYS = [
  'symmetry', 'stats', 'fft', 'texture', 'shadow', 'ela', 'gradient', 'hive', 'sightengine',
] as const

type VizKey = 'elaMap' | 'gradientMap' | 'fftSpectrum' | 'shadowViz'

interface VizCard {
  key: VizKey
  i18nBase: string
}

const VIZ_CARDS: VizCard[] = [
  { key: 'elaMap',      i18nBase: 'viz.ela' },
  { key: 'gradientMap', i18nBase: 'viz.gradient' },
  { key: 'fftSpectrum', i18nBase: 'viz.fft' },
  { key: 'shadowViz',   i18nBase: 'viz.shadow' },
]

function exportPDF(result: AnalysisResult) {
  const doc = new jsPDF()
  doc.setFontSize(18)
  doc.text('AIDetect.pro — Analysis Report', 20, 20)
  doc.setFontSize(12)
  doc.text(`Verdict: ${result.verdict}`, 20, 35)
  doc.text(`Score: ${result.score}/100`, 20, 45)
  doc.text(`Confidence: ${result.confidence}`, 20, 55)
  doc.text(`Analyzed: ${new Date(result.meta.processedAt).toLocaleString()}`, 20, 65)
  doc.setFontSize(10)
  let y = 80
  for (const key of DETECTOR_KEYS) {
    const d = result.breakdown[key]
    if (d) {
      doc.text(`${key}: ${d.score}% — ${d.label}`, 20, y)
      y += 10
    }
  }
  doc.save(`aidetect-${result.id}.pdf`)
}

function VizModal({ src, title, desc, onClose }: { src: string; title: string; desc: string; onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="relative max-w-2xl w-full bg-gray-900 rounded-2xl p-4 border border-gray-700"
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-white font-semibold mb-1">{title}</p>
        <p className="text-gray-400 text-xs mb-3">{desc}</p>
        <img src={src} alt={title} className="w-full rounded-lg" style={{ imageRendering: 'pixelated' }} />
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-white text-lg leading-none"
          aria-label="Close"
        >
          ✕
        </button>
      </motion.div>
    </motion.div>
  )
}

export function ResultPanel() {
  const { t } = useTranslation()
  const result = useAnalysisStore((s) => s.result)
  const adSlotResult = import.meta.env.VITE_ADSENSE_SLOT_RESULT
  const [zoomedViz, setZoomedViz] = useState<{ src: string; title: string; desc: string } | null>(null)

  if (!result) return null

  const activeViz = VIZ_CARDS.filter(({ key }) => !!result.visualizations[key])

  return (
    <>
      <motion.div
        className="w-full max-w-4xl mx-auto mt-10 space-y-6"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="text-white text-2xl font-bold text-center">{t('result.title')}</h2>

        {/* Score + verdict */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 flex flex-col items-center">
          <ScoreGauge score={result.score} verdict={result.verdict} confidence={result.confidence} />

          <div className="flex gap-4 mt-6">
            <button
              onClick={() => exportPDF(result)}
              className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg font-medium transition-colors border border-gray-700"
            >
              {t('result.export')}
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(window.location.href)}
              className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg font-medium transition-colors border border-gray-700"
            >
              {t('result.share')}
            </button>
          </div>
        </div>

        {/* Visualizations — 2x2 grid */}
        {activeViz.length > 0 && (
          <div className="grid grid-cols-2 gap-4">
            {activeViz.map(({ key, i18nBase }) => {
              const src = `data:image/png;base64,${result.visualizations[key]}`
              const title = t(`${i18nBase}.title`)
              const desc = t(`${i18nBase}.desc`)
              return (
                <div
                  key={key}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-3 cursor-zoom-in group"
                  onClick={() => setZoomedViz({ src, title, desc })}
                  title={desc}
                >
                  <p className="text-gray-400 text-xs mb-2 text-center font-medium group-hover:text-gray-200 transition-colors">
                    {title}
                  </p>
                  <img
                    src={src}
                    alt={title}
                    className="w-full rounded group-hover:opacity-90 transition-opacity"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  <p className="text-gray-600 text-[10px] mt-1 text-center leading-tight line-clamp-2">{desc}</p>
                </div>
              )
            })}
          </div>
        )}

        {/* Detector breakdown */}
        <div>
          <h3 className="text-white font-semibold mb-4">{t('result.detectors')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {DETECTOR_KEYS.map((key, i) => {
              const det = result.breakdown[key]
              if (!det) return null
              return <DetectorCard key={key} name={key} result={det} index={i} />
            })}
          </div>
        </div>

        {/* Ad after result */}
        <div className="flex justify-center py-2">
          <AdSlot slot={adSlotResult} format="leaderboard" />
        </div>
      </motion.div>

      {/* Zoom modal */}
      <AnimatePresence>
        {zoomedViz && (
          <VizModal
            src={zoomedViz.src}
            title={zoomedViz.title}
            desc={zoomedViz.desc}
            onClose={() => setZoomedViz(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
