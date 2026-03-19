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
import { computeFinalScore, computeVerdict, AnalysisResult, Lang } from '../types'
import { rateLimitMiddleware } from '../middleware/rateLimit'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const allowed = /image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime|x-msvideo)/
    cb(null, allowed.test(file.mimetype))
  },
})

export const analyzeRouter = Router()

analyzeRouter.post(
  '/',
  rateLimitMiddleware,
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    const lang: Lang = (req.body.lang as Lang) || 'pt'

    let buffer: Buffer | null = null
    const sourceUrl = req.body.url as string | undefined

    if (req.file) {
      buffer = req.file.buffer
    } else if (sourceUrl) {
      res.status(400).json({ success: false, error: 'URL extraction not yet implemented' })
      return
    }

    if (!buffer) {
      res.status(400).json({ success: false, error: 'No file or URL provided' })
      return
    }

    try {
      // Run all analyzers in parallel
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
      ])

      const rawScores = {
        symmetry:     symmetryResult.score,
        stats:        statsResult.score,
        fft:          fftResult.score,
        texture:      textureResult.score,
        shadow:       shadowResult.score,
        ela:          elaResult.score,
        gradient:     gradientResult.score,
        hive:         hiveResult.score,
        sightengine:  sightengineResult.score,
        transformers: transformersResult.score,
      }

      const rawBreakdown: AnalysisResult['breakdown'] = {
        symmetry:    symmetryResult,
        stats:       statsResult,
        fft:         fftResult,
        texture:     textureResult,
        shadow:      shadowResult,
        ela:         elaResult,
        gradient:    gradientResult,
        hive:        hiveResult,
        sightengine: sightengineResult,
        transformers: transformersResult,
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
          mediaType: req.file?.mimetype.startsWith('video') ? 'video' : 'image',
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
