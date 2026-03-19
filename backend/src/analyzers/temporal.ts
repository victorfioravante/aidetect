import sharp from 'sharp'
import { DetectorResult } from '../types'

/**
 * Temporal consistency analyzer (video only)
 *
 * Receives an array of frame buffers (extracted by social.ts / analyze.ts).
 * Compares consecutive frame pairs: mean absolute pixel difference.
 * AI-generated video frames often show unnatural flicker or "snap" changes
 * inconsistent with smooth real-world motion.
 *
 * For images (single frame): returns abstained=true, skipped=true.
 */
export async function temporalAnalyzer(
  frames: Buffer[],
  lang: string
): Promise<DetectorResult & { skipped?: boolean }> {
  if (frames.length < 2) {
    return {
      score: 0,
      label: lang === 'en' ? 'Temporal analysis requires video' : 'Análise temporal requer vídeo',
      passed: true,
      abstained: true,
      skipped: true,
    }
  }

  try {
    const TARGET = 128

    // Convert each frame to greyscale raw pixels
    const grayFrames: Uint8Array[] = await Promise.all(
      frames.map(async (f) => {
        const buf = await sharp(f)
          .resize(TARGET, TARGET, { fit: 'cover' })
          .greyscale()
          .raw()
          .toBuffer()
        return new Uint8Array(buf)
      })
    )

    // Compute mean absolute difference between consecutive frames
    const frameDiffs: number[] = []
    for (let i = 1; i < grayFrames.length; i++) {
      const a = grayFrames[i - 1]
      const b = grayFrames[i]
      let sum = 0
      for (let j = 0; j < a.length; j++) {
        sum += Math.abs(a[j] - b[j])
      }
      frameDiffs.push(sum / a.length)
    }

    const meanDiff = frameDiffs.reduce((s, v) => s + v, 0) / frameDiffs.length

    // Variance of diffs → "flicker score"
    const varDiff = frameDiffs.reduce((s, v) => s + (v - meanDiff) ** 2, 0) / frameDiffs.length
    const flickerScore = Math.sqrt(varDiff)

    // Artifact score: frames with near-zero diff followed by a large jump
    let abruptChanges = 0
    for (let i = 1; i < frameDiffs.length; i++) {
      const ratio = frameDiffs[i] > 0 ? frameDiffs[i - 1] / frameDiffs[i] : 1
      if (ratio > 5 || ratio < 0.2) abruptChanges++
    }
    const artifactScore = (abruptChanges / (frameDiffs.length - 1)) * 100

    // Very low mean diff across all frames → static/slideshow AI content
    let score = 0
    if (meanDiff < 1.0) {
      score = 80 // nearly static — suspicious for AI slideshow
    } else if (flickerScore > 15) {
      score = 70 // high flicker variance
    } else if (artifactScore > 30) {
      score = 65 // many abrupt transitions
    } else if (flickerScore > 8) {
      score = 45
    } else {
      score = 20 // smooth motion — consistent with real video
    }

    const label = lang === 'en'
      ? score >= 70
        ? `Abnormal frame transitions (flicker=${flickerScore.toFixed(1)})`
        : score >= 40
        ? `Moderately inconsistent motion (flicker=${flickerScore.toFixed(1)})`
        : `Smooth temporal consistency (flicker=${flickerScore.toFixed(1)})`
      : score >= 70
      ? `Transições anormais entre frames (flicker=${flickerScore.toFixed(1)})`
      : score >= 40
      ? `Movimento moderadamente inconsistente (flicker=${flickerScore.toFixed(1)})`
      : `Consistência temporal suave (flicker=${flickerScore.toFixed(1)})`

    return { score, label, passed: score < 50 }
  } catch {
    return {
      score: 0,
      label: lang === 'en' ? 'Temporal analysis failed' : 'Análise temporal falhou',
      passed: true,
      abstained: true,
      skipped: true,
    }
  }
}
