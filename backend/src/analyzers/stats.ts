import sharp from 'sharp'
import { DetectorResult } from '../types'

/**
 * Pixel Statistics Analysis
 * AI images often have characteristic statistical fingerprints:
 * - Channel correlation anomalies
 * - Entropy differences
 * - Histogram shape
 */
export async function statsAnalyzer(buffer: Buffer, lang: string): Promise<DetectorResult> {
  try {
    const { data } = await sharp(buffer)
      .removeAlpha()
      .resize({ width: 256, height: 256, fit: 'cover' })
      .raw()
      .toBuffer({ resolveWithObject: true })

    const len = data.length
    const channelSize = Math.floor(len / 3)

    const r: number[] = [], g: number[] = [], b: number[] = []
    for (let i = 0; i < channelSize; i++) {
      r.push(data[i * 3])
      g.push(data[i * 3 + 1])
      b.push(data[i * 3 + 2])
    }

    const [rMean, gMean, bMean] = [mean(r), mean(g), mean(b)]
    const [rStd, gStd, bStd] = [std(r, rMean), std(g, gMean), std(b, bMean)]

    // Channel imbalance — AI images often have unusual channel distributions
    const channelStdRatio = Math.max(rStd, gStd, bStd) / (Math.min(rStd, gStd, bStd) + 1)

    // Entropy of grayscale
    const entropy = computeEntropy(data)

    const score = computeStatsScore(channelStdRatio, entropy, rStd, gStd, bStd)

    const label = lang === 'en'
      ? score >= 70
        ? 'Abnormal pixel statistics suggest AI generation'
        : score >= 40
        ? 'Some statistical anomalies in pixel distribution'
        : 'Normal pixel statistics'
      : score >= 70
      ? 'Estatísticas de pixel anormais sugerem geração por IA'
      : score >= 40
      ? 'Algumas anomalias estatísticas na distribuição de pixels'
      : 'Estatísticas de pixel normais'

    return { score, label, passed: score < 50 }
  } catch {
    return {
      score: 0,
      label: lang === 'en' ? 'Pixel stats analysis failed' : 'Análise de estatísticas falhou',
      passed: true,
    }
  }
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function std(arr: number[], m: number): number {
  return Math.sqrt(arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length)
}

function computeEntropy(data: Uint8Array | Buffer): number {
  const hist = new Array(256).fill(0)
  for (let i = 0; i < data.length; i++) hist[data[i]]++
  const total = data.length
  let entropy = 0
  for (const count of hist) {
    if (count > 0) {
      const p = count / total
      entropy -= p * Math.log2(p)
    }
  }
  return entropy
}

function computeStatsScore(
  channelRatio: number,
  entropy: number,
  rStd: number,
  gStd: number,
  bStd: number,
): number {
  let score = 40

  // Very high channel imbalance → AI artifact
  if (channelRatio > 3) score += 25
  else if (channelRatio > 2) score += 10

  // Very low entropy → AI oversmoothing
  if (entropy < 5) score += 25
  else if (entropy < 6) score += 10

  // All channels have very similar std → artificial
  const stdVariance = Math.max(rStd, gStd, bStd) - Math.min(rStd, gStd, bStd)
  if (stdVariance < 2) score += 15

  return Math.min(100, Math.max(0, score))
}
