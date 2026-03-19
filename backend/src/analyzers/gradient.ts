import sharp from 'sharp'
import { DetectorResult } from '../types'

/**
 * Gradient Map Analysis
 * AI images often have unnaturally smooth or repetitive gradient patterns.
 * We compute the Sobel gradient magnitude and analyze its distribution.
 */
export async function gradientAnalyzer(buffer: Buffer, lang: string): Promise<{
  result: DetectorResult
  gradientMap: string
}> {
  try {
    const { data, info } = await sharp(buffer)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const { width, height } = info
    const gradMag = new Uint8Array(width * height)
    let sumMag = 0
    let edgeCount = 0

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x
        const gx =
          -data[idx - width - 1] + data[idx - width + 1]
          - 2 * data[idx - 1] + 2 * data[idx + 1]
          - data[idx + width - 1] + data[idx + width + 1]
        const gy =
          -data[idx - width - 1] - 2 * data[idx - width] - data[idx - width + 1]
          + data[idx + width - 1] + 2 * data[idx + width] + data[idx + width + 1]

        const mag = Math.min(255, Math.sqrt(gx * gx + gy * gy))
        gradMag[idx] = mag
        sumMag += mag
        if (mag > 30) edgeCount++
      }
    }

    const avgMag = sumMag / (width * height)
    const edgeDensity = edgeCount / (width * height)

    // AI images tend to have too-perfect edges (very uniform gradient distribution)
    // or unnaturally low edge density in smooth areas
    const score = computeGradientAIScore(avgMag, edgeDensity)

    // Build gradient visualization (RGB: gradient magnitude)
    const rgbData = Buffer.alloc(width * height * 3)
    for (let i = 0; i < gradMag.length; i++) {
      const v = gradMag[i]
      rgbData[i * 3] = v
      rgbData[i * 3 + 1] = Math.floor(v * 0.5)
      rgbData[i * 3 + 2] = 255 - v
    }

    const gradientImage = await sharp(rgbData, {
      raw: { width, height, channels: 3 },
    }).png().toBuffer()

    const gradientMap = gradientImage.toString('base64')

    const label = lang === 'en'
      ? score >= 70
        ? 'Abnormal gradient distribution indicates AI generation'
        : score >= 40
        ? 'Some unusual gradient patterns detected'
        : 'Natural gradient distribution'
      : score >= 70
      ? 'Distribuição de gradiente anormal indica geração por IA'
      : score >= 40
      ? 'Alguns padrões de gradiente incomuns detectados'
      : 'Distribuição de gradiente natural'

    return {
      result: { score, label, passed: score < 50 },
      gradientMap,
    }
  } catch {
    return {
      result: {
        score: 0,
        label: lang === 'en' ? 'Gradient analysis failed' : 'Análise de gradiente falhou',
        passed: true,
      },
      gradientMap: '',
    }
  }
}

function computeGradientAIScore(avgMag: number, edgeDensity: number): number {
  // Natural images have moderate edge density (5-25%) and moderate gradient magnitude
  // AI images often have very low or very high uniformity
  let score = 50

  // Very low edge density with low magnitude → AI smooth regions
  if (edgeDensity < 0.05 && avgMag < 15) score += 25
  else if (edgeDensity > 0.4 && avgMag > 80) score += 15

  // Very uniform gradient → AI
  if (avgMag < 10) score += 20
  else if (avgMag > 60) score -= 10

  return Math.min(100, Math.max(0, score))
}
