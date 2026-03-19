import { Router, Request, Response } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { elaAnalyzer } from '../analyzers/ela'
import { gradientAnalyzer } from '../analyzers/gradient'
import { textureAnalyzer } from '../analyzers/texture'
import { fftAnalyzer } from '../analyzers/fft'
import { shadowAnalyzer } from '../analyzers/shadow'
import { rotationAnalyzer } from '../analyzers/rotation'
import { statsAnalyzer } from '../analyzers/stats'
import { hiveAnalyzer } from '../analyzers/hive'
import { weightedScore, computeVerdict, AnalysisResult, Lang } from '../types'
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
      // Social URL will be handled by /api/social/extract in future phases
      // For now, return error
      res.status(400).json({ success: false, error: 'URL extraction not yet implemented' })
      return
    }

    if (!buffer) {
      res.status(400).json({ success: false, error: 'No file or URL provided' })
      return
    }

    try {
      // Run local analyzers in parallel
      const [
        { result: elaResult, elaMap },
        { result: gradientResult, gradientMap },
        textureResult,
        { result: fftResult, fftSpectrum },
        shadowResult,
        rotationResult,
        statsResult,
        hiveResult,
      ] = await Promise.all([
        elaAnalyzer(buffer, lang),
        gradientAnalyzer(buffer, lang),
        textureAnalyzer(buffer, lang),
        fftAnalyzer(buffer, lang),
        shadowAnalyzer(buffer, lang),
        rotationAnalyzer(buffer, lang),
        statsAnalyzer(buffer, lang),
        hiveAnalyzer(buffer, lang),
      ])

      const rawScores = {
        rotation: rotationResult.score,
        stats: statsResult.score,
        fft: fftResult.score,
        texture: textureResult.score,
        shadow: shadowResult.score,
        ela: elaResult.score,
        hive: hiveResult.score,
      }

      const score = weightedScore(rawScores)
      const { verdict, confidence } = computeVerdict(score)

      const result: AnalysisResult = {
        id: uuidv4(),
        verdict,
        score,
        confidence,
        breakdown: {
          rotation: rotationResult,
          stats: statsResult,
          fft: fftResult,
          texture: textureResult,
          shadow: shadowResult,
          ela: elaResult,
          hive: hiveResult,
        },
        visualizations: {
          elaMap,
          gradientMap,
          fftSpectrum,
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
