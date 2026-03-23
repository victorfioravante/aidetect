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
export async function exifAnalyzer(
  buffer: Buffer,
  lang: string,
  options?: { isHeicSource?: boolean },
): Promise<DetectorResult> {
  try {
    const metadata = await sharp(buffer).metadata()

    let score = 0
    const signals: string[] = []

    // HEIC/HEIF uploads come exclusively from real device cameras (iPhone, iPad, some DSLRs).
    // AI image generators never produce HEIC output. We track this from the original upload
    // MIME type / extension (passed via options) because by this point the buffer is already
    // a normalized JPEG (format detection on the buffer itself would give 'jpeg', not 'heif').
    const isHeicSource = options?.isHeicSource ?? false
    if (isHeicSource) {
      signals.push(lang === 'en' ? 'HEIC source (device camera)' : 'Origem HEIC (câmera do dispositivo)')
    }

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
        // Check for camera model / make.
        // Strip null bytes (\0) from C-string values that some parsers leave in.
        // Also check the Photo/Exif sub-IFD where some cameras store Make/Model.
        const image = (parsed as Record<string, Record<string, unknown>>).Image ?? {}
        const exifIfd = (parsed as Record<string, Record<string, unknown>>).Exif ?? {}
        const photo = (parsed as Record<string, Record<string, unknown>>).Photo ?? {}
        const stripNull = (v: unknown) => String(v ?? '').replace(/\0/g, '').trim()
        const make: string = stripNull(image.Make ?? image.make ?? exifIfd.Make ?? photo.Make ?? '')
        const model: string = stripNull(image.Model ?? image.model ?? exifIfd.Model ?? photo.Model ?? '')
        const software: string = stripNull(image.Software ?? image.software ?? exifIfd.Software ?? photo.Software ?? '')

        if (!make && !model) {
          if (isHeicSource) {
            // HEIC→JPEG conversion via sharp often fails to transfer Make/Model from
            // the HEIC container to the JPEG EXIF IFD. Absence of Make/Model here is
            // a format-conversion artifact, not a sign of AI generation.
            signals.push(lang === 'en' ? 'Camera data in HEIC container' : 'Dados de câmera no contêiner HEIC')
          } else {
            score += 25
            signals.push(lang === 'en' ? 'No camera make/model' : 'Sem câmera registrada')
          }
        } else {
          // Real camera data — reduce suspicion
          score = Math.max(0, score - 20)
          signals.push(lang === 'en' ? `Camera: ${make} ${model}`.trim() : `Câmera: ${make} ${model}`.trim())
        }

        if (software && AI_SOFTWARE_PATTERNS.test(software)) {
          score += 80
          signals.push(lang === 'en' ? `AI software: ${software}` : `Software IA: ${software}`)
        } else if (software && software.toLowerCase() !== 'sharp') {
          // Skip logging "sharp" (our own processing library) as a noteworthy software signal
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
