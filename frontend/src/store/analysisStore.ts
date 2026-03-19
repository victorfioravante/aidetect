import { create } from 'zustand'
import { AnalysisResult } from '../types'

export type LoadingStage = 'extracting' | 'analyzing' | null

interface AnalysisStore {
  result: AnalysisResult | null
  isLoading: boolean
  loadingStage: LoadingStage
  error: string | null
  rateLimitReset: string | null
  remainingAnalyses: number | null
  setResult: (result: AnalysisResult) => void
  setLoading: (loading: boolean) => void
  setLoadingStage: (stage: LoadingStage) => void
  setError: (error: string | null) => void
  setRateLimit: (resetAt: string) => void
  setRemaining: (n: number) => void
  reset: () => void
}

export const useAnalysisStore = create<AnalysisStore>((set) => ({
  result: null,
  isLoading: false,
  loadingStage: null,
  error: null,
  rateLimitReset: null,
  remainingAnalyses: null,
  setResult: (result) => set({ result, error: null, rateLimitReset: null, loadingStage: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setLoadingStage: (loadingStage) => set({ loadingStage }),
  setError: (error) => set({ error, loadingStage: null }),
  setRateLimit: (resetAt) => set({ rateLimitReset: resetAt, loadingStage: null }),
  setRemaining: (n) => set({ remainingAnalyses: n }),
  reset: () => set({ result: null, error: null, rateLimitReset: null, loadingStage: null }),
}))
