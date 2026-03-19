import axios from 'axios'
import { DetectorResult } from '../types'

/**
 * Hive Moderation API
 * External AI detection API. Returns score 0 if API key not configured.
 */
export async function hiveAnalyzer(buffer: Buffer, lang: string): Promise<DetectorResult> {
  const apiKey = process.env.HIVE_API_KEY

  if (!apiKey) {
    return {
      score: 0,
      label: lang === 'en' ? 'API not configured' : 'API não configurada',
      passed: true,
      abstained: true,
    }
  }

  try {
    const formData = new FormData()
    const blob = new Blob([buffer], { type: 'image/jpeg' })
    formData.append('image', blob, 'image.jpg')

    const response = await axios.post(
      'https://api.thehive.ai/api/v2/task/sync',
      formData,
      {
        headers: {
          Authorization: `token ${apiKey}`,
          'Content-Type': 'multipart/form-data',
        },
        timeout: 15000,
      }
    )

    const classes = response.data?.status?.[0]?.response?.output?.[0]?.classes ?? []
    const aiClass = classes.find(
      (c: { class: string; score: number }) => c.class === 'ai_generated'
    )
    const score = aiClass ? Math.round(aiClass.score * 100) : 0

    const label = lang === 'en'
      ? score >= 70
        ? `Hive API: ${score}% probability of AI generation`
        : score >= 40
        ? `Hive API: ${score}% suspicious`
        : `Hive API: ${score}% likely authentic`
      : score >= 70
      ? `Hive API: ${score}% de probabilidade de geração por IA`
      : score >= 40
      ? `Hive API: ${score}% suspeito`
      : `Hive API: ${score}% provavelmente autêntico`

    return { score, label, passed: score < 50 }
  } catch {
    return {
      score: 0,
      label: lang === 'en' ? 'Hive API error' : 'Erro na API Hive',
      passed: true,
    }
  }
}
