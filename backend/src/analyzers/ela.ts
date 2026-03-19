import sharp from 'sharp'
import { DetectorResult } from '../types'

/**
 * Error Level Analysis (ELA)
 * Re-compresses the image at low quality and measures pixel-level differences.
 * Uniform flat regions = AI-generated. High variance in natural images.
 */
export async function elaAnalyzer(buffer: Buffer, lang: string): Promise<{
  result: DetectorResult
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
    const diffData = Buffer.alloc(len)
    let sumDiff = 0
    let maxDiff = 0

    for (let i = 0; i < len; i++) {
      const d = Math.abs(original[i] - recompressed[i])
      diffData[i] = Math.min(255, d * 10) // amplify
      sumDiff += d
      maxDiff = Math.max(maxDiff, d)
    }

    const avgDiff = sumDiff / len

    // AI images tend to have very uniform ELA (low variance)
    // Natural photos have more variance due to real compression artifacts
    const variance = computeVariance(diffData, avgDiff)
    const normalizedVariance = Math.min(variance / 50, 1)

    // Low variance → more likely AI
    const score = Math.round((1 - normalizedVariance) * 100)

    // Generate ELA visualization
    const elaImage = await sharp(diffData, {
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
      result: { score, label, passed: score < 50 },
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

function computeVariance(data: Buffer, mean: number): number {
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    const diff = data[i] - mean
    sum += diff * diff
  }
  return Math.sqrt(sum / data.length)
}
