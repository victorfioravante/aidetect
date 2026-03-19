export type Verdict = 'AI_GENERATED' | 'SUSPICIOUS' | 'AUTHENTIC'
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'
export type Lang = 'pt' | 'en'

export interface DetectorResult {
  score: number
  label: string
  passed: boolean
  hotspots?: number  // ELA: % pixels > 128
  edgeDensity?: number // Gradient: % pixels with magnitude > 100
}

export interface AnalysisResult {
  id: string
  verdict: Verdict
  score: number
  confidence: Confidence
  breakdown: {
    symmetry:    DetectorResult
    stats:       DetectorResult
    fft:         DetectorResult
    texture:     DetectorResult
    shadow:      DetectorResult
    ela:         DetectorResult
    gradient:    DetectorResult
    hive:        DetectorResult
    sightengine: DetectorResult
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
  }
}

// Weights must sum to 100
export const WEIGHTS = {
  symmetry:    12,
  stats:       10,
  fft:         13,
  texture:     13,
  shadow:      12,
  ela:         10,
  gradient:     5,
  hive:        13,
  sightengine: 12,
} as const

// Verify: 12+10+13+13+12+10+5+13+12 = 100 ✓

export function computeVerdict(score: number): { verdict: Verdict; confidence: Confidence } {
  if (score >= 70) {
    return { verdict: 'AI_GENERATED', confidence: score >= 85 ? 'HIGH' : 'MEDIUM' }
  }
  if (score >= 40) {
    return { verdict: 'SUSPICIOUS', confidence: 'MEDIUM' }
  }
  return { verdict: 'AUTHENTIC', confidence: score < 20 ? 'HIGH' : 'MEDIUM' }
}

export function weightedScore(scores: Record<keyof typeof WEIGHTS, number>): number {
  let total = 0
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    total += scores[key as keyof typeof WEIGHTS] * weight
  }
  return Math.round(total / 100)
}
