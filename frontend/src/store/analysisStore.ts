import { create } from 'zustand'
import { AnalysisResult } from '../types'

interface AnalysisStore {
  result: AnalysisResult | null
  isLoading: boolean
  error: string | null
  rateLimitReset: string | null
  remainingAnalyses: number | null
  setResult: (result: AnalysisResult) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setRateLimit: (resetAt: string) => void
  setRemaining: (n: number) => void
  reset: () => void
}

export const useAnalysisStore = create<AnalysisStore>((set) => ({
  result: null,
  isLoading: false,
  error: null,
  rateLimitReset: null,
  remainingAnalyses: null,
  setResult: (result) => set({ result, error: null, rateLimitReset: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setRateLimit: (resetAt) => set({ rateLimitReset: resetAt }),
  setRemaining: (n) => set({ remainingAnalyses: n }),
  reset: () => set({ result: null, error: null, rateLimitReset: null }),
}))
