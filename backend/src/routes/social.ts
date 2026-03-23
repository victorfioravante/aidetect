import { Router, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import os from 'os'
import fs from 'fs'
import ffmpeg from 'fluent-ffmpeg'
import axios from 'axios'

import { detectPlatform, extractMediaFromUrl, ExtractedMedia } from '../social/index'
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
import { computeFinalScore, weightedScore, computeVerdict, AnalysisResult, DetectorResult, Lang } from '../types'
import { rateLimitMiddleware } from '../middleware/rateLimit'
import { normalizeBuffer } from '../lib/imageUtils'

export const socialRouter = Router()

const MAX_DOWNLOAD_SIZE = 100 * 1024 * 1024 // 100 MB

// Download a URL to a Buffer
async function downloadBuffer(url: string): Promise<Buffer> {
  // Handle data URIs (from yt-dlp local extraction)
  if (url.startsWith('data:')) {
    const base64 = url.split(',')[1]
    return Buffer.from(base64, 'base64')
  }

  const response = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    maxContentLength: MAX_DOWNLOAD_SIZE,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIDetectBot/1.0)' },
  })
  return Buffer.from(response.data)
}

// Extract N frames from a video file and return as Buffers
async function extractVideoFrames(videoPath: string, count = 10): Promise<Buffer[]> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aidetect-frames-'))
  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .outputOptions(['-vf', `fps=1`, '-frames:v', String(count)])
        .output(path.join(tmpDir, 'frame-%03d.jpg'))
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run()
    })

    const files = fs.readdirSync(tmpDir).sort()
    return files
      .filter((f) => f.endsWith('.jpg'))
      .slice(0, count)
      .map((f) => fs.readFileSync(path.join(tmpDir, f)))
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

// Run all analyzers on a single image buffer
interface FrameAnalysis {
  scores: Record<string, number>
  breakdown: Record<string, DetectorResult>
  visualizations: { elaMap: string; gradientMap: string; fftSpectrum: string; shadowViz: string }
}

async function analyzeImageBuffer(rawBuffer: Buffer, lang: Lang): Promise<FrameAnalysis> {
  // Normalize to JPEG for consistent processing (handles HEIC/HEIF/AVIF from social platforms).
  const buffer = await normalizeBuffer(rawBuffer)

  // Phase 1: EXIF first — must know hasConfirmedCamera before running analyzers
  const exifResult = await exifAnalyzer(rawBuffer, lang)
  const hasConfirmedCamera = exifResult.score < 20

  // Phase 2a: noise — needed to compute hasConfirmedReal
  const noiseResult = await noiseAnalyzer(buffer, lang)
  const hasNaturalNoise = noiseResult.score < 25
  const hasConfirmedReal = hasConfirmedCamera || hasNaturalNoise

  // Phase 2b: all remaining analyzers in parallel
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
    elaAnalyzer(buffer, lang, { hasConfirmedReal }),
    gradientAnalyzer(buffer, lang, { hasConfirmedReal }),
    textureAnalyzer(buffer, lang),
    fftAnalyzer(buffer, lang),
    shadowAnalyzer(buffer, lang, { hasConfirmedReal }),
    symmetryAnalyzer(buffer, lang),
    statsAnalyzer(buffer, lang),
    hiveAnalyzer(buffer, lang),
    sightengineAnalyzer(buffer, lang),
    transformersAnalyzer(buffer, lang),
  ])

  return {
    scores: {
      symmetry:     symmetryResult.score,
      stats:        statsResult.score,
      fft:          fftResult.score,
      texture:      textureResult.score,
      shadow:       shadowResult.score,
      ela:          elaResult.score,
      gradient:     gradientResult.score,
      exif:         exifResult.score,
      noise:        noiseResult.score,
      hive:         hiveResult.score,
      sightengine:  sightengineResult.score,
      transformers: transformersResult.score,
    },
    breakdown: {
      symmetry:    symmetryResult,
      stats:       statsResult,
      fft:         fftResult,
      texture:     textureResult,
      shadow:      shadowResult,
      ela:         elaResult,
      gradient:    gradientResult,
      exif:        exifResult,
      noise:       noiseResult,
      hive:        hiveResult,
      sightengine: sightengineResult,
      transformers: transformersResult,
    },
    visualizations: { elaMap, gradientMap, fftSpectrum, shadowViz },
  }
}

// Average results from multiple frames
function averageFrameAnalyses(frames: FrameAnalysis[]): FrameAnalysis {
  if (frames.length === 0) throw new Error('No frames to average')
  if (frames.length === 1) return frames[0]

  const keys = Object.keys(frames[0].scores)
  const avgScores: Record<string, number> = {}
  for (const k of keys) {
    avgScores[k] = Math.round(frames.reduce((s, f) => s + f.scores[k], 0) / frames.length)
  }

  // Build averaged breakdown (use first frame labels, averaged scores)
  const avgBreakdown: Record<string, DetectorResult> = {}
  for (const k of keys) {
    avgBreakdown[k] = {
      ...frames[0].breakdown[k],
      score: avgScores[k],
      passed: avgScores[k] < 50,
    }
  }

  // Use middle frame visualizations
  const mid = frames[Math.floor(frames.length / 2)]

  return {
    scores: avgScores,
    breakdown: avgBreakdown,
    visualizations: mid.visualizations,
  }
}

socialRouter.post(
  '/extract',
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const { url, lang: rawLang } = req.body as { url?: string; lang?: string }
    const lang: Lang = rawLang === 'en' ? 'en' : 'pt'

    if (!url?.trim()) {
      res.status(400).json({ success: false, error: 'URL é obrigatória / URL is required' })
      return
    }

    const platform = detectPlatform(url.trim())
    if (!platform) {
      res.status(400).json({
        success: false,
        error: 'Plataforma não suportada / Platform not supported',
        code: 'PLATFORM_NOT_SUPPORTED',
      })
      return
    }

    let extracted: ExtractedMedia
    try {
      extracted = await extractMediaFromUrl(url.trim())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao extrair mídia'
      res.status(422).json({ success: false, error: message, code: 'EXTRACTION_FAILED' })
      return
    }

    let mediaBuffer: Buffer
    try {
      mediaBuffer = await downloadBuffer(extracted.mediaUrl)
    } catch {
      res.status(422).json({ success: false, error: 'Falha ao baixar mídia / Failed to download media', code: 'DOWNLOAD_FAILED' })
      return
    }

    try {
      let analysis: FrameAnalysis
      let videoFrames: Buffer[] | null = null

      if (extracted.mediaType === 'video') {
        // Write video to temp file
        const tmpVideo = path.join(os.tmpdir(), `aidetect-video-${Date.now()}.mp4`)
        fs.writeFileSync(tmpVideo, mediaBuffer)
        try {
          videoFrames = await extractVideoFrames(tmpVideo, 10)
          if (videoFrames.length === 0) throw new Error('Nenhum frame extraído')
          const frameAnalyses = await Promise.all(videoFrames.map((f) => analyzeImageBuffer(f, lang)))
          analysis = averageFrameAnalyses(frameAnalyses)
        } finally {
          fs.rmSync(tmpVideo, { force: true })
        }
      } else {
        analysis = await analyzeImageBuffer(mediaBuffer, lang)
      }

      const { scores, breakdown, visualizations } = analysis

      // ─── Temporal analysis (video only) ───────────────────────────────────
      let temporalResult: DetectorResult & { skipped?: boolean }
      if (videoFrames && videoFrames.length >= 2) {
        temporalResult = await temporalAnalyzer(videoFrames, lang)
      } else {
        temporalResult = {
          score: 0,
          label: lang === 'en' ? 'Temporal analysis requires video' : 'Análise temporal requer vídeo',
          passed: true,
          abstained: true,
          skipped: true,
        }
      }

      // ─── Platform label detector ───────────────────────────────────────────
      const hasAiLabel = extracted.hasAiLabel ?? false
      const platformLabelResult: DetectorResult = hasAiLabel
        ? {
            score: 95,
            label: lang === 'en'
              ? `Platform flagged as AI-generated`
              : `Plataforma identificou como gerado por IA`,
            passed: false,
          }
        : {
            score: 0,
            label: lang === 'en' ? 'No platform AI label detected' : 'Nenhum rótulo IA da plataforma',
            passed: true,
            abstained: true,
          }

      // Build full raw scores and breakdown
      const rawScores = {
        symmetry:      scores.symmetry,
        stats:         scores.stats,
        fft:           scores.fft,
        texture:       scores.texture,
        shadow:        scores.shadow,
        ela:           scores.ela,
        gradient:      scores.gradient,
        exif:          scores.exif,
        noise:         scores.noise,
        temporal:      temporalResult.score,
        platformLabel: platformLabelResult.score,
        hive:          scores.hive,
        sightengine:   scores.sightengine,
        transformers:  scores.transformers,
      }

      const rawBreakdown: AnalysisResult['breakdown'] = {
        symmetry:      breakdown.symmetry,
        stats:         breakdown.stats,
        fft:           breakdown.fft,
        texture:       breakdown.texture,
        shadow:        breakdown.shadow,
        ela:           breakdown.ela,
        gradient:      breakdown.gradient,
        exif:          breakdown.exif as DetectorResult,
        noise:         breakdown.noise as DetectorResult,
        temporal:      temporalResult,
        platformLabel: platformLabelResult,
        hive:          breakdown.hive,
        sightengine:   breakdown.sightengine,
        transformers:  breakdown.transformers,
      }

      const { score, effectiveBreakdown } = computeFinalScore(rawScores, rawBreakdown, lang)
      const { verdict, confidence } = computeVerdict(score)

      const result: AnalysisResult = {
        id: uuidv4(),
        verdict,
        score,
        confidence,
        breakdown: effectiveBreakdown,
        visualizations,
        meta: {
          processedAt: new Date().toISOString(),
          mediaType: extracted.mediaType,
          sourceUrl: url.trim(),
          platform,
          thumbnailUrl: extracted.thumbnailUrl,
        },
      }

      res.json({ success: true, data: result })
    } catch (err) {
      console.error('Social analysis error:', err)
      res.status(500).json({ success: false, error: 'Análise falhou / Analysis failed', code: 'ANALYSIS_ERROR' })
    }
  }
)
