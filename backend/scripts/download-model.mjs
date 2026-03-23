#!/usr/bin/env node
/**
 * Pre-downloads the AI detection model during Docker build.
 * Avoids a ~85MB download on the first production request.
 *
 * Usage (Dockerfile):
 *   ENV HF_CACHE_DIR=/app/models
 *   RUN node scripts/download-model.mjs
 */

import { pipeline, env } from '@huggingface/transformers'

const MODEL_ID  = 'onnx-community/Deep-Fake-Detector-v2-Model-ONNX'
const CACHE_DIR = process.env.HF_CACHE_DIR || '/app/models'

env.cacheDir        = CACHE_DIR
env.useBrowserCache = false

console.log(`[download-model] Downloading ${MODEL_ID} to ${CACHE_DIR} ...`)

try {
  await pipeline('image-classification', MODEL_ID, {
    device: 'cpu',
    dtype:  'int8',
  })
  console.log('[download-model] Model ready.')
  process.exit(0)
} catch (err) {
  // Non-fatal: if the download fails here (e.g., no network during build),
  // the model will be downloaded at first request in production.
  console.warn('[download-model] Download failed (will retry at runtime):', err?.message ?? err)
  process.exit(0)
}
