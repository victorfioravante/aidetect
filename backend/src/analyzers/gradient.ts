import sharp from 'sharp'
import { DetectorResult } from '../types'

/**
 * Gradient Map Analysis
 * AI images often have unnaturally smooth or repetitive gradient patterns.
 * We compute the Sobel gradient magnitude and analyze its distribution.
 */
export async function gradientAnalyzer(
  buffer: Buffer,
  lang: string,
  options?: { hasConfirmedReal?: boolean },
): Promise<{
  result: DetectorResult & { edgeDensity?: number }
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
        if (mag > 100) edgeCount++
      }
    }

    const avgMag = sumMag / (width * height)
    const edgeDensity = edgeCount / (width * height)

    // Compute edgeDensity variance across 4x4 blocks (uniformity signal for AI)
    const blockW = Math.floor(width / 4)
    const blockH = Math.floor(height / 4)
    const blockDensities: number[] = []
    for (let by = 0; by < 4; by++) {
      for (let bx = 0; bx < 4; bx++) {
        let blockEdge = 0
        let blockTotal = 0
        for (let y = by * blockH; y < (by + 1) * blockH; y++) {
          for (let x = bx * blockW; x < (bx + 1) * blockW; x++) {
            if (gradMag[y * width + x] > 100) blockEdge++
            blockTotal++
          }
        }
        blockDensities.push(blockTotal > 0 ? blockEdge / blockTotal : 0)
      }
    }
    const blockMean = blockDensities.reduce((s, v) => s + v, 0) / blockDensities.length
    const blockVariance = blockDensities.reduce((s, v) => s + (v - blockMean) ** 2, 0) / blockDensities.length

    // Low variance in block densities → AI (too uniform edges)
    const rawScore = computeGradientAIScore(avgMag, edgeDensity, blockVariance)
    // Photos of geometric scenes (walls, doors, furniture) have naturally uniform
    // edges — this is NOT an AI signal. Cap at 50 when EXIF confirms a real camera.
    const score = options?.hasConfirmedReal ? Math.min(rawScore, 50) : rawScore

    // Apply colormap: dark-blue → cyan → yellow → white
    const rgbData = Buffer.alloc(width * height * 3)
    for (let i = 0; i < gradMag.length; i++) {
      const v = gradMag[i]
      let r = 0, g = 0, b = 0
      if (v <= 64) {
        // dark blue RGB(0,0,128) → RGB(0,0,128)
        b = Math.round(128 + (v / 64) * 0) // stays 128... actually interpolate 128→128, keep flat
        b = 128
        r = 0; g = 0
      } else if (v <= 128) {
        // dark blue → cyan: RGB(0,0,128) → RGB(0,200,255)
        const t = (v - 64) / 64
        r = 0
        g = Math.round(t * 200)
        b = Math.round(128 + t * 127)
      } else if (v <= 192) {
        // cyan → yellow: RGB(0,200,255) → RGB(255,220,0)
        const t = (v - 128) / 64
        r = Math.round(t * 255)
        g = Math.round(200 + t * 20)
        b = Math.round(255 - t * 255)
      } else {
        // yellow → white: RGB(255,220,0) → RGB(255,255,255)
        const t = (v - 192) / 63
        r = 255
        g = Math.round(220 + t * 35)
        b = Math.round(t * 255)
      }
      rgbData[i * 3] = r
      rgbData[i * 3 + 1] = g
      rgbData[i * 3 + 2] = b
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
      result: { score, label, passed: score < 50, edgeDensity: Math.round(edgeDensity * 100) },
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

function computeGradientAIScore(avgMag: number, edgeDensity: number, blockVariance: number): number {
  let score = 40

  // Very uniform edge density across blocks → AI
  if (blockVariance < 0.001) score += 30
  else if (blockVariance < 0.005) score += 15

  // Very low edge density with low magnitude → AI smooth regions
  if (edgeDensity < 0.05 && avgMag < 15) score += 20
  else if (edgeDensity > 0.4 && avgMag > 80) score += 10

  if (avgMag < 10) score += 15
  else if (avgMag > 60) score -= 10

  return Math.min(100, Math.max(0, score))
}
