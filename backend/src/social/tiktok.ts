import axios from 'axios'
import { ExtractedMedia } from './index'
import { detectAiLabel } from './platformLabels'

interface TikWmResponse {
  code: number
  msg: string
  data?: {
    play: string
    cover: string
    title: string
    author?: { nickname: string }
    images?: string[]              // TikTok photo mode
    aigc_label?: boolean           // TikTok AI-generated content flag
    is_ai_generated?: boolean
    ai_generate_type?: number
  }
}

export async function extractTikTok(url: string): Promise<ExtractedMedia> {
  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`

  const response = await axios.get<TikWmResponse>(apiUrl, {
    timeout: 15000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIDetectBot/1.0)' },
  })

  const data = response.data?.data
  if (!data) throw new Error('Não foi possível extrair mídia do TikTok')

  const hasAiLabel =
    !!data.aigc_label ||
    !!data.is_ai_generated ||
    (data.ai_generate_type !== undefined && data.ai_generate_type > 0) ||
    detectAiLabel(JSON.stringify(response.data))

  // Photo carousel mode
  if (data.images && data.images.length > 0) {
    return {
      platform: 'TIKTOK',
      mediaType: 'image',
      mediaUrl: data.images[0],
      thumbnailUrl: data.cover || data.images[0],
      title: data.title,
      authorName: data.author?.nickname,
      hasAiLabel,
    }
  }

  // Video mode
  if (data.play) {
    return {
      platform: 'TIKTOK',
      mediaType: 'video',
      mediaUrl: data.play,
      thumbnailUrl: data.cover,
      title: data.title,
      authorName: data.author?.nickname,
      hasAiLabel,
    }
  }

  // Fallback to cover image
  if (data.cover) {
    return {
      platform: 'TIKTOK',
      mediaType: 'image',
      mediaUrl: data.cover,
      thumbnailUrl: data.cover,
      title: data.title,
      authorName: data.author?.nickname,
      hasAiLabel,
    }
  }

  throw new Error('Não foi possível extrair mídia do TikTok')
}
