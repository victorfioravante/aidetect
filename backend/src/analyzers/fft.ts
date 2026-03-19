import sharp from 'sharp'
import { DetectorResult } from '../types'

const FFT_SIZE = 64 // power of 2

/**
 * FFT Frequency Analysis
 * Computes a real 2D DFT via Cooley-Tukey. Applies log scale + fftshift.
 * AI images often show a bright cross in the spectrum (periodic upsampling artifacts).
 */

// Iterative Cooley-Tukey FFT (in-place, power-of-2 length)
function fft1d(re: Float64Array, im: Float64Array): void {
  const N = re.length

  // Bit-reversal permutation
  let j = 0
  for (let i = 1; i < N; i++) {
    let bit = N >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      let tmp = re[i]; re[i] = re[j]; re[j] = tmp
      tmp = im[i]; im[i] = im[j]; im[j] = tmp
    }
  }

  // Cooley-Tukey butterfly
  for (let len = 2; len <= N; len <<= 1) {
    const ang = -2 * Math.PI / len
    const wBaseRe = Math.cos(ang)
    const wBaseIm = Math.sin(ang)
    for (let i = 0; i < N; i += len) {
      let curRe = 1, curIm = 0
      const half = len >> 1
      for (let k = 0; k < half; k++) {
        const u = i + k
        const v = i + k + half
        const tRe = curRe * re[v] - curIm * im[v]
        const tIm = curRe * im[v] + curIm * re[v]
        re[v] = re[u] - tRe
        im[v] = im[u] - tIm
        re[u] += tRe
        im[u] += tIm
        const newCurRe = curRe * wBaseRe - curIm * wBaseIm
        curIm = curRe * wBaseIm + curIm * wBaseRe
        curRe = newCurRe
      }
    }
  }
}

// Colormap: 0→(0,0,64), 64→(0,0,255), 128→(0,255,128), 192→(255,255,0), 255→(255,255,255)
function spectralColormap(v: number): [number, number, number] {
  if (v <= 64) {
    const t = v / 64
    return [0, 0, Math.round(64 + t * 191)]
  } else if (v <= 128) {
    const t = (v - 64) / 64
    return [0, Math.round(t * 255), Math.round(255 - t * 127)]
  } else if (v <= 192) {
    const t = (v - 128) / 64
    return [Math.round(t * 255), 255, Math.round(128 - t * 128)]
  } else {
    const t = (v - 192) / 63
    return [255, 255, Math.round(t * 255)]
  }
}

export async function fftAnalyzer(buffer: Buffer, lang: string): Promise<{
  result: DetectorResult
  fftSpectrum: string
}> {
  try {
    const { data } = await sharp(buffer)
      .greyscale()
      .resize(FFT_SIZE, FFT_SIZE, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true })

    const N = FFT_SIZE
    const re = new Float64Array(N * N)
    const im = new Float64Array(N * N)

    for (let i = 0; i < N * N; i++) {
      re[i] = data[i]
      im[i] = 0
    }

    // 2D FFT: transform rows then columns
    for (let y = 0; y < N; y++) {
      const rowRe = re.slice(y * N, (y + 1) * N)
      const rowIm = im.slice(y * N, (y + 1) * N)
      fft1d(rowRe, rowIm)
      re.set(rowRe, y * N)
      im.set(rowIm, y * N)
    }

    for (let x = 0; x < N; x++) {
      const colRe = new Float64Array(N)
      const colIm = new Float64Array(N)
      for (let y = 0; y < N; y++) {
        colRe[y] = re[y * N + x]
        colIm[y] = im[y * N + x]
      }
      fft1d(colRe, colIm)
      for (let y = 0; y < N; y++) {
        re[y * N + x] = colRe[y]
        im[y * N + x] = colIm[y]
      }
    }

    // Compute magnitude
    const mag = new Float64Array(N * N)
    let maxMag = 0
    for (let i = 0; i < N * N; i++) {
      mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i])
      if (mag[i] > maxMag) maxMag = mag[i]
    }

    // fftshift: move DC to center by swapping quadrants
    const half = N >> 1
    const shifted = new Float64Array(N * N)
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const sy = (y + half) % N
        const sx = (x + half) % N
        shifted[sy * N + sx] = mag[y * N + x]
      }
    }

    // Log scale
    const logMax = Math.log1p(maxMag)
    const logScaled = new Uint8Array(N * N)
    for (let i = 0; i < N * N; i++) {
      logScaled[i] = logMax > 0 ? Math.round((Math.log1p(shifted[i]) / logMax) * 255) : 0
    }

    // Detect cross signal: center row and col should have higher intensity in AI images
    let sumRow = 0, sumCol = 0, sumAll = 0
    for (let x = 0; x < N; x++) sumRow += logScaled[half * N + x]
    for (let y = 0; y < N; y++) sumCol += logScaled[y * N + half]
    for (let i = 0; i < N * N; i++) sumAll += logScaled[i]

    const meanRow = sumRow / N
    const meanCol = sumCol / N
    const meanAll = sumAll / (N * N)

    const crossSignal = meanAll > 0 ? (meanRow + meanCol) / (2 * meanAll) : 1
    // crossSignal > 1.5 → strong periodic artifact → AI
    const score = Math.min(100, Math.max(0, Math.round((crossSignal - 1) / 0.5 * 100)))

    // Build RGB spectrum image
    const rgbSpectrum = Buffer.alloc(N * N * 3)
    for (let i = 0; i < N * N; i++) {
      const [r, g, b] = spectralColormap(logScaled[i])
      rgbSpectrum[i * 3] = r
      rgbSpectrum[i * 3 + 1] = g
      rgbSpectrum[i * 3 + 2] = b
    }

    const fftImage = await sharp(rgbSpectrum, {
      raw: { width: N, height: N, channels: 3 },
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
