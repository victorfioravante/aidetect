import { Router, Request, Response } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { elaAnalyzer } from '../analyzers/ela'
import { gradientAnalyzer } from '../analyzers/gradient'
import { textureAnalyzer } from '../analyzers/texture'
import { fftAnalyzer } from '../analyzers/fft'
import { shadowAnalyzer } from '../analyzers/shadow'
import { symmetryAnalyzer } from '../analyzers/symmetry'
import { statsAnalyzer } from '../analyzers/stats'
import { hiveAnalyzer } from '../analyzers/hive'
import { sightengineAnalyzer } from '../analyzers/sightengine'
import { transformersAnalyzer } from '../analyzers/transformers'
import { exifAnalyzer } from '../analyzers/exif'
import { noiseAnalyzer } from '../analyzers/noise'
import { temporalAnalyzer } from '../analyzers/temporal'
import { normalizeBuffer } from '../lib/imageUtils'
import { computeFinalScore, computeVerdict, AnalysisResult, Lang } from '../types'
import { rateLimitMiddleware } from '../middleware/rateLimit'

// All accepted MIME types — HEIC/HEIF/AVIF added for iPhone and modern formats
const ACCEPTED_MIMETYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/avif',
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
])

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB
  fileFilter: (_req, file, cb) => {
    // Some browsers/OS report HEIC as 'image/heic' or 'image/heif'; others as
    // 'application/octet-stream'. Accept both and let sharp handle the conversion.
    const mime = file.mimetype.toLowerCase()
    cb(null, ACCEPTED_MIMETYPES.has(mime) || mime === 'application/octet-stream')
  },
})

export const analyzeRouter = Router()

analyzeRouter.post(
  '/',
  rateLimitMiddleware,
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    const lang: Lang = (req.body.lang as Lang) || 'pt'

    let rawBuffer: Buffer | null = null
    const sourceUrl = req.body.url as string | undefined

    if (req.file) {
      rawBuffer = req.file.buffer
    } else if (sourceUrl) {
      res.status(400).json({ success: false, error: 'URL extraction not yet implemented' })
      return
    }

    if (!rawBuffer) {
      res.status(400).json({ success: false, error: 'No file or URL provided' })
      return
    }

    const isVideo = req.file?.mimetype.startsWith('video') ?? false

    // ── Normalize: convert HEIC/HEIF/AVIF/GIF → JPEG with orientation fix ──
    // The original (rawBuffer) is passed to exifAnalyzer so it can read the
    // native EXIF before sharp strips the orientation tag.
    // All other analyzers receive the normalized JPEG.
    let buffer: Buffer
    try {
      buffer = isVideo ? rawBuffer : await normalizeBuffer(rawBuffer)
    } catch {
      res.status(422).json({ success: false, error: 'Unsupported image format', code: 'UNSUPPORTED_FORMAT' })
      return
    }

    try {
      // Run all analyzers in parallel.
      // exifAnalyzer uses rawBuffer to preserve original EXIF fields;
      // everything else uses the normalized JPEG buffer.
      const [
        { result: elaResult, elaMap },
        { result: gradientResult, gradientMap },
        textureResult,
        { result: fftResult, fftSpectrum },
        { result: shadowResult, shadowViz },
        symmetryResult,
        statsResult,
        hiveResult,
        sightengineResult,
        transformersResult,
        exifResult,
        noiseResult,
      ] = await Promise.all([
        elaAnalyzer(buffer, lang),
        gradientAnalyzer(buffer, lang),
        textureAnalyzer(buffer, lang),
        fftAnalyzer(buffer, lang),
        shadowAnalyzer(buffer, lang),
        symmetryAnalyzer(buffer, lang),
        statsAnalyzer(buffer, lang),
        hiveAnalyzer(buffer, lang),
        sightengineAnalyzer(buffer, lang),
        transformersAnalyzer(buffer, lang),
        exifAnalyzer(rawBuffer, lang),   // original buffer → real EXIF metadata
        noiseAnalyzer(buffer, lang),
      ])

      // Temporal: not applicable for single-image upload (always skipped)
      const temporalResult = await temporalAnalyzer([buffer], lang)

      // Platform label: not applicable for direct uploads
      const platformLabelResult = {
        score: 0,
        label: lang === 'en' ? 'Not applicable for uploads' : 'Não aplicável para uploads',
        passed: true,
        abstained: true,
      }

      const rawScores = {
        symmetry:      symmetryResult.score,
        stats:         statsResult.score,
        fft:           fftResult.score,
        texture:       textureResult.score,
        shadow:        shadowResult.score,
        ela:           elaResult.score,
        gradient:      gradientResult.score,
        exif:          exifResult.score,
        noise:         noiseResult.score,
        temporal:      temporalResult.score,
        platformLabel: platformLabelResult.score,
        hive:          hiveResult.score,
        sightengine:   sightengineResult.score,
        transformers:  transformersResult.score,
      }

      const rawBreakdown: AnalysisResult['breakdown'] = {
        symmetry:      symmetryResult,
        stats:         statsResult,
        fft:           fftResult,
        texture:       textureResult,
        shadow:        shadowResult,
        ela:           elaResult,
        gradient:      gradientResult,
        exif:          exifResult,
        noise:         noiseResult,
        temporal:      temporalResult,
        platformLabel: platformLabelResult,
        hive:          hiveResult,
        sightengine:   sightengineResult,
        transformers:  transformersResult,
      }

      const { score, effectiveBreakdown } = computeFinalScore(rawScores, rawBreakdown, lang)
      const { verdict, confidence } = computeVerdict(score)

      const result: AnalysisResult = {
        id: uuidv4(),
        verdict,
        score,
        confidence,
        breakdown: effectiveBreakdown,
        visualizations: {
          elaMap,
          gradientMap,
          fftSpectrum,
          shadowViz,
        },
        meta: {
          processedAt: new Date().toISOString(),
          mediaType: isVideo ? 'video' : 'image',
          sourceUrl,
        },
      }

      res.json({ success: true, data: result })
    } catch (err) {
      console.error('Analysis error:', err)
      res.status(500).json({ success: false, error: 'Analysis failed', code: 'ANALYSIS_ERROR' })
    }
  }
)
