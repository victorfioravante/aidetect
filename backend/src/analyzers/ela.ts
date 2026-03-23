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
  options?: { hasConfirmedCamera?: boolean },
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
    // Cap at 55 when EXIF confirms a real camera to avoid false positives.
    const score = options?.hasConfirmedCamera ? Math.min(rawElaScore, 55) : rawElaScore

    // Apply hot colormap per PIXEL: 0→black, 85→red, 170→yellow, 255→white
    // `amplified` contains per-channel values (R,G,B interleaved), so we average
    // the three channel differences to get a single grayscale ELA intensity per pixel.
    const numPixels = info.width * info.height
    const rgbData = Buffer.alloc(numPixels * 3)
    for (let px = 0; px < numPixels; px++) {
      const v = Math.round(
        (amplified[px * 3] + amplified[px * 3 + 1] + amplified[px * 3 + 2]) / 3
      )
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
