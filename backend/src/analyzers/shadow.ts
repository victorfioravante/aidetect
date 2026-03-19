import sharp from 'sharp'
import { DetectorResult } from '../types'

/**
 * Shadow Consistency Analysis
 * AI images often have inconsistent light direction across regions.
 * We estimate gradient direction in multiple quadrants and compare consistency.
 */
export async function shadowAnalyzer(buffer: Buffer, lang: string): Promise<DetectorResult> {
  try {
    const { data, info } = await sharp(buffer)
      .greyscale()
      .resize({ width: 128, height: 128, fit: 'cover' })
      .raw()
      .toBuffer({ resolveWithObject: true })

    const { width, height } = info
    const halfW = Math.floor(width / 2)
    const halfH = Math.floor(height / 2)

    // Compute dominant gradient direction per quadrant
    const quadrantAngles: number[] = []

    for (let qy = 0; qy < 2; qy++) {
      for (let qx = 0; qx < 2; qx++) {
        const startX = qx * halfW
        const startY = qy * halfH
        let sumGx = 0
        let sumGy = 0

        for (let y = startY + 1; y < startY + halfH - 1; y++) {
          for (let x = startX + 1; x < startX + halfW - 1; x++) {
            const idx = y * width + x
            const gx = data[idx + 1] - data[idx - 1]
            const gy = data[idx + width] - data[idx - width]
            sumGx += gx
            sumGy += gy
          }
        }

        const angle = Math.atan2(sumGy, sumGx)
        quadrantAngles.push(angle)
      }
    }

    // Measure angular variance across quadrants
    const angularVariance = computeCircularVariance(quadrantAngles)

    // High variance → inconsistent lighting → likely AI
    // Natural photos: consistent directional lighting
    const score = Math.min(100, Math.round(angularVariance * 100 * 1.5))

    const label = lang === 'en'
      ? score >= 70
        ? 'Inconsistent lighting direction indicates AI generation'
        : score >= 40
        ? 'Some lighting inconsistencies detected'
        : 'Consistent lighting direction'
      : score >= 70
      ? 'Direção de iluminação inconsistente indica geração por IA'
      : score >= 40
      ? 'Algumas inconsistências de iluminação detectadas'
      : 'Direção de iluminação consistente'

    return { score, label, passed: score < 50 }
  } catch {
    return {
      score: 0,
      label: lang === 'en' ? 'Shadow analysis failed' : 'Análise de sombras falhou',
      passed: true,
    }
  }
}

function computeCircularVariance(angles: number[]): number {
  const sinMean = angles.reduce((s, a) => s + Math.sin(a), 0) / angles.length
  const cosMean = angles.reduce((s, a) => s + Math.cos(a), 0) / angles.length
  const R = Math.sqrt(sinMean ** 2 + cosMean ** 2)
  return 1 - R // 0 = uniform direction, 1 = completely random
}
