import { ExtractedMedia } from './index'

function extractTweetId(url: string): string | null {
  const match = url.match(/(?:twitter|x)\.com\/\w+\/status\/(\d+)/)
  return match ? match[1] : null
}

export async function extractTwitter(url: string): Promise<ExtractedMedia> {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN
  if (!bearerToken) throw new Error('Twitter API não configurada / Twitter API not configured')

  const tweetId = extractTweetId(url)
  if (!tweetId) throw new Error('URL de tweet inválida / Invalid tweet URL')

  // Lazy import to avoid crash if package is missing
  const { TwitterApi } = await import('twitter-api-v2').catch(() => {
    throw new Error('Pacote twitter-api-v2 não instalado / twitter-api-v2 package not installed')
  })

  const client = new TwitterApi(bearerToken)

  const tweet = await client.v2.singleTweet(tweetId, {
    expansions: ['attachments.media_keys'],
    'media.fields': ['url', 'preview_image_url', 'type', 'public_metrics'],
  })

  const media = tweet.includes?.media
  if (!media || media.length === 0) throw new Error('Nenhuma mídia encontrada no tweet / No media found in tweet')

  const firstMedia = media[0]

  // Photo
  if (firstMedia.type === 'photo' && firstMedia.url) {
    return {
      platform: 'TWITTER',
      mediaType: 'image',
      mediaUrl: firstMedia.url,
      thumbnailUrl: firstMedia.url,
      title: tweet.data.text?.slice(0, 100),
    }
  }

  // Video or animated GIF — use preview image
  if (firstMedia.preview_image_url) {
    return {
      platform: 'TWITTER',
      mediaType: 'image',
      mediaUrl: firstMedia.preview_image_url,
      thumbnailUrl: firstMedia.preview_image_url,
      title: tweet.data.text?.slice(0, 100),
    }
  }

  throw new Error('Tipo de mídia não suportado no tweet / Unsupported media type in tweet')
}
