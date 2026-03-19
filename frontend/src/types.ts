export type Verdict = 'AI_GENERATED' | 'SUSPICIOUS' | 'AUTHENTIC'
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'
export type Lang = 'pt' | 'en'

export interface DetectorResult {
  score: number
  label: string
  passed: boolean
  hotspots?: number
  edgeDensity?: number
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

export interface RateLimitError {
  success: false
  error: 'RATE_LIMIT_EXCEEDED'
  resetAt: string
}
