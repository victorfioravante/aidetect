import path from 'path'
import os from 'os'
import sharp from 'sharp'
import { DetectorResult } from '../types'

// Model: onnx-community/Deep-Fake-Detector-v2-Model-ONNX
// ViT-base fine-tuned for AI vs real image classification.
// Has pre-converted ONNX files → works with @huggingface/transformers v3.
// Pre-downloaded during Docker build (scripts/download-model.mjs) so the
// first request never blocks waiting for a ~85MB download.
const MODEL_ID  = 'onnx-community/Deep-Fake-Detector-v2-Model-ONNX'
const CACHE_DIR = process.env.HF_CACHE_DIR || path.join(os.tmpdir(), 'aidetect-hf-cache')

// Output labels for this model:
//   "Deepfake"  → AI-generated / manipulated
//   "Realism"   → authentic / real
const FAKE_LABEL_RE = /deepfake|fake|ai.?gen|artificial|synthetic|generated/i

type HFPipeline = (
  input: string,
  opts?: Record<string, unknown>,
) => Promise<Array<{ label: string; score: number }>>

// Singleton — pipeline is expensive to load; reuse across requests.
// loadPromise prevents concurrent load attempts (concurrent requests arriving
// before the model is ready would each try to download/initialize otherwise).
let classifier: HFPipeline | null = null
let loadPromise: Promise<HFPipeline> | null = null
let permanentlyFailed = false

async function loadClassifier(): Promise<HFPipeline> {
  const { pipeline, env } = await import('@huggingface/transformers')

  env.cacheDir       = CACHE_DIR
  env.useBrowserCache = false

  const pipe = await pipeline('image-classification', MODEL_ID, {
    device: 'cpu' as never,
    // int8 quantization: ~85 MB on disk, ~120 MB in RAM — fits Railway's free tier.
    // Same accuracy as fp32 for binary classification at this model size.
    dtype: 'int8' as never,
  })

  return pipe as HFPipeline
}

async function getClassifier(): Promise<HFPipeline> {
  if (classifier) return classifier

  // Previous load permanently failed (model not found, incompatible format)
  if (permanentlyFailed) throw new Error('model permanently unavailable')

  // Deduplicate concurrent load attempts into a single Promise
  if (!loadPromise) {
    loadPromise = loadClassifier()
      .then((pipe) => {
        classifier = pipe
        loadPromise = null
        console.log('[transformers] Model loaded successfully')
        return pipe
      })
      .catch((err) => {
        loadPromise = null
        // Mark permanent failure only for definitive errors, not transient ones
        const msg = String(err?.message ?? '').toLowerCase()
        if (msg.includes('not found') || msg.includes('404') || msg.includes('invalid')) {
          permanentlyFailed = true
        }
        throw err
      })
  }

  return loadPromise
}

// Called once at server startup to warm up the model before any request arrives.
// Non-blocking — errors are logged but do not crash the server.
export async function warmupTransformers(): Promise<void> {
  try {
    await getClassifier()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[transformers] Warmup failed (model will be unavailable):', msg)
  }
}

/**
 * Transformers.js AI-image detector
 * Runs entirely locally — no API key required.
 * Model is pre-downloaded during Docker build; cached in CACHE_DIR.
 */
export async function transformersAnalyzer(buffer: Buffer, lang: string): Promise<DetectorResult> {
  try {
    const classify = await getClassifier()

    // Resize to 224×224 (ViT expected input) and encode as JPEG
    const resized = await sharp(buffer)
      .resize(224, 224, { fit: 'cover' })
      .jpeg({ quality: 90 })
      .toBuffer()

    const dataUrl = `data:image/jpeg;base64,${resized.toString('base64')}`
    const results = await classify(dataUrl)

    // Find the AI/Deepfake label — its score is directly the AI probability
    const fakeEntry = results.find((r) => FAKE_LABEL_RE.test(r.label))
    const aiScore   = fakeEntry?.score ?? (1 - (results[0]?.score ?? 0.5))
    const score     = Math.round(aiScore * 100)

    const topLabel = fakeEntry?.label ?? results[0]?.label ?? ''

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
    return {
      score:    0,
      label:    lang === 'en' ? 'Local model unavailable' : 'Modelo local indisponível',
      passed:   true,
      abstained: true,
    }
  }
}
