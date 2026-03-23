import { Router, Request, Response, NextFunction } from 'express'
import multer from 'multer'
import path from 'path'
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
import { extractVideoFrames } from '../lib/videoFrames'
import { computeFinalScore, computeVerdict, AnalysisResult, Lang } from '../types'
import { rateLimitMiddleware } from '../middleware/rateLimit'

// Accepted MIME types.
// HEIC/HEIF are intentionally excluded: sharp on Railway lacks libheif and cannot
// decode them. Without HEIC in the accept list, iOS Safari auto-converts HEIC→JPEG
// before uploading. If a HEIC file arrives anyway, normalizeBuffer will throw and
// we return HEIC_NOT_SUPPORTED (see catch block below).
const ACCEPTED_MIMETYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
])

const HEIC_MIMETYPES = new Set(['image/heic', 'image/heif', 'image/heic-sequence'])
const HEIC_EXTENSIONS = new Set(['.heic', '.heif'])

const ACCEPTED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif',
  '.mp4', '.mov', '.avi',
])

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype.toLowerCase()
    const ext  = path.extname(file.originalname).toLowerCase()

    if (HEIC_MIMETYPES.has(mime) || HEIC_EXTENSIONS.has(ext)) {
      // Reject early with a clear message. iOS sends HEIC only when the client's
      // accept list explicitly includes image/heic — our frontend never does this.
      console.log('[upload] HEIC rejected:', mime, ext)
      cb(new Error('HEIC_NOT_SUPPORTED'))
      return
    }

    const allowed = ACCEPTED_MIMETYPES.has(mime) || ACCEPTED_EXTENSIONS.has(ext) || mime === 'application/octet-stream'
    console.log('[upload] mimetype:', mime, '| ext:', ext, '| allowed:', allowed)
    cb(null, allowed)
  },
})

export const analyzeRouter = Router()

// Inline multer error handler: catches fileFilter rejections (e.g. HEIC_NOT_SUPPORTED)
// before they bubble up as unhandled Express errors.
function uploadMiddleware(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === 'HEIC_NOT_SUPPORTED') {
        res.status(415).json({ success: false, error: 'HEIC_NOT_SUPPORTED', code: 'HEIC_NOT_SUPPORTED' })
        return
      }
      next(err)
      return
    }
    next()
  })
}

/**
 * Returns the index of the element whose score is closest to the median.
 * For a single-element array always returns 0.
 * Used for video analysis: run each local analyzer on all extracted frames
 * and pick the result that best represents the "typical" frame — avoiding
 * outliers caused by motion blur, transitions, or unusual keyframes.
 */
function medianIndex(scores: number[]): number {
  if (scores.length === 1) return 0
  const indexed = scores.map((s, i) => ({ s, i })).sort((a, b) => a.s - b.s)
  return indexed[Math.floor(indexed.length / 2)].i
}

analyzeRouter.post(
  '/',
  rateLimitMiddleware,
  uploadMiddleware,
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

    // ── Normalize ──────────────────────────────────────────────────────────────
    // For images: convert HEIC/HEIF/AVIF/GIF → JPEG with orientation fix.
    //   rawBuffer is kept for exifAnalyzer (reads native EXIF before conversion).
    //   All other analyzers receive the normalized JPEG.
    //
    // For videos: extract frames with ffmpeg.
    //   keyFrame (middle frame) is used for EXIF + external API analyzers.
    //   All frames are passed to local image analyzers (median aggregation)
    //   and to temporalAnalyzer.
    let buffer: Buffer            // keyFrame (image or middle video frame)
    let videoFrames: Buffer[] = [] // all frames — only populated for video

    try {
      if (isVideo) {
        const extracted = await extractVideoFrames(rawBuffer)
        buffer = extracted.keyFrame
        videoFrames = extracted.frames
      } else {
        buffer = await normalizeBuffer(rawBuffer)
      }
    } catch (err) {
      console.error('[normalize/extract error]', err)
      const errMsg = String(err instanceof Error ? err.message : err).toLowerCase()
      const isHeicErr = errMsg.includes('heif') || errMsg.includes('heic')
      res.status(isHeicErr ? 415 : 422).json({
        success: false,
        error: isHeicErr ? 'HEIC_NOT_SUPPORTED' : (isVideo ? 'Could not extract frames from video' : 'Unsupported image format'),
        code: isHeicErr ? 'HEIC_NOT_SUPPORTED' : 'UNSUPPORTED_FORMAT',
      })
      return
    }

    // For video: run local image analyzers on all extracted frames and aggregate
    // by median score. This avoids relying on a single frame that might be a
    // motion-blur outlier or an unrepresentative transition frame.
    // For images: analysisFrames = [buffer], so all paths below behave identically.
    const analysisFrames = isVideo ? videoFrames : [buffer]

    if (isVideo && analysisFrames.length > 1) {
      console.log(`[analyze] video multi-frame: analyzing ${analysisFrames.length} frames, aggregating by median`)
    }

    try {
      // ── Phase 1: EXIF ──────────────────────────────────────────────────────
      // Always runs on keyFrame only.
      // Video frames extracted by ffmpeg have no meaningful camera EXIF, so
      // multi-frame EXIF would just return the same "no EXIF" result each time.
      const originalMime = req.file?.mimetype.toLowerCase() ?? ''
      const originalExt  = path.extname(req.file?.originalname ?? '').toLowerCase()
      const isHeicSource = ['image/heic', 'image/heif', 'image/heic-sequence'].includes(originalMime) ||
        ['.heic', '.heif'].includes(originalExt)

      const exifResult = await exifAnalyzer(buffer, lang, { isHeicSource })
      const hasConfirmedCamera = exifResult.score < 20

      // ── Phase 2a: noise on all frames → hasConfirmedReal ──────────────────
      // For video, averaging noise across frames gives a more reliable signal
      // than a single frame (some frames may be temporarily blurred by motion).
      const noiseAll = await Promise.all(analysisFrames.map((f) => noiseAnalyzer(f, lang)))
      const noiseResult = noiseAll[medianIndex(noiseAll.map((r) => r.score))]
      const hasNaturalNoise = noiseResult.score < 25
      // hasConfirmedReal: at least one strong signal confirms this is a real photo/video.
      // Used by ELA/gradient/shadow to apply false-positive caps.
      const hasConfirmedReal = hasConfirmedCamera || hasNaturalNoise

      // ── Phase 2b: local image analyzers — all frames, then pick median ─────
      // Running in parallel: 7 analyzers × N frames.
      // External APIs (hive, sightengine, transformers) run on keyFrame only
      // to avoid multiplying API costs by the number of frames.
      const [
        elaAll,
        gradientAll,
        textureAll,
        fftAll,
        shadowAll,
        symmetryAll,
        statsAll,
      ] = await Promise.all([
        Promise.all(analysisFrames.map((f) => elaAnalyzer(f, lang, { hasConfirmedReal }))),
        Promise.all(analysisFrames.map((f) => gradientAnalyzer(f, lang, { hasConfirmedReal }))),
        Promise.all(analysisFrames.map((f) => textureAnalyzer(f, lang))),
        Promise.all(analysisFrames.map((f) => fftAnalyzer(f, lang))),
        Promise.all(analysisFrames.map((f) => shadowAnalyzer(f, lang, { hasConfirmedReal }))),
        Promise.all(analysisFrames.map((f) => symmetryAnalyzer(f, lang))),
        Promise.all(analysisFrames.map((f) => statsAnalyzer(f, lang))),
      ])

      // Pick the result whose score is the median (avoids outlier frames).
      // For viz analyzers the corresponding visualization (elaMap etc.) comes
      // from the same median-score frame, keeping result and image consistent.
      const { result: elaResult,      elaMap }      = elaAll[medianIndex(elaAll.map((r) => r.result.score))]
      const { result: gradientResult, gradientMap }  = gradientAll[medianIndex(gradientAll.map((r) => r.result.score))]
      const textureResult                            = textureAll[medianIndex(textureAll.map((r) => r.score))]
      const { result: fftResult,      fftSpectrum }  = fftAll[medianIndex(fftAll.map((r) => r.result.score))]
      const { result: shadowResult,   shadowViz }    = shadowAll[medianIndex(shadowAll.map((r) => r.result.score))]
      const symmetryResult                           = symmetryAll[medianIndex(symmetryAll.map((r) => r.score))]
      const statsResult                              = statsAll[medianIndex(statsAll.map((r) => r.score))]

      // ── Phase 2c: external APIs — keyFrame only ────────────────────────────
      const [hiveResult, sightengineResult, transformersResult] = await Promise.all([
        hiveAnalyzer(buffer, lang),
        sightengineAnalyzer(buffer, lang),
        transformersAnalyzer(buffer, lang),
      ])

      // ── Phase 3: temporal — all frames (video only) ────────────────────────
      const temporalResult = await temporalAnalyzer(
        isVideo ? videoFrames : [buffer],
        lang,
      )

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
