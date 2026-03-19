import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import jsPDF from 'jspdf'
import { useAnalysisStore } from '../store/analysisStore'
import { ScoreGauge } from './ScoreGauge'
import { DetectorCard } from './DetectorCard'
import { AdSlot } from './AdSlot'
import { AnalysisResult } from '../types'

const DETECTOR_KEYS = ['rotation', 'stats', 'fft', 'texture', 'shadow', 'ela', 'hive'] as const

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
    doc.text(`${key}: ${d.score}% — ${d.label}`, 20, y)
    y += 10
  }
  doc.save(`aidetect-${result.id}.pdf`)
}

export function ResultPanel() {
  const { t } = useTranslation()
  const result = useAnalysisStore((s) => s.result)
  const adSlotResult = import.meta.env.VITE_ADSENSE_SLOT_RESULT

  if (!result) return null

  return (
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

      {/* Visualizations */}
      {(result.visualizations.elaMap || result.visualizations.gradientMap || result.visualizations.fftSpectrum) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {result.visualizations.elaMap && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-gray-400 text-xs mb-2 text-center">{t('viz.ela')}</p>
              <img src={`data:image/png;base64,${result.visualizations.elaMap}`} alt="ELA Map" className="w-full rounded" />
            </div>
          )}
          {result.visualizations.gradientMap && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-gray-400 text-xs mb-2 text-center">{t('viz.gradient')}</p>
              <img src={`data:image/png;base64,${result.visualizations.gradientMap}`} alt="Gradient Map" className="w-full rounded" />
            </div>
          )}
          {result.visualizations.fftSpectrum && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-gray-400 text-xs mb-2 text-center">{t('viz.fft')}</p>
              <img src={`data:image/png;base64,${result.visualizations.fftSpectrum}`} alt="FFT Spectrum" className="w-full rounded" />
            </div>
          )}
        </div>
      )}

      {/* Detector breakdown */}
      <div>
        <h3 className="text-white font-semibold mb-4">{t('result.detectors')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {DETECTOR_KEYS.map((key, i) => (
            <DetectorCard key={key} name={key} result={result.breakdown[key]} index={i} />
          ))}
        </div>
      </div>

      {/* Ad after result */}
      <div className="flex justify-center py-2">
        <AdSlot slot={adSlotResult} format="leaderboard" />
      </div>
    </motion.div>
  )
}
