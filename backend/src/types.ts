export type Verdict = 'AI_GENERATED' | 'SUSPICIOUS' | 'AUTHENTIC'
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'
export type Lang = 'pt' | 'en'

export interface DetectorResult {
  score: number
  label: string
  passed: boolean
  abstained?: boolean  // true = API not configured / model unavailable
  skipped?: boolean    // true = not applicable (e.g. temporal on images)
  hotspots?: number    // ELA: % pixels > 128
  edgeDensity?: number // Gradient: % pixels with magnitude > 100
}

export interface AnalysisResult {
  id: string
  verdict: Verdict
  score: number
  confidence: Confidence
  breakdown: {
    symmetry:      DetectorResult
    stats:         DetectorResult
    fft:           DetectorResult
    texture:       DetectorResult
    shadow:        DetectorResult
    ela:           DetectorResult
    gradient:      DetectorResult
    exif:          DetectorResult
    noise:         DetectorResult
    temporal:      DetectorResult
    platformLabel: DetectorResult
    hive:          DetectorResult
    sightengine:   DetectorResult
    transformers:  DetectorResult
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

// Base static weights for local detectors (always active)
// Dynamic detectors (hive, sightengine, platformLabel, temporal) start at 0
// and are added when available.
// Base sum: 10+8+10+10+10+8+4+15+8+7 = 90 + transformers 10 = 100 when no dynamic APIs
export const WEIGHTS = {
  symmetry:      10,
  stats:          8,
  fft:           10,
  texture:       10,
  shadow:        10,
  ela:            8,
  gradient:       4,
  exif:          15,
  noise:          8,
  temporal:       0,   // dynamic: +10 for video
  platformLabel:  0,   // dynamic: +20 when available
  hive:           0,   // dynamic: +8 when configured
  sightengine:    0,   // dynamic: +7 when configured
  transformers:   7,
} as const

// 10+8+10+10+10+8+4+15+8+0+0+0+0+7 = 90 base
// Remaining 10 filled by temporal/platformLabel/hive/sightengine when available

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
 * Computes the final score with dynamic weight management:
 *
 * 1. HEURISTIC: if Transformers model is unavailable, estimate its score
 *    from shadow (40%) + ela (35%) + fft (25%).
 *
 * 2. DYNAMIC WEIGHTS: start from the base WEIGHTS and add dynamic detector
 *    weights only when those detectors are available (not abstained/skipped).
 *    This ensures the score always normalizes to actual contributing weight.
 *
 * 3. OVERRIDES: strong consensus from multiple local detectors enforces
 *    minimum score thresholds.
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

  // ─── 2. DYNAMIC WEIGHT ASSIGNMENT ─────────────────────────────────────────
  const weights: Record<keyof typeof WEIGHTS, number> = { ...WEIGHTS }

  // External API detectors — add their weight only when they contributed a real score
  if (!breakdown.hive.abstained) {
    weights.hive = 8
  }
  if (!breakdown.sightengine.abstained) {
    weights.sightengine = 7
  }
  // Temporal: only for video (not skipped)
  if (!breakdown.temporal.abstained && !breakdown.temporal.skipped) {
    weights.temporal = 10
  }
  // Platform label: only when injected via social extraction
  if (!breakdown.platformLabel.abstained) {
    weights.platformLabel = 20
  }

  // If any dynamic detector is missing, redistribute to reliable local ones
  // proportionally among the base detectors (shadow, ela, fft)
  const missingWeight =
    (breakdown.hive.abstained ? 8 : 0) +
    (breakdown.sightengine.abstained ? 7 : 0) +
    (breakdown.temporal.skipped || breakdown.temporal.abstained ? 0 : 0) +
    (breakdown.platformLabel.abstained ? 0 : 0)

  if (missingWeight > 0) {
    // Distribute: shadow 40%, ela 35%, fft 25%
    weights.shadow += Math.round(missingWeight * 0.40)
    weights.ela    += Math.round(missingWeight * 0.35)
    weights.fft    += Math.round(missingWeight * 0.25)
  }

  // Compute weighted sum, normalizing by actual total weight
  const totalWeight = (Object.values(weights) as number[]).reduce((s, w) => s + w, 0)
  let total = 0
  for (const [key, weight] of Object.entries(weights)) {
    if (weight > 0) {
      total += effectiveScores[key as keyof typeof WEIGHTS] * weight
    }
  }
  let score = totalWeight > 0 ? Math.round(total / totalWeight) : 0

  // ─── 3. OVERRIDE RULES ────────────────────────────────────────────────────

  // Platform explicitly labelled this as AI-generated
  if (!breakdown.platformLabel.abstained && breakdown.platformLabel.score >= 95) {
    score = Math.max(score, 85)
  }

  // Shadow >85 + ELA >70 → clearly suspicious
  if (breakdown.shadow.score > 85 && breakdown.ela.score > 70) {
    score = Math.max(score, 65)
  }
  // Shadow >95 + ELA >75 → very high confidence AI
  if (breakdown.shadow.score > 95 && breakdown.ela.score > 75) {
    score = Math.max(score, 72)
  }
  // 3+ local detectors above 70 → consensus signal
  const highCount = Object.values(breakdown).filter((d) => !d.skipped && !d.abstained && d.score > 70).length
  if (highCount >= 3) {
    score = Math.max(score, 60)
  }

  // EXIF explicitly found AI software
  if (!breakdown.exif.abstained && breakdown.exif.score >= 80) {
    score = Math.max(score, 80)
  }

  return { score: Math.min(100, score), effectiveBreakdown }
}

// Kept for backward compatibility
export function weightedScore(scores: Record<keyof typeof WEIGHTS, number>): number {
  const baseKeys: (keyof typeof WEIGHTS)[] = [
    'symmetry', 'stats', 'fft', 'texture', 'shadow', 'ela', 'gradient', 'transformers'
  ]
  const baseWeights = { symmetry:10, stats:8, fft:10, texture:10, shadow:10, ela:8, gradient:4, transformers:7 }
  let total = 0, sum = 0
  for (const k of baseKeys) {
    const w = baseWeights[k as keyof typeof baseWeights]
    total += scores[k] * w
    sum += w
  }
  return Math.round(total / sum)
}
