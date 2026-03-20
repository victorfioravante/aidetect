import sharp from 'sharp'

/**
 * Normalize an image buffer to a consistent JPEG for analysis.
 *
 * - Handles HEIC/HEIF (iPhone default), AVIF, GIF, and all standard formats
 * - Applies EXIF orientation correction (.rotate()) so analyzers see the correct pixel layout
 * - Preserves EXIF metadata (.withMetadata()) so exifAnalyzer can still read
 *   camera make/model, GPS, and software fields from the output buffer
 * - Quality 95 to minimize re-compression artifacts that would confuse ELA
 */
export async function normalizeBuffer(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()           // correct EXIF orientation; strips rotation tag but keeps other metadata
    .withMetadata()     // preserve all EXIF (camera make/model, GPS, software...)
    .jpeg({ quality: 95 })
    .toBuffer()
}

/**
 * Check if a buffer appears to be a valid image sharp can process.
 * Returns the detected format string or null on failure.
 */
export async function detectImageFormat(buffer: Buffer): Promise<string | null> {
  try {
    const meta = await sharp(buffer).metadata()
    return meta.format ?? null
  } catch {
    return null
  }
}
