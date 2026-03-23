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
// Base sum: 7+8+10+10+10+8+2+16+11+8 = 90 when no dynamic APIs
//
// Changes from original calibration:
//   symmetry:    10 → 7   (reduced after formula fix; still contributes, less authority)
//   gradient:     4 → 2   (noisiest local detector, high false-positive on real photos)
//   noise:        8 → 11  (reliable heterogeneous-noise signal, underweighted before)
//   exif:        15 → 16  (most authoritative single signal)
//   transformers: 7 → 8   (ViT model is reliable when available)
export const WEIGHTS = {
  symmetry:      7,
  stats:          8,
  fft:           10,
  texture:       10,
  shadow:        10,
  ela:            8,
  gradient:       2,
  exif:          16,
  noise:         11,
  temporal:       0,   // dynamic: +10 for video
  platformLabel:  0,   // dynamic: +20 when available
  hive:           0,   // dynamic: +8 when configured
  sightengine:    0,   // dynamic: +7 when configured
  transformers:   8,
} as const

// 7+8+10+10+10+8+2+16+11+0+0+0+0+8 = 90 base
// Remaining filled by temporal/platformLabel/hive/sightengine when available

export function computeVerdict(score: number): { verdict: Verdict; confidence: Confidence } {
  if (score >= 70) {
    return { verdict: 'AI_GENERATED', confidence: score >= 85 ? 'HIGH' : 'MEDIUM' }
  }
  if (score >= 40) {
    // Score 62-69: strong suspicion (near the AI threshold)
    // Score 40-61: weak suspicion (borderline, could go either way)
    return { verdict: 'SUSPICIOUS', confidence: score >= 62 ? 'MEDIUM' : 'LOW' }
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
  // When the ViT model is unavailable, estimate its score from more reliable
  // local detectors: exif + noise + fft + texture + ela.
  //
  // Previous heuristic used shadow+ELA+FFT, which are the detectors with the
  // highest false-positive rates on real high-contrast photos. The new blend
  // uses exif (most authoritative) and noise (most reliable) as primary signals.
  //
  // Cap at 55 when EXIF confirms a real camera to prevent false AI_GENERATED.
  if (breakdown.transformers.abstained) {
    const exifScore = breakdown.exif?.score ?? 50
    const hasConfirmedCamera = exifScore < 20

    let heuristic = Math.round(
      rawScores.exif    * 0.30 +
      rawScores.noise   * 0.25 +
      rawScores.fft     * 0.20 +
      rawScores.texture * 0.15 +
      rawScores.ela     * 0.10
    )

    if (hasConfirmedCamera) {
      heuristic = Math.min(heuristic, 55)
    }

    effectiveScores.transformers = heuristic
    effectiveBreakdown.transformers = {
      score: heuristic,
      label: lang === 'en'
        ? hasConfirmedCamera
          ? `Local heuristic (EXIF-moderated) — model unavailable`
          : `Local heuristic (EXIF+noise+FFT+texture+ELA) — model unavailable`
        : hasConfirmedCamera
          ? `Heurística local (moderada por EXIF) — modelo indisponível`
          : `Heurística local (EXIF+ruído+FFT+textura+ELA) — modelo indisponível`,
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

  const exifScore = breakdown.exif?.score ?? 50
  // EXIF score < 20 means real camera metadata was confirmed
  const hasConfirmedCamera = !breakdown.exif?.abstained && exifScore < 20

  // Platform explicitly labelled this as AI-generated
  if (!breakdown.platformLabel.abstained && breakdown.platformLabel.score >= 95) {
    score = Math.max(score, 85)
  }

  // EXIF explicitly found AI software — very strong signal
  if (!breakdown.exif.abstained && breakdown.exif.score >= 80) {
    score = Math.max(score, 80)
  }

  // Shadow+ELA overrides: ONLY fire when EXIF has NOT confirmed a real camera.
  // Real photos in high-contrast scenes (window vs dark room, etc.) naturally
  // produce inconsistent shadow directions and ELA artifacts from recompression.
  if (!hasConfirmedCamera) {
    if (breakdown.shadow.score > 85 && breakdown.ela.score > 70) {
      score = Math.max(score, 65)
    }
    if (breakdown.shadow.score > 95 && breakdown.ela.score > 75) {
      score = Math.max(score, 72)
    }
  }

  // 3+ detectors > 70 → consensus signal.
  // Exclude shadow and gradient: both have high false-positive rates on
  // high-contrast scenes and uniform-background real photos.
  // Also exclude purely external/dynamic detectors.
  const NOISY_DETECTORS = new Set(['shadow', 'gradient', 'platformLabel', 'temporal', 'hive', 'sightengine'])
  const highScoreDetectors = (Object.entries(breakdown) as [string, DetectorResult][])
    .filter(([key, d]) => !NOISY_DETECTORS.has(key) && !d.skipped && !d.abstained && d.score > 70)
  if (highScoreDetectors.length >= 3) {
    score = Math.max(score, 60)
  }

  // If EXIF confirmed real camera, hard-cap score at 65 unless platform/EXIF software override
  // was already applied — those are authoritative signals.
  if (hasConfirmedCamera) {
    const platformOverrideApplied = !breakdown.platformLabel.abstained && breakdown.platformLabel.score >= 95
    const exifSoftwareOverrideApplied = breakdown.exif.score >= 80
    if (!platformOverrideApplied && !exifSoftwareOverrideApplied) {
      // Apply a 10-point calibration discount before the hard cap.
      // Real camera hardware is strong prior evidence of authenticity; this accounts
      // for systematic false-positive bias from HEIC→JPEG conversion artifacts,
      // high-contrast textures (wood, fabric), and multi-source lighting (shadows).
      score = Math.max(0, score - 10)
      score = Math.min(score, 45)
    }
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
