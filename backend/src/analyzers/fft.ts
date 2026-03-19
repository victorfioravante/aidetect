import sharp from 'sharp'
import { DetectorResult } from '../types'

/**
 * FFT / Frequency Analysis (simplified via pixel statistics)
 * AI images often show spectral peaks at regular frequencies due to
 * convolutional upsampling artifacts. We approximate this by analyzing
 * the difference between a blurred and sharpened version.
 */
export async function fftAnalyzer(buffer: Buffer, lang: string): Promise<{
  result: DetectorResult
  fftSpectrum: string
}> {
  try {
    // Get low-frequency content (blur)
    const low = await sharp(buffer)
      .greyscale()
      .resize(64, 64, { fit: 'cover' })
      .blur(3)
      .raw()
      .toBuffer()

    // Get high-frequency content (sharpen, no blur)
    const high = await sharp(buffer)
      .greyscale()
      .resize(64, 64, { fit: 'cover' })
      .raw()
      .toBuffer()

    // Frequency residual
    const len = Math.min(low.length, high.length)
    const residual = new Uint8Array(len)
    let sumResidual = 0
    let peakCount = 0

    for (let i = 0; i < len; i++) {
      const diff = Math.abs(high[i] - low[i])
      residual[i] = Math.min(255, diff * 4)
      sumResidual += diff
      if (diff > 30) peakCount++
    }

    const avgResidual = sumResidual / len
    const peakRatio = peakCount / len

    // AI images from GAN/diffusion often have regular high-freq patterns
    const score = computeFFTScore(avgResidual, peakRatio)

    // Visualize residual as spectrum image
    const dim = 8 // 8x8 = 64 pixels
    const rgbSpectrum = Buffer.alloc(dim * dim * 3)
    for (let i = 0; i < Math.min(residual.length, dim * dim); i++) {
      const v = residual[i]
      rgbSpectrum[i * 3] = 255 - v
      rgbSpectrum[i * 3 + 1] = 0
      rgbSpectrum[i * 3 + 2] = v
    }

    const fftImage = await sharp(rgbSpectrum, {
      raw: { width: dim, height: dim, channels: 3 },
    })
      .resize(256, 256, { kernel: 'nearest' })
      .png()
      .toBuffer()

    const fftSpectrum = fftImage.toString('base64')

    const label = lang === 'en'
      ? score >= 70
        ? 'Artificial frequency patterns detected (GAN/diffusion artifacts)'
        : score >= 40
        ? 'Some spectral anomalies present'
        : 'Natural frequency distribution'
      : score >= 70
      ? 'Padrões de frequência artificiais detectados (artefatos GAN/difusão)'
      : score >= 40
      ? 'Algumas anomalias espectrais presentes'
      : 'Distribuição de frequência natural'

    return {
      result: { score, label, passed: score < 50 },
      fftSpectrum,
    }
  } catch {
    return {
      result: {
        score: 0,
        label: lang === 'en' ? 'FFT analysis failed' : 'Análise FFT falhou',
        passed: true,
      },
      fftSpectrum: '',
    }
  }
}

function computeFFTScore(avgResidual: number, peakRatio: number): number {
  let score = 40

  // High regularity in residual → AI artifacts
  if (avgResidual > 25 && peakRatio > 0.15) score += 40
  else if (avgResidual > 15 && peakRatio > 0.08) score += 20
  else if (avgResidual < 8) score += 10 // too smooth

  if (peakRatio > 0.3) score += 15

  return Math.min(100, Math.max(0, score))
}
