import sharp from 'sharp'
import { DetectorResult } from '../types'

/**
 * Rotation / Asymmetry Analysis
 * AI faces and generated images often have near-perfect bilateral symmetry.
 * We flip the image and compare pixel-level similarity.
 * High symmetry → more likely AI-generated.
 */
export async function rotationAnalyzer(buffer: Buffer, lang: string): Promise<DetectorResult> {
  try {
    const resized = await sharp(buffer)
      .resize({ width: 128, height: 128, fit: 'cover' })
      .greyscale()
      .removeAlpha()
      .raw()
      .toBuffer()

    const flipped = await sharp(buffer)
      .resize({ width: 128, height: 128, fit: 'cover' })
      .greyscale()
      .removeAlpha()
      .flop() // horizontal flip
      .raw()
      .toBuffer()

    const len = Math.min(resized.length, flipped.length)
    let sumDiff = 0

    for (let i = 0; i < len; i++) {
      sumDiff += Math.abs(resized[i] - flipped[i])
    }

    const avgDiff = sumDiff / len
    const similarity = 1 - Math.min(1, avgDiff / 128)

    // High similarity (low diff) → very symmetric → likely AI
    const score = Math.round(similarity * similarity * 100)

    const label = lang === 'en'
      ? score >= 70
        ? 'Near-perfect symmetry suggests AI-generated face/object'
        : score >= 40
        ? 'Above-average symmetry detected'
        : 'Natural asymmetry detected'
      : score >= 70
      ? 'Simetria quase perfeita sugere rosto/objeto gerado por IA'
      : score >= 40
      ? 'Simetria acima da média detectada'
      : 'Assimetria natural detectada'

    return { score, label, passed: score < 50 }
  } catch {
    return {
      score: 0,
      label: lang === 'en' ? 'Symmetry analysis failed' : 'Análise de simetria falhou',
      passed: true,
    }
  }
}
