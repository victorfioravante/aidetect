import ffmpeg from 'fluent-ffmpeg'
import { execSync } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

// Resolve ffmpeg binary path:
// 1. FFMPEG_PATH env var (set explicitly in Railway or .env)
// 2. System PATH (ffmpeg installed via nixpkgs on Railway, or apt on Linux)
// 3. Fallback: let fluent-ffmpeg try on its own
function resolveFfmpegPath(): string | null {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH
  try {
    const p = execSync('which ffmpeg', { encoding: 'utf8' }).trim()
    if (p) return p
  } catch { /* not in PATH */ }
  return null
}

const FFMPEG_PATH = resolveFfmpegPath()
if (FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(FFMPEG_PATH)
  ffmpeg.setFfprobePath(FFMPEG_PATH.replace(/ffmpeg$/, 'ffprobe'))
  console.log('[videoFrames] ffmpeg path:', FFMPEG_PATH)
} else {
  console.warn('[videoFrames] ffmpeg not found — video analysis will fail')
}

export interface ExtractedFrames {
  /** Representative frame for image analysis (middle frame) */
  keyFrame: Buffer
  /** All extracted frames for temporal analysis */
  frames: Buffer[]
}

/**
 * Extract frames from a video buffer using ffmpeg.
 *
 * Strategy:
 * - Extract up to MAX_FRAMES frames evenly distributed across the video
 * - Use the middle frame as keyFrame for image analyzers (ELA, FFT, texture, etc.)
 * - Return all frames for temporalAnalyzer
 *
 * Writes to a temp dir and cleans up after reading.
 */
export async function extractVideoFrames(
  videoBuffer: Buffer,
  maxFrames = 8,
): Promise<ExtractedFrames> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidetect-'))
  const inputPath = path.join(tmpDir, 'input.video')
  const outputPattern = path.join(tmpDir, 'frame-%03d.jpg')

  try {
    await fs.writeFile(inputPath, videoBuffer)

    // Get video duration first
    const duration = await getVideoDuration(inputPath)

    // Calculate fps to get approximately maxFrames distributed evenly
    // Minimum 1 fps, capped so we don't extract too many frames
    const fps = duration > 0 ? Math.max(1, maxFrames / duration) : 1

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          `-vf fps=${fps.toFixed(4)},scale=640:-1`,
          '-vframes', String(maxFrames),
          '-q:v', '3',            // JPEG quality 3 (good balance for analysis)
        ])
        .output(outputPattern)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run()
    })

    // Read extracted frame files in order
    const files = (await fs.readdir(tmpDir))
      .filter((f) => f.startsWith('frame-') && f.endsWith('.jpg'))
      .sort()

    if (files.length === 0) {
      throw new Error('No frames extracted from video')
    }

    const frames = await Promise.all(
      files.map((f) => fs.readFile(path.join(tmpDir, f)))
    )

    // Use the middle frame as representative keyframe
    const keyFrame = frames[Math.floor(frames.length / 2)]

    return { keyFrame, frames }
  } finally {
    // Clean up temp dir
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata?.format?.duration) {
        resolve(0)
        return
      }
      resolve(metadata.format.duration)
    })
  })
}
