import path from 'path'
import os from 'os'
import sharp from 'sharp'
import { DetectorResult } from '../types'

// Model: Organika/sdxl-detector — ViT fine-tuned to detect AI-generated images
// Weights cached in tmp on first run (~500MB download). On Railway, use a persistent
// volume mounted at /cache for production to avoid re-downloading on each deploy.
const MODEL_ID = 'Organika/sdxl-detector'
const CACHE_DIR = process.env.HF_CACHE_DIR || path.join(os.tmpdir(), 'aidetect-hf-cache')

// Singleton — pipeline is expensive to load; reuse across requests
type HFPipeline = (input: string) => Promise<Array<{ label: string; score: number }>>
let classifier: HFPipeline | null = null
let loadError: string | null = null

async function getClassifier(): Promise<HFPipeline> {
  if (loadError) throw new Error(loadError)
  if (classifier) return classifier

  // Dynamic import — @huggingface/transformers is ESM, works fine with tsx / Node 20
  const { pipeline, env } = await import('@huggingface/transformers')

  env.cacheDir = CACHE_DIR
  // Disable telemetry in production
  env.useBrowserCache = false

  classifier = await pipeline('image-classification', MODEL_ID, {
    device: 'cpu' as never,
  }) as HFPipeline

  return classifier
}

// Label patterns that indicate AI-generated content
const AI_LABEL_PATTERNS = /ai.?gen|artificial|fake|sdxl|synthetic|generated/i

function extractAiScore(results: Array<{ label: string; score: number }>): number {
  if (!results?.length) return 0

  // Try to find an explicit AI/artificial label
  const aiEntry = results.find((r) => AI_LABEL_PATTERNS.test(r.label))
  if (aiEntry) return aiEntry.score

  // Fallback: if labels are binary (e.g. label_0 / label_1), use the higher-score entry
  // This avoids silent misclassification when label names are opaque
  const sorted = [...results].sort((a, b) => b.score - a.score)
  return sorted[0]?.score ?? 0
}

/**
 * Transformers.js AI-image detector
 * Runs entirely locally — no API key required.
 * First call downloads the model (~500MB); subsequent calls use the cache.
 */
export async function transformersAnalyzer(buffer: Buffer, lang: string): Promise<DetectorResult> {
  try {
    const classify = await getClassifier()

    // Resize to 224×224 (ViT expected size) and encode as JPEG for the pipeline
    const resized = await sharp(buffer)
      .resize(224, 224, { fit: 'cover' })
      .jpeg({ quality: 90 })
      .toBuffer()

    const dataUrl = `data:image/jpeg;base64,${resized.toString('base64')}`
    const results = await classify(dataUrl)

    const aiScore = extractAiScore(results)
    const score = Math.round(aiScore * 100)

    const topLabel = results[0]?.label ?? ''

    const label = lang === 'en'
      ? score >= 70
        ? `AI-generated detected (${topLabel})`
        : score >= 40
        ? `Suspicious patterns (${topLabel})`
        : 'Likely authentic (local model)'
      : score >= 70
      ? `IA detectada pelo modelo local (${topLabel})`
      : score >= 40
      ? `Padrões suspeitos (${topLabel})`
      : 'Provavelmente autêntico (modelo local)'

    return { score, label, passed: score < 50 }
  } catch {
    // Model not yet downloaded or load failed → signal abstained so caller applies heuristic
    loadError = null // allow retry on next request
    classifier = null

    return {
      score: 0,
      label: lang === 'en' ? 'Local model unavailable' : 'Modelo local indisponível',
      passed: true,
      abstained: true,
    }
  }
}
