import sharp from 'sharp'
import { DetectorResult } from '../types'

// Known AI generation software names
const AI_SOFTWARE_PATTERNS = /stable.?diffusion|midjourney|dall.?e|firefly|imagen|sora|runway|comfyui|automatic1111|novelai|dreamstudio|canva.?ai|adobe.?gen/i

// Standard AI generation dimensions (multiples of 64 common in diffusion models)
const AI_DIMENSIONS = new Set([512, 576, 640, 704, 768, 832, 896, 960, 1024, 1152, 1280, 1344, 1408, 1536, 2048])

function isAiDimension(w: number, h: number): boolean {
  return AI_DIMENSIONS.has(w) || AI_DIMENSIONS.has(h)
}

/**
 * EXIF metadata analyzer
 * Checks for absence of camera metadata and presence of AI generation signals.
 */
export async function exifAnalyzer(buffer: Buffer, lang: string): Promise<DetectorResult> {
  try {
    const metadata = await sharp(buffer).metadata()

    let score = 0
    const signals: string[] = []

    const exif = metadata.exif

    if (!exif || exif.length === 0) {
      // No EXIF at all — strong AI signal
      score += 60
      signals.push(lang === 'en' ? 'No EXIF metadata' : 'Sem metadados EXIF')
    } else {
      // Try to parse EXIF with exif-reader
      let parsed: Record<string, unknown> | null = null
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const exifReader = require('exif-reader')
        parsed = exifReader(exif)
      } catch {
        // exif-reader couldn't parse — treat as empty
        score += 40
        signals.push(lang === 'en' ? 'Unreadable EXIF' : 'EXIF ilegível')
      }

      if (parsed) {
        // Check for camera model / make
        const image = (parsed as Record<string, Record<string, unknown>>).Image ?? {}
        const exifIfd = (parsed as Record<string, Record<string, unknown>>).Exif ?? {}
        const make: string = String(image.Make ?? image.make ?? '')
        const model: string = String(image.Model ?? image.model ?? '')
        const software: string = String(image.Software ?? image.software ?? exifIfd.Software ?? '')

        if (!make && !model) {
          score += 25
          signals.push(lang === 'en' ? 'No camera make/model' : 'Sem câmera registrada')
        } else {
          // Real camera data — reduce suspicion
          score = Math.max(0, score - 20)
          signals.push(lang === 'en' ? `Camera: ${make} ${model}`.trim() : `Câmera: ${make} ${model}`.trim())
        }

        if (software && AI_SOFTWARE_PATTERNS.test(software)) {
          score += 80
          signals.push(lang === 'en' ? `AI software: ${software}` : `Software IA: ${software}`)
        } else if (software) {
          signals.push(lang === 'en' ? `Software: ${software}` : `Software: ${software}`)
        }

        // GPS data present → real-world photo
        const gps = (parsed as Record<string, unknown>).GPS
        if (gps && Object.keys(gps as object).length > 0) {
          score = Math.max(0, score - 15)
          signals.push(lang === 'en' ? 'GPS data present' : 'GPS presente')
        }
      }
    }

    // Check dimensions — AI models tend to produce power-of-2 aligned images
    const { width, height } = metadata
    if (width && height && isAiDimension(width, height)) {
      // Only add if score is already suspicious (don't false-positive real cameras)
      if (score > 10) {
        score += 20
        signals.push(lang === 'en' ? `AI dimensions (${width}×${height})` : `Dimensões IA (${width}×${height})`)
      }
    }

    score = Math.min(100, score)

    const label = lang === 'en'
      ? score >= 70
        ? `AI signals: ${signals.slice(0, 2).join(', ')}`
        : score >= 40
        ? `Suspicious metadata: ${signals.slice(0, 2).join(', ')}`
        : signals.length > 0
        ? `Metadata OK (${signals[0]})`
        : 'Metadata appears authentic'
      : score >= 70
      ? `Sinais IA: ${signals.slice(0, 2).join(', ')}`
      : score >= 40
      ? `Metadados suspeitos: ${signals.slice(0, 2).join(', ')}`
      : signals.length > 0
      ? `Metadados OK (${signals[0]})`
      : 'Metadados parecem autênticos'

    return { score, label, passed: score < 50 }
  } catch {
    return {
      score: 0,
      label: lang === 'en' ? 'EXIF analysis unavailable' : 'Análise EXIF indisponível',
      passed: true,
      abstained: true,
    }
  }
}
