import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { ExtractedMedia } from './index'

const execAsync = promisify(exec)

interface YouTubeOEmbed {
  title: string
  author_name: string
  thumbnail_url: string
}

export async function extractYouTube(url: string): Promise<ExtractedMedia> {
  // Primary: YouTube oEmbed (no auth required)
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    const response = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIDetectBot/1.0)' },
    })

    if (response.ok) {
      const data = await response.json() as YouTubeOEmbed
      if (data.thumbnail_url) {
        return {
          platform: 'YOUTUBE',
          mediaType: 'image',
          mediaUrl: data.thumbnail_url,
          thumbnailUrl: data.thumbnail_url,
          title: data.title,
          authorName: data.author_name,
        }
      }
    }
  } catch {
    // fall through to yt-dlp
  }

  // Fallback: yt-dlp thumbnail extraction
  try {
    const { stdout } = await execAsync('which yt-dlp', { timeout: 5000 })
    if (!stdout.trim()) throw new Error('yt-dlp não encontrado')
  } catch {
    throw new Error('yt-dlp não instalado no servidor / yt-dlp not installed on server')
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aidetect-yt-'))
  try {
    const outputTemplate = path.join(tmpDir, 'yt_%(id)s.%(ext)s')
    await execAsync(
      `yt-dlp --write-thumbnail --skip-download --output "${outputTemplate}" "${url}"`,
      { timeout: 30000 }
    )

    const files = fs.readdirSync(tmpDir)
    const thumbFile = files.find((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
    if (!thumbFile) throw new Error('Thumbnail não encontrado')

    const thumbPath = path.join(tmpDir, thumbFile)
    const buffer = fs.readFileSync(thumbPath)
    // Return as data URI since yt-dlp gave us a local file
    const base64 = buffer.toString('base64')
    const mimeType = thumbFile.endsWith('.png') ? 'image/png' : 'image/jpeg'
    const dataUri = `data:${mimeType};base64,${base64}`

    return {
      platform: 'YOUTUBE',
      mediaType: 'image',
      mediaUrl: dataUri,
      thumbnailUrl: dataUri,
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}
