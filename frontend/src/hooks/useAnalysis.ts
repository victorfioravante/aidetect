import axios, { AxiosError } from 'axios'
import { useAnalysisStore } from '../store/analysisStore'
import { AnalysisResult, RateLimitError } from '../types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

interface ApiSuccess {
  success: true
  data: AnalysisResult
}

interface ApiError {
  success: false
  error: string
  code?: string
}

type ApiResponse = ApiSuccess | ApiError | RateLimitError

export function useAnalysis() {
  const { setResult, setLoading, setError, setRateLimit, setRemaining } = useAnalysisStore()

  async function analyzeFile(file: File, lang: 'pt' | 'en' = 'pt') {
    setLoading(true)
    setError(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('lang', lang)

    try {
      const res = await axios.post<ApiResponse>(`${API_URL}/api/analyze`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      const data = res.data
      if (data.success) {
        const remaining = res.headers['x-ratelimit-remaining']
        if (remaining !== undefined) setRemaining(Number(remaining))
        setResult((data as ApiSuccess).data)
      } else {
        setError((data as ApiError).error)
      }
    } catch (err) {
      const axiosErr = err as AxiosError<RateLimitError | ApiError>
      if (axiosErr.response?.status === 429) {
        const body = axiosErr.response.data as RateLimitError
        setRateLimit(body.resetAt)
      } else {
        setError('networkError')
      }
    } finally {
      setLoading(false)
    }
  }

  async function analyzeUrl(url: string, lang: 'pt' | 'en' = 'pt') {
    setLoading(true)
    setError(null)

    const formData = new FormData()
    formData.append('url', url)
    formData.append('lang', lang)

    try {
      const res = await axios.post<ApiResponse>(`${API_URL}/api/analyze`, formData)
      const data = res.data
      if (data.success) {
        setResult((data as ApiSuccess).data)
      } else {
        setError((data as ApiError).error)
      }
    } catch (err) {
      const axiosErr = err as AxiosError<RateLimitError | ApiError>
      if (axiosErr.response?.status === 429) {
        const body = axiosErr.response.data as RateLimitError
        setRateLimit(body.resetAt)
      } else {
        setError('networkError')
      }
    } finally {
      setLoading(false)
    }
  }

  return { analyzeFile, analyzeUrl }
}
