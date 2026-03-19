export type Verdict = 'AI_GENERATED' | 'SUSPICIOUS' | 'AUTHENTIC'
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'
export type Lang = 'pt' | 'en'

export interface DetectorResult {
  score: number
  label: string
  passed: boolean
  abstained?: boolean  // true = API not configured / model unavailable
  hotspots?: number    // ELA: % pixels > 128
  edgeDensity?: number // Gradient: % pixels with magnitude > 100
}

export interface AnalysisResult {
  id: string
  verdict: Verdict
  score: number
  confidence: Confidence
  breakdown: {
    symmetry:     DetectorResult
    stats:        DetectorResult
    fft:          DetectorResult
    texture:      DetectorResult
    shadow:       DetectorResult
    ela:          DetectorResult
    gradient:     DetectorResult
    hive:         DetectorResult
    sightengine:  DetectorResult
    transformers: DetectorResult
  }
  visualizations: {
    elaMap:      string
    gradientMap: string
    fftSpectrum: string
    shadowViz:   string
  }
  meta: {
    processedAt: string
    mediaType: 'image' | 'video'
    sourceUrl?: string
    platform?: string
    thumbnailUrl?: string
  }
}

// Static weights — used when all detectors are active
export const WEIGHTS = {
  symmetry:     12,
  stats:        10,
  fft:          10,
  texture:      11,
  shadow:       12,
  ela:          10,
  gradient:      5,
  hive:          8,
  sightengine:   7,
  transformers:  15,
} as const

// Verify: 12+10+10+11+12+10+5+8+7+15 = 100 ✓

export function computeVerdict(score: number): { verdict: Verdict; confidence: Confidence } {
  if (score >= 70) {
    return { verdict: 'AI_GENERATED', confidence: score >= 85 ? 'HIGH' : 'MEDIUM' }
  }
  if (score >= 40) {
    return { verdict: 'SUSPICIOUS', confidence: 'MEDIUM' }
  }
  return { verdict: 'AUTHENTIC', confidence: score < 20 ? 'HIGH' : 'MEDIUM' }
}

/**
 * Computes the final score with three layers of intelligence:
 *
 * 1. HEURISTIC: if Transformers model is unavailable, estimate its score
 *    from shadow (40%) + ela (35%) + fft (25%) — the most reliable local detectors.
 *
 * 2. DYNAMIC WEIGHTS: if external APIs (Hive, Sightengine) are absent,
 *    redistribute their weights to local detectors instead of letting them pull
 *    the average down with artificial zeros.
 *
 * 3. OVERRIDES: when strong local signals clearly indicate AI generation,
 *    enforce minimum score thresholds regardless of absent API scores.
 */
export function computeFinalScore(
  rawScores: Record<keyof typeof WEIGHTS, number>,
  breakdown: AnalysisResult['breakdown'],
  lang: Lang
): { score: number; effectiveBreakdown: AnalysisResult['breakdown'] } {
  const effectiveScores = { ...rawScores }
  const effectiveBreakdown = { ...breakdown }

  // ─── 1. TRANSFORMERS HEURISTIC ─────────────────────────────────────────────
  if (breakdown.transformers.abstained) {
    const heuristic = Math.round(
      rawScores.shadow * 0.40 +
      rawScores.ela    * 0.35 +
      rawScores.fft    * 0.25
    )
    effectiveScores.transformers = heuristic
    effectiveBreakdown.transformers = {
      score: heuristic,
      label: lang === 'en'
        ? `Local heuristic (shadow+ELA+FFT) — model unavailable`
        : `Heurística local (shadow+ELA+FFT) — modelo indisponível`,
      passed: heuristic < 50,
    }
  }

  // ─── 2. DYNAMIC WEIGHT REDISTRIBUTION ─────────────────────────────────────
  // Start from the static weights and adjust based on which APIs abstained.
  // Use a mutable copy so we can zero-out absent detectors and add their
  // weight to reliable local ones. Final score is normalized by actual sum.
  const weights: Record<keyof typeof WEIGHTS, number> = { ...WEIGHTS }

  if (breakdown.hive.abstained) {
    // Redistribute hive weight (8) → shadow+3, ela+3, fft+2
    weights.shadow      += 3
    weights.ela         += 3
    weights.fft         += 2
    weights.hive         = 0
  }

  if (breakdown.sightengine.abstained) {
    // Redistribute sightengine weight (7) → symmetry+3, texture+2, stats+2
    weights.symmetry    += 3
    weights.texture     += 2
    weights.stats       += 2
    weights.sightengine  = 0
  }

  // Compute weighted sum, normalizing by actual total weight (handles any sum)
  const totalWeight = (Object.values(weights) as number[]).reduce((s, w) => s + w, 0)
  let total = 0
  for (const [key, weight] of Object.entries(weights)) {
    total += effectiveScores[key as keyof typeof WEIGHTS] * weight
  }
  let score = Math.round(total / totalWeight)

  // ─── 3. OVERRIDE RULES ────────────────────────────────────────────────────
  // When multiple strong local detectors agree, trust them over absent APIs.

  // Shadow >85 + ELA >70 → clearly suspicious
  if (breakdown.shadow.score > 85 && breakdown.ela.score > 70) {
    score = Math.max(score, 65)
  }
  // Shadow >95 + ELA >75 → very high confidence AI
  if (breakdown.shadow.score > 95 && breakdown.ela.score > 75) {
    score = Math.max(score, 72)
  }
  // 3+ local detectors above 70 → consensus signal
  const highCount = Object.values(breakdown).filter((d) => d.score > 70).length
  if (highCount >= 3) {
    score = Math.max(score, 60)
  }

  return { score: Math.min(100, score), effectiveBreakdown }
}

// Kept for backward compatibility (tests, social.ts averaging)
export function weightedScore(scores: Record<keyof typeof WEIGHTS, number>): number {
  let total = 0
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    total += scores[key as keyof typeof WEIGHTS] * weight
  }
  return Math.round(total / 100)
}
