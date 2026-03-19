import { DetectorResult } from '../types'

/**
 * Sightengine AI/Deepfake detector
 * Gracefully returns score 0 if credentials are not configured.
 * Uses native fetch + FormData (Node 18+).
 */
export async function sightengineAnalyzer(buffer: Buffer, lang: string): Promise<DetectorResult> {
  const apiUser = process.env.SIGHTENGINE_API_USER
  const apiSecret = process.env.SIGHTENGINE_API_SECRET

  if (!apiUser || !apiSecret) {
    return {
      score: 0,
      label: lang === 'en' ? 'API not configured' : 'API não configurada',
      passed: true,
    }
  }

  try {
    const form = new FormData()
    const blob = new Blob([buffer], { type: 'image/jpeg' })
    form.append('media', blob, 'image.jpg')
    form.append('models', 'deepfake,ai-generated')
    form.append('api_user', apiUser)
    form.append('api_secret', apiSecret)

    const response = await fetch('https://api.sightengine.com/1.0/check.json', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const data = await response.json() as SightengineResponse
    const aiScore = data.ai_generated?.probability ?? 0
    const deepfakeScore = data.type?.deepfake ?? 0

    const score = Math.round((aiScore * 0.6 + deepfakeScore * 0.4) * 100)

    const label = lang === 'en'
      ? score >= 70
        ? 'Sightengine: high probability of AI generation or deepfake'
        : score >= 40
        ? 'Sightengine: moderate AI/deepfake signals'
        : 'Sightengine: likely authentic'
      : score >= 70
      ? 'Sightengine: alta probabilidade de geração por IA ou deepfake'
      : score >= 40
      ? 'Sightengine: sinais moderados de IA/deepfake'
      : 'Sightengine: provavelmente autêntico'

    return { score, label, passed: score < 50 }
  } catch {
    return {
      score: 0,
      label: lang === 'en' ? 'Sightengine request failed' : 'Requisição Sightengine falhou',
      passed: true,
    }
  }
}

interface SightengineResponse {
  status: string
  ai_generated?: { probability: number }
  type?: { deepfake: number }
}
