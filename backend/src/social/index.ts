import { extractTikTok } from './tiktok'
import { extractTwitter } from './twitter'
import { extractYouTube } from './youtube'
import { extractInstagram } from './instagram'
import { extractFacebook } from './facebook'

export type SocialPlatform =
  'TIKTOK' | 'TWITTER' | 'INSTAGRAM' | 'YOUTUBE' | 'FACEBOOK'

export interface ExtractedMedia {
  platform: SocialPlatform
  mediaType: 'image' | 'video'
  mediaUrl: string        // direct URL for download
  thumbnailUrl?: string   // preview to show in frontend
  title?: string
  authorName?: string
}

export function detectPlatform(url: string): SocialPlatform | null {
  if (/tiktok\.com/.test(url))             return 'TIKTOK'
  if (/(twitter|x)\.com/.test(url))        return 'TWITTER'
  if (/instagram\.com/.test(url))          return 'INSTAGRAM'
  if (/youtube\.com|youtu\.be/.test(url))  return 'YOUTUBE'
  if (/facebook\.com|fb\.watch/.test(url)) return 'FACEBOOK'
  return null
}

export async function extractMediaFromUrl(url: string): Promise<ExtractedMedia> {
  const platform = detectPlatform(url)
  if (!platform) throw new Error('Plataforma não suportada / Platform not supported')

  switch (platform) {
    case 'TIKTOK':    return extractTikTok(url)
    case 'TWITTER':   return extractTwitter(url)
    case 'YOUTUBE':   return extractYouTube(url)
    case 'INSTAGRAM': return extractInstagram(url)
    case 'FACEBOOK':  return extractFacebook(url)
  }
}
