import sharp from 'sharp'
import { DetectorResult } from '../types'

/**
 * Symmetry Analysis (formerly rotation.ts)
 * AI faces and generated images often have near-perfect bilateral symmetry.
 *
 * Only horizontal flip (bilateral symmetry) is used as the primary signal.
 * This is the defining pattern of AI-generated faces: they tend to be
 * mirror-symmetric around a vertical axis. V-flip and 90° rotation were
 * removed because they produce high false-positive rates on naturally
 * symmetric subjects (e.g., centered portraits, objects, architecture).
 *
 * Scoring (linear, calibrated):
 *   hFlipSim < 0.70 → score 0   (natural asymmetry)
 *   hFlipSim = 0.85 → score 50  (suspicious)
 *   hFlipSim ≥ 1.00 → score 100 (near-perfect = strong AI signal)
 *
 * V-flip bonus: if V-flip similarity > 0.80, adds +10 (unusual in real photos)
 */
export async function symmetryAnalyzer(buffer: Buffer, lang: string): Promise<DetectorResult> {
  try {
    const base = await sharp(buffer)
      .resize({ width: 128, height: 128, fit: 'cover' })
      .greyscale()
      .removeAlpha()
      .raw()
      .toBuffer()

    // Horizontal flip — primary signal (bilateral symmetry)
    const hFlipped = await sharp(buffer)
      .resize({ width: 128, height: 128, fit: 'cover' })
      .greyscale()
      .removeAlpha()
      .flop()
      .raw()
      .toBuffer()

    // Vertical flip — secondary, used only as bonus signal
    const vFlipped = await sharp(buffer)
      .resize({ width: 128, height: 128, fit: 'cover' })
      .greyscale()
      .removeAlpha()
      .flip()
      .raw()
      .toBuffer()

    const simH = similarity(base, hFlipped)
    const simV = similarity(base, vFlipped)

    // Linear threshold: below 0.70 is normal for real faces/photos.
    // AI-generated images typically score 0.85-0.99 on this metric.
    const baseScore = Math.max(0, (simH - 0.70) / 0.30) * 100

    // V-flip bonus: naturally symmetric subjects almost never have high
    // vertical symmetry. If both axes are highly symmetric, it's unusual.
    const vBonus = simV > 0.80 ? 10 : 0

    const score = Math.min(100, Math.round(baseScore + vBonus))

    const label = lang === 'en'
      ? score >= 70
        ? `Near-perfect bilateral symmetry (${Math.round(simH * 100)}%) — AI signal`
        : score >= 40
        ? `Above-average bilateral symmetry (${Math.round(simH * 100)}%)`
        : `Natural asymmetry (${Math.round(simH * 100)}%)`
      : score >= 70
      ? `Simetria bilateral quase perfeita (${Math.round(simH * 100)}%) — sinal IA`
      : score >= 40
      ? `Simetria bilateral acima da média (${Math.round(simH * 100)}%)`
      : `Assimetria natural (${Math.round(simH * 100)}%)`

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
