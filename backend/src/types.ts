export type Verdict = 'AI_GENERATED' | 'SUSPICIOUS' | 'AUTHENTIC'
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'
export type Lang = 'pt' | 'en'

export interface DetectorResult {
  score: number
  label: string
  passed: boolean
}

export interface AnalysisResult {
  id: string
  verdict: Verdict
  score: number
  confidence: Confidence
  breakdown: {
    rotation: DetectorResult
    stats: DetectorResult
    fft: DetectorResult
    texture: DetectorResult
    shadow: DetectorResult
    ela: DetectorResult
    hive: DetectorResult
  }
  visualizations: {
    elaMap: string
    gradientMap: string
    fftSpectrum: string
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
  rotation: 15,
  stats: 10,
  fft: 15,
  texture: 15,
  shadow: 15,
  ela: 10,
  hive: 20,
} as const

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
