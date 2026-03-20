import sharp from 'sharp'
import { DetectorResult } from '../types'

const VIZ_SIZE = 192 // divisible by 3 for 3x3 grid

/**
 * Shadow Consistency Analysis
 * AI images often have inconsistent light direction across regions.
 * Estimates gradient direction in a 3x3 grid and generates an overlay visualization.
 */
export async function shadowAnalyzer(buffer: Buffer, lang: string): Promise<{
  result: DetectorResult
  shadowViz: string
}> {
  try {
    const { data, info } = await sharp(buffer)
      .greyscale()
      .resize({ width: 128, height: 128, fit: 'cover' })
      .raw()
      .toBuffer({ resolveWithObject: true })

    const { width, height } = info

    // Compute dominant gradient direction per 3x3 quadrant grid
    const cellW = Math.floor(width / 3)
    const cellH = Math.floor(height / 3)
    const angles: number[] = []

    for (let gy = 0; gy < 3; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        const startX = gx * cellW
        const startY = gy * cellH
        let sumGx = 0
        let sumGy = 0

        for (let y = startY + 1; y < startY + cellH - 1; y++) {
          for (let x = startX + 1; x < startX + cellW - 1; x++) {
            const idx = y * width + x
            const gxVal = data[idx + 1] - data[idx - 1]
            const gyVal = data[idx + width] - data[idx - width]
            sumGx += gxVal
            sumGy += gyVal
          }
        }

        angles.push(Math.atan2(sumGy, sumGx))
      }
    }

    // Dominant direction via circular mean
    const sinMean = angles.reduce((s, a) => s + Math.sin(a), 0) / angles.length
    const cosMean = angles.reduce((s, a) => s + Math.cos(a), 0) / angles.length
    const dominantAngle = Math.atan2(sinMean, cosMean)
    const R = Math.sqrt(sinMean ** 2 + cosMean ** 2)
    const angularVariance = 1 - R

    // Compute global pixel stddev to detect high-contrast scenes.
    // High-contrast real photos (bright window + dark room, stage lighting, etc.)
    // naturally produce inconsistent gradient directions across regions —
    // they should NOT be flagged as AI. Cap shadow score at 70 for such scenes.
    const pixelCount = data.length
    const pixelMean = (data as unknown as number[]).reduce((s: number, v: number) => s + v, 0) / pixelCount
    const pixelVar = (data as unknown as number[]).reduce((s: number, v: number) => s + (v - pixelMean) ** 2, 0) / pixelCount
    const pixelStdDev = Math.sqrt(pixelVar)
    const isHighContrast = pixelStdDev > 80

    // High variance → inconsistent lighting → likely AI
    const rawShadowScore = Math.min(100, Math.round(angularVariance * 100 * 1.5))
    const score = isHighContrast ? Math.min(rawShadowScore, 70) : rawShadowScore

    // --- Build visualization ---
    // Greyscale thumbnail at VIZ_SIZE
    const { data: greyData } = await sharp(buffer)
      .greyscale()
      .resize(VIZ_SIZE, VIZ_SIZE, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true })

    // Convert grey to RGBA
    const rgba = new Uint8Array(VIZ_SIZE * VIZ_SIZE * 4)
    for (let i = 0; i < VIZ_SIZE * VIZ_SIZE; i++) {
      rgba[i * 4] = greyData[i]
      rgba[i * 4 + 1] = greyData[i]
      rgba[i * 4 + 2] = greyData[i]
      rgba[i * 4 + 3] = 255
    }

    // Draw arrows for each of the 9 cells
    const vizCellW = VIZ_SIZE / 3
    const vizCellH = VIZ_SIZE / 3
    const arrowLen = 24

    for (let gy = 0; gy < 3; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        const angle = angles[gy * 3 + gx]
        const angleDiff = Math.abs(circularDiff(angle, dominantAngle))
        // Green if within 45°, red if inconsistent
        const [ar, ag, ab] = angleDiff < Math.PI / 4 ? [0, 220, 80] : [220, 40, 40]

        const cx = Math.round((gx + 0.5) * vizCellW)
        const cy = Math.round((gy + 0.5) * vizCellH)
        const dx = Math.cos(angle)
        const dy = Math.sin(angle)

        const x0 = Math.round(cx - dx * arrowLen / 2)
        const y0 = Math.round(cy - dy * arrowLen / 2)
        const x1 = Math.round(cx + dx * arrowLen / 2)
        const y1 = Math.round(cy + dy * arrowLen / 2)

        drawLine(rgba, VIZ_SIZE, VIZ_SIZE, x0, y0, x1, y1, ar, ag, ab, 2)
        drawArrowHead(rgba, VIZ_SIZE, VIZ_SIZE, x1, y1, angle, 8, ar, ag, ab)
      }
    }

    // Draw grid lines
    for (let i = 1; i < 3; i++) {
      const xLine = Math.round(i * vizCellW)
      const yLine = Math.round(i * vizCellH)
      drawLine(rgba, VIZ_SIZE, VIZ_SIZE, xLine, 0, xLine, VIZ_SIZE - 1, 80, 80, 80, 1)
      drawLine(rgba, VIZ_SIZE, VIZ_SIZE, 0, yLine, VIZ_SIZE - 1, yLine, 80, 80, 80, 1)
    }

    const vizImage = await sharp(Buffer.from(rgba.buffer), {
      raw: { width: VIZ_SIZE, height: VIZ_SIZE, channels: 4 },
    }).png().toBuffer()

    const shadowViz = vizImage.toString('base64')

    const label = lang === 'en'
      ? score >= 70
        ? 'Inconsistent lighting direction indicates AI generation'
        : score >= 40
        ? 'Some lighting inconsistencies detected'
        : 'Consistent lighting direction'
      : score >= 70
      ? 'Direção de iluminação inconsistente indica geração por IA'
      : score >= 40
      ? 'Algumas inconsistências de iluminação detectadas'
      : 'Direção de iluminação consistente'

    return { result: { score, label, passed: score < 50 }, shadowViz }
  } catch {
    return {
      result: {
        score: 0,
        label: lang === 'en' ? 'Shadow analysis failed' : 'Análise de sombras falhou',
        passed: true,
      },
      shadowViz: '',
    }
  }
}

function circularDiff(a: number, b: number): number {
  let d = a - b
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return d
}

function drawPixel(buf: Uint8Array, w: number, h: number, x: number, y: number, r: number, g: number, b: number) {
  if (x < 0 || x >= w || y < 0 || y >= h) return
  const idx = (y * w + x) * 4
  buf[idx] = r
  buf[idx + 1] = g
  buf[idx + 2] = b
  buf[idx + 3] = 255
}

function drawLine(buf: Uint8Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, thickness: number) {
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  let cx = x0, cy = y0
  while (true) {
    for (let oy = -thickness; oy <= thickness; oy++) {
      for (let ox = -thickness; ox <= thickness; ox++) {
        drawPixel(buf, w, h, cx + ox, cy + oy, r, g, b)
      }
    }
    if (cx === x1 && cy === y1) break
    const e2 = 2 * err
    if (e2 > -dy) { err -= dy; cx += sx }
    if (e2 < dx) { err += dx; cy += sy }
  }
}

function drawArrowHead(buf: Uint8Array, w: number, h: number, tipX: number, tipY: number, angle: number, size: number, r: number, g: number, b: number) {
  const a1 = angle + (2.5) // ~143°
  const a2 = angle - (2.5)
  const bx1 = Math.round(tipX + size * Math.cos(a1))
  const by1 = Math.round(tipY + size * Math.sin(a1))
  const bx2 = Math.round(tipX + size * Math.cos(a2))
  const by2 = Math.round(tipY + size * Math.sin(a2))
  drawLine(buf, w, h, tipX, tipY, bx1, by1, r, g, b, 1)
  drawLine(buf, w, h, tipX, tipY, bx2, by2, r, g, b, 1)
}
