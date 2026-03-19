import sharp from 'sharp'
import { DetectorResult } from '../types'

/**
 * Texture Analysis
 * AI-generated skin/surfaces often lack natural micro-texture noise.
 * We measure local standard deviation in small blocks as a texture metric.
 */
export async function textureAnalyzer(buffer: Buffer, lang: string): Promise<DetectorResult> {
  try {
    const { data, info } = await sharp(buffer)
      .greyscale()
      .resize({ width: 256, height: 256, fit: 'cover' })
      .raw()
      .toBuffer({ resolveWithObject: true })

    const { width, height } = info
    const blockSize = 8
    const localStdDevs: number[] = []

    for (let by = 0; by < height - blockSize; by += blockSize) {
      for (let bx = 0; bx < width - blockSize; bx += blockSize) {
        const block: number[] = []
        for (let y = by; y < by + blockSize; y++) {
          for (let x = bx; x < bx + blockSize; x++) {
            block.push(data[y * width + x])
          }
        }
        const mean = block.reduce((a, b) => a + b, 0) / block.length
        const variance = block.reduce((sum, v) => sum + (v - mean) ** 2, 0) / block.length
        localStdDevs.push(Math.sqrt(variance))
      }
    }

    const avgStd = localStdDevs.reduce((a, b) => a + b, 0) / localStdDevs.length
    const stdOfStd = Math.sqrt(
      localStdDevs.reduce((sum, v) => sum + (v - avgStd) ** 2, 0) / localStdDevs.length
    )

    // Natural images: higher avgStd (texture richness) and higher stdOfStd (heterogeneity)
    // AI images: lower avgStd (smooth areas) and lower stdOfStd (uniform texture)
    const score = computeTextureAIScore(avgStd, stdOfStd)

    const label = lang === 'en'
      ? score >= 70
        ? 'Unnaturally smooth texture typical of AI generation'
        : score >= 40
        ? 'Some texture anomalies detected'
        : 'Natural texture patterns detected'
      : score >= 70
      ? 'Textura artificialmente suave, típica de geração por IA'
      : score >= 40
      ? 'Algumas anomalias de textura detectadas'
      : 'Padrões de textura naturais detectados'

    return { score, label, passed: score < 50 }
  } catch {
    return {
      score: 0,
      label: lang === 'en' ? 'Texture analysis failed' : 'Análise de textura falhou',
      passed: true,
    }
  }
}

function computeTextureAIScore(avgStd: number, stdOfStd: number): number {
  let score = 50

  // Very smooth (low avgStd) → AI
  if (avgStd < 5) score += 35
  else if (avgStd < 10) score += 20
  else if (avgStd < 20) score += 5
  else score -= 15

  // Very uniform texture distribution (low stdOfStd) → AI
  if (stdOfStd < 3) score += 15
  else if (stdOfStd < 6) score += 5
  else score -= 10

  return Math.min(100, Math.max(0, score))
}
