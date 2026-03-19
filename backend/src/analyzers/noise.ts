import sharp from 'sharp'
import { DetectorResult } from '../types'

const BLOCK_SIZE = 16

/**
 * Noise pattern analyzer
 *
 * Strategy: compare original image vs a Gaussian-blurred version.
 * The difference (high-frequency residual) captures the noise floor.
 * Analyze residual in BLOCK_SIZE×BLOCK_SIZE blocks:
 *   - stddev per block (local noise amplitude)
 *   - variance of stddevs across all blocks
 *
 * AI-generated images → very uniform noise (low variance of stddevs)
 * Real photos        → heterogeneous noise (high variance of stddevs)
 */
export async function noiseAnalyzer(buffer: Buffer, lang: string): Promise<DetectorResult> {
  try {
    // Work at a manageable size
    const TARGET = 256
    const imgBuf = await sharp(buffer)
      .resize(TARGET, TARGET, { fit: 'cover' })
      .greyscale()
      .raw()
      .toBuffer()

    // "Blur" the image with a simple 5×5 box average via sharp
    const blurBuf = await sharp(buffer)
      .resize(TARGET, TARGET, { fit: 'cover' })
      .greyscale()
      .blur(2)
      .raw()
      .toBuffer()

    // Compute residual (absolute difference, clamped)
    const residual = new Uint8Array(TARGET * TARGET)
    for (let i = 0; i < residual.length; i++) {
      residual[i] = Math.abs(imgBuf[i] - blurBuf[i])
    }

    // Compute per-block stddev
    const cols = Math.floor(TARGET / BLOCK_SIZE)
    const rows = Math.floor(TARGET / BLOCK_SIZE)
    const blockStddevs: number[] = []

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const pixels: number[] = []
        for (let dr = 0; dr < BLOCK_SIZE; dr++) {
          for (let dc = 0; dc < BLOCK_SIZE; dc++) {
            const idx = (r * BLOCK_SIZE + dr) * TARGET + (c * BLOCK_SIZE + dc)
            pixels.push(residual[idx])
          }
        }
        const mean = pixels.reduce((s, v) => s + v, 0) / pixels.length
        const variance = pixels.reduce((s, v) => s + (v - mean) ** 2, 0) / pixels.length
        blockStddevs.push(Math.sqrt(variance))
      }
    }

    // Overall mean & variance of block stddevs
    const meanStd = blockStddevs.reduce((s, v) => s + v, 0) / blockStddevs.length
    const varStd = blockStddevs.reduce((s, v) => s + (v - meanStd) ** 2, 0) / blockStddevs.length
    const cvStd = meanStd > 0 ? Math.sqrt(varStd) / meanStd : 0 // coefficient of variation

    // Low CV → uniformly structured noise → AI-generated
    // High CV → heterogeneous noise → real photo
    // Empirically: AI images often have cvStd < 0.3, real photos > 0.5
    let score: number
    if (cvStd < 0.15) {
      score = 90
    } else if (cvStd < 0.25) {
      score = 75
    } else if (cvStd < 0.40) {
      score = 55
    } else if (cvStd < 0.60) {
      score = 35
    } else {
      score = 15
    }

    // Also check absolute noise level — very low mean residual (AI over-smooth) boosts score
    if (meanStd < 2.0 && score < 70) {
      score = Math.min(100, score + 15)
    }

    const cvPct = Math.round(cvStd * 100)
    const label = lang === 'en'
      ? score >= 70
        ? `Uniform noise pattern (CV=${cvPct}%) — AI signal`
        : score >= 40
        ? `Moderately uniform noise (CV=${cvPct}%)`
        : `Natural noise variation (CV=${cvPct}%)`
      : score >= 70
      ? `Padrão de ruído uniforme (CV=${cvPct}%) — sinal IA`
      : score >= 40
      ? `Ruído moderadamente uniforme (CV=${cvPct}%)`
      : `Variação de ruído natural (CV=${cvPct}%)`

    return { score, label, passed: score < 50 }
  } catch {
    return {
      score: 0,
      label: lang === 'en' ? 'Noise analysis unavailable' : 'Análise de ruído indisponível',
      passed: true,
      abstained: true,
    }
  }
}
