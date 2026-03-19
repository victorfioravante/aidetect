import sharp from 'sharp'
import { DetectorResult } from '../types'

/**
 * Symmetry Analysis (formerly rotation.ts)
 * AI faces and generated images often have near-perfect bilateral symmetry.
 * Tests horizontal flip, vertical flip, and 90° rotation.
 * High symmetry on any axis → more likely AI-generated.
 */
export async function symmetryAnalyzer(buffer: Buffer, lang: string): Promise<DetectorResult> {
  try {
    const base = await sharp(buffer)
      .resize({ width: 128, height: 128, fit: 'cover' })
      .greyscale()
      .removeAlpha()
      .raw()
      .toBuffer()

    // Horizontal flip
    const hFlipped = await sharp(buffer)
      .resize({ width: 128, height: 128, fit: 'cover' })
      .greyscale()
      .removeAlpha()
      .flop()
      .raw()
      .toBuffer()

    // Vertical flip
    const vFlipped = await sharp(buffer)
      .resize({ width: 128, height: 128, fit: 'cover' })
      .greyscale()
      .removeAlpha()
      .flip()
      .raw()
      .toBuffer()

    // 90° rotation
    const rotated90 = await sharp(buffer)
      .resize({ width: 128, height: 128, fit: 'cover' })
      .greyscale()
      .removeAlpha()
      .rotate(90)
      .resize({ width: 128, height: 128, fit: 'fill' }) // re-crop after rotate
      .raw()
      .toBuffer()

    const simH = similarity(base, hFlipped)
    const simV = similarity(base, vFlipped)
    const simR = similarity(base, rotated90)

    // Use the maximum similarity across all axes
    const maxSim = Math.max(simH, simV, simR)

    // High similarity → very symmetric → likely AI
    const score = Math.round(maxSim * maxSim * 100)

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

function similarity(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length)
  let sumDiff = 0
  for (let i = 0; i < len; i++) {
    sumDiff += Math.abs(a[i] - b[i])
  }
  const avgDiff = sumDiff / len
  return 1 - Math.min(1, avgDiff / 128)
}
