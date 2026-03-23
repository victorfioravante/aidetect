import sharp from 'sharp'
import { DetectorResult } from '../types'

/**
 * Error Level Analysis (ELA)
 * Re-compresses the image at low quality and measures pixel-level differences.
 * Uniform flat regions = AI-generated. High variance in natural images.
 */
export async function elaAnalyzer(
  buffer: Buffer,
  lang: string,
  options?: { hasConfirmedReal?: boolean },
): Promise<{
  result: DetectorResult & { hotspots?: number }
  elaMap: string
}> {
  try {
    const { data: original, info } = await sharp(buffer)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    // Re-compress at quality 75 to simulate ELA
    const recompressed = await sharp(buffer)
      .jpeg({ quality: 75 })
      .removeAlpha()
      .raw()
      .toBuffer()

    const len = Math.min(original.length, recompressed.length)
    const amplified = new Uint8Array(len)
    let sumDiff = 0
    let maxDiff = 0
    let hotspotCount = 0

    for (let i = 0; i < len; i++) {
      const d = Math.abs(original[i] - recompressed[i])
      const amp = Math.min(255, d * 10)
      amplified[i] = amp
      sumDiff += d
      maxDiff = Math.max(maxDiff, d)
      if (amp > 128) hotspotCount++
    }

    const avgDiff = sumDiff / len
    const hotspots = hotspotCount / len // fraction 0-1

    // AI images tend to have very uniform ELA (low variance)
    const variance = computeVariance(amplified, avgDiff)
    const normalizedVariance = Math.min(variance / 50, 1)

    // Low variance → more likely AI; hotspots > 15% boosts score
    let rawElaScore = Math.round((1 - normalizedVariance) * 80)
    if (hotspots > 0.15) rawElaScore = Math.min(100, rawElaScore + 20)

    // HEIC→JPEG conversion (and any re-encoding) introduces artificial ELA noise.
    // Cap at 55 when any signal confirms a real photo to avoid false positives.
    let score = options?.hasConfirmedReal ? Math.min(rawElaScore, 55) : rawElaScore

    // Build visualization and count dark pixels in the same pass.
    // Dark ELA (nearly black map, >80% pixels with magnitude < 20) means
    // compression was highly uniform — strong signal of a real, unedited photo.
    const numPixels = info.width * info.height
    const rgbData = Buffer.alloc(numPixels * 3)
    let darkPixelCount = 0

    for (let px = 0; px < numPixels; px++) {
      const v = Math.round(
        (amplified[px * 3] + amplified[px * 3 + 1] + amplified[px * 3 + 2]) / 3
      )
      if (v < 20) darkPixelCount++

      let r = 0, g = 0, b = 0
      if (v <= 85) {
        r = Math.round(v * 3)
      } else if (v <= 170) {
        r = 255
        g = Math.round((v - 85) * 3)
      } else {
        r = 255
        g = 255
        b = Math.round((v - 170) * 3)
      }
      rgbData[px * 3] = r
      rgbData[px * 3 + 1] = g
      rgbData[px * 3 + 2] = b
    }

    // A nearly-black ELA map (>80% dark pixels) = uniform compression = real photo.
    // Cap score at 30 regardless of hasConfirmedReal — this is a direct pixel signal.
    const darkPixelRatio = numPixels > 0 ? darkPixelCount / numPixels : 0
    if (darkPixelRatio > 0.80) {
      score = Math.min(score, 30)
    }

    const elaImage = await sharp(rgbData, {
      raw: { width: info.width, height: info.height, channels: 3 },
    })
      .png()
      .toBuffer()

    const elaMap = elaImage.toString('base64')

    const label = lang === 'en'
      ? score >= 70
        ? 'Uniform ELA pattern suggests AI manipulation'
        : score >= 40
        ? 'Moderate ELA anomalies detected'
        : 'Natural ELA variance, likely authentic'
      : score >= 70
      ? 'Padrão ELA uniforme sugere manipulação por IA'
      : score >= 40
      ? 'Anomalias moderadas no ELA detectadas'
      : 'Variância ELA natural, provavelmente autêntico'

    return {
      result: { score, label, passed: score < 50, hotspots: Math.round(hotspots * 100) },
      elaMap,
    }
  } catch {
    return {
      result: {
        score: 0,
        label: lang === 'en' ? 'ELA analysis failed' : 'Análise ELA falhou',
        passed: true,
      },
      elaMap: '',
    }
  }
}

function computeVariance(data: Uint8Array, mean: number): number {
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    const diff = data[i] - mean
    sum += diff * diff
  }
  return Math.sqrt(sum / data.length)
}
