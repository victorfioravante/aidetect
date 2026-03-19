import { ExtractedMedia } from './index'

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export async function extractFacebook(url: string): Promise<ExtractedMedia> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  })

  if (!response.ok) {
    throw new Error('Não foi possível acessar o post do Facebook / Could not access Facebook post')
  }

  const html = await response.text()

  const imageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/)
    ?? html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/)

  if (!imageMatch?.[1]) {
    throw new Error('Conteúdo privado ou inacessível / Private or inaccessible content')
  }

  const imageUrl = imageMatch[1].replace(/&amp;/g, '&')

  const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/)
    ?? html.match(/<meta\s+content="([^"]+)"\s+property="og:title"/)

  return {
    platform: 'FACEBOOK',
    mediaType: 'image',
    mediaUrl: imageUrl,
    thumbnailUrl: imageUrl,
    title: titleMatch?.[1],
  }
}
