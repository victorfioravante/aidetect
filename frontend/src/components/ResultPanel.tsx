import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import jsPDF from 'jspdf'
import { useAnalysisStore } from '../store/analysisStore'
import { ScoreGauge } from './ScoreGauge'
import { DetectorCard } from './DetectorCard'
import { AdSlot } from './AdSlot'
import { AnalysisResult } from '../types'
import i18n from '../i18n'

const ALL_DETECTOR_KEYS = [
  'symmetry', 'stats', 'fft', 'texture', 'shadow', 'ela', 'gradient',
  'exif', 'noise', 'temporal', 'platformLabel',
  'hive', 'sightengine', 'transformers',
] as const

type DetectorKey = typeof ALL_DETECTOR_KEYS[number]

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

const VERDICT_RGB: Record<string, [number, number, number]> = {
  AI_GENERATED: [239, 68, 68],
  SUSPICIOUS:   [245, 158, 11],
  AUTHENTIC:    [34, 197, 94],
}

function scoreBarColor(score: number): [number, number, number] {
  if (score >= 70) return [239, 68, 68]
  if (score >= 40) return [245, 158, 11]
  return [34, 197, 94]
}

async function exportPDF(result: AnalysisResult) {
  const t = (key: string) => i18n.t(key)
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const PAGE_W = 210
  const MARGIN = 15
  const CONTENT_W = PAGE_W - MARGIN * 2

  // ── HEADER BAR ──────────────────────────────────────────────────────────────
  doc.setFillColor(17, 24, 39) // gray-900
  doc.rect(0, 0, PAGE_W, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('AIDetect.pro', MARGIN, 10)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(156, 163, 175) // gray-400
  doc.text('aidetect.pro', MARGIN, 16)
  // Report title (right-aligned)
  doc.setFontSize(10)
  doc.setTextColor(209, 213, 219) // gray-300
  doc.text(t('pdf.title'), PAGE_W - MARGIN, 10, { align: 'right' })
  doc.setFontSize(7)
  doc.setTextColor(107, 114, 128) // gray-500
  doc.text(`${t('pdf.analysisId')}: ${result.id}`, PAGE_W - MARGIN, 16, { align: 'right' })

  // ── VERDICT BLOCK ───────────────────────────────────────────────────────────
  const vColor = VERDICT_RGB[result.verdict] ?? [100, 116, 139]
  doc.setFillColor(...vColor)
  doc.roundedRect(MARGIN, 28, CONTENT_W, 28, 3, 3, 'F')

  const verdictLabel = t(`verdict.${result.verdict}`)
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(verdictLabel.toUpperCase(), MARGIN + 8, 40)

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(`Score: ${result.score}/100`, MARGIN + 8, 50)

  // Confidence badge (right side of verdict block)
  const confLabel = `${t('result.confidence')}: ${t(`confidence.${result.confidence}`)}`
  doc.setFontSize(10)
  doc.text(confLabel, PAGE_W - MARGIN - 8, 40, { align: 'right' })

  // ── METADATA ────────────────────────────────────────────────────────────────
  let y = 68
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(55, 65, 81) // gray-700

  const metaItems: [string, string][] = [
    [t('pdf.mediaType'), result.meta.mediaType === 'video' ? t('pdf.video') : t('pdf.image')],
    [t('pdf.analyzedAt'), new Date(result.meta.processedAt).toLocaleString()],
  ]
  if (result.meta.platform) metaItems.push([t('pdf.platform'), result.meta.platform])
  if (result.meta.sourceUrl) metaItems.push([t('pdf.source'), result.meta.sourceUrl])

  for (const [label, value] of metaItems) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(55, 65, 81)
    doc.text(`${label}:`, MARGIN, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(17, 24, 39)
    const maxWidth = CONTENT_W - 40
    const lines = doc.splitTextToSize(value, maxWidth)
    doc.text(lines, MARGIN + 38, y)
    y += lines.length > 1 ? lines.length * 5 + 2 : 7
  }

  // ── SEPARATOR ───────────────────────────────────────────────────────────────
  y += 2
  doc.setDrawColor(229, 231, 235) // gray-200
  doc.setLineWidth(0.3)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 6

  // ── DETECTORS SECTION ───────────────────────────────────────────────────────
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(17, 24, 39)
  doc.text(t('result.detectors').toUpperCase(), MARGIN, y)
  y += 6

  const BAR_W = 38        // mm — progress bar total width
  const BAR_H = 3.5       // mm — progress bar height
  const COL_W = CONTENT_W / 2
  const NAME_W = COL_W - BAR_W - 22  // mm for detector name

  let col = 0
  let rowY = y

  for (const key of ALL_DETECTOR_KEYS) {
    const det = result.breakdown[key]
    if (!det) continue
    if (key === 'temporal' && det.skipped) continue
    if (key === 'platformLabel' && !result.meta.sourceUrl && det.abstained) continue

    const xBase = MARGIN + col * COL_W
    const itemY = rowY

    // Detector name
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(31, 41, 55)
    const nameStr = t(`detectors.${key}`)
    doc.text(doc.splitTextToSize(nameStr, NAME_W - 2)[0], xBase, itemY)

    // Score bar background (track)
    const barX = xBase + NAME_W
    doc.setFillColor(229, 231, 235)
    doc.roundedRect(barX, itemY - 3.2, BAR_W, BAR_H, 1, 1, 'F')

    // Score bar fill
    const fillW = (det.abstained || det.skipped) ? 0 : Math.max(1, (det.score / 100) * BAR_W)
    if (fillW > 0) {
      const [r, g, b] = scoreBarColor(det.score)
      doc.setFillColor(r, g, b)
      doc.roundedRect(barX, itemY - 3.2, fillW, BAR_H, 1, 1, 'F')
    }

    // Score number
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(55, 65, 81)
    const scoreStr = (det.abstained || det.skipped) ? '—' : `${det.score}%`
    doc.text(scoreStr, barX + BAR_W + 2, itemY)

    // Pass/fail indicator
    const indicator = (det.abstained || det.skipped) ? '·' : (det.passed ? '✓' : '✗')
    const [ir, ig, ib] = det.passed ? [34, 197, 94] : [239, 68, 68]
    if (!det.abstained && !det.skipped) doc.setTextColor(ir, ig, ib)
    else doc.setTextColor(156, 163, 175)
    doc.setFontSize(8)
    doc.text(indicator, barX + BAR_W + 11, itemY)

    // Label (small, below)
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(107, 114, 128)
    const labelLines = doc.splitTextToSize(det.label, COL_W - 4)
    doc.text(labelLines[0], xBase, itemY + 4)

    col++
    if (col === 2) {
      col = 0
      rowY += 13
    }

    // Page break guard for detectors (leave room for footer)
    if (rowY > 270) {
      doc.addPage()
      rowY = 20
    }
  }

  // ── PAGE 2: VISUALIZATIONS ──────────────────────────────────────────────────
  const activeViz = VIZ_CARDS.filter(({ key }) => !!result.visualizations[key])
  if (activeViz.length > 0) {
    doc.addPage()

    // Header bar on page 2
    doc.setFillColor(17, 24, 39)
    doc.rect(0, 0, PAGE_W, 14, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('AIDetect.pro', MARGIN, 9)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(156, 163, 175)
    doc.text(t('pdf.visualizations').toUpperCase(), PAGE_W - MARGIN, 9, { align: 'right' })

    const IMG_W = (CONTENT_W - 8) / 2  // 2-column grid with 8mm gap
    const IMG_H = IMG_W                 // square aspect
    let vizY = 22

    for (let i = 0; i < activeViz.length; i++) {
      const { key, i18nBase } = activeViz[i]
      const b64 = result.visualizations[key]
      const col2 = i % 2
      const xImg = MARGIN + col2 * (IMG_W + 8)

      // Image
      try {
        doc.addImage(`data:image/png;base64,${b64}`, 'PNG', xImg, vizY, IMG_W, IMG_H)
      } catch {
        // If image fails, draw placeholder box
        doc.setFillColor(243, 244, 246)
        doc.rect(xImg, vizY, IMG_W, IMG_H, 'F')
      }

      // Title below image
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(31, 41, 55)
      doc.text(t(`${i18nBase}.title`), xImg, vizY + IMG_H + 5)

      // Description
      doc.setFontSize(6.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(107, 114, 128)
      const descLines = doc.splitTextToSize(t(`${i18nBase}.desc`), IMG_W)
      doc.text(descLines.slice(0, 2), xImg, vizY + IMG_H + 10)

      // Move to next row after every 2 images
      if (col2 === 1 || i === activeViz.length - 1) {
        vizY += IMG_H + 22
      }
    }

    // Footer
    doc.setDrawColor(229, 231, 235)
    doc.setLineWidth(0.3)
    doc.line(MARGIN, 277, PAGE_W - MARGIN, 277)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(156, 163, 175)
    doc.text(t('pdf.generatedBy'), MARGIN, 282)
    doc.text('aidetect.pro', PAGE_W - MARGIN, 282, { align: 'right' })
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
  const [exporting, setExporting] = useState(false)

  if (!result) return null

  async function handleExport() {
    if (!result || exporting) return
    setExporting(true)
    try {
      await exportPDF(result)
    } finally {
      setExporting(false)
    }
  }

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
          {/* Social thumbnail */}
          {result.meta.thumbnailUrl && (
            <div className="mb-4 w-full max-w-xs">
              <img
                src={result.meta.thumbnailUrl}
                alt="Thumbnail"
                className="w-full rounded-xl object-cover max-h-48"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
              {result.meta.platform && (
                <p className="text-gray-500 text-xs text-center mt-1">{result.meta.platform}</p>
              )}
            </div>
          )}
          <ScoreGauge score={result.score} verdict={result.verdict} confidence={result.confidence} />

          <div className="flex gap-4 mt-6">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg font-medium transition-colors border border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? t('pdf.exporting') : t('result.export')}
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
            {ALL_DETECTOR_KEYS.map((key, i) => {
              const det = result.breakdown[key as DetectorKey]
              if (!det) return null
              // Hide temporal if it was skipped (image analysis)
              if (key === 'temporal' && det.skipped) return null
              // Hide platformLabel if not from a social URL
              if (key === 'platformLabel' && !result.meta.sourceUrl && det.abstained) return null
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
