import express from 'express'
import cors from 'cors'
import { analyzeRouter } from './routes/analyze'
import { socialRouter } from './routes/social'
import { warmupTransformers } from './analyzers/transformers'

const app = express()
const PORT = Number(process.env.PORT || 3001)

const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'https://aidetect.pro',
  /\.netlify\.app$/,
]

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true) // allow server-to-server
    const allowed = allowedOrigins.some((o) =>
      typeof o === 'string' ? o === origin : o.test(origin)
    )
    callback(null, allowed)
  },
  credentials: true,
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// API routes
app.use('/api/analyze', analyzeRouter)
app.use('/api/social', socialRouter)

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' })
})

app.listen(PORT, () => {
  console.log(`AIDetect.pro backend running on port ${PORT}`)
  // Pre-load the local ViT model so it's ready before the first request.
  // Non-blocking — a failure here only means the analyzer will abstain.
  warmupTransformers()
})

export default app
