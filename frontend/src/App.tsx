import './i18n'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Header } from './components/Header'
import { InputTabs } from './components/InputTabs'
import { ResultPanel } from './components/ResultPanel'
import { RateLimitModal } from './components/RateLimitModal'
import { AdSlot } from './components/AdSlot'
import { useAnalysisStore } from './store/analysisStore'

// Loading stage keys shown in sequence during analysis.
// The timings are cosmetic — they give the user a sense of progress
// regardless of which internal step the backend is actually on.
const LOADING_STEPS = ['loading.receive', 'loading.process', 'loading.score'] as const

function LoadingIndicator() {
  const { t } = useTranslation()
  const loadingStage = useAnalysisStore((s) => s.loadingStage)
  const [step, setStep] = useState(0)

  useEffect(() => {
    setStep(0)
    const t1 = setTimeout(() => setStep(1), 2500)
    const t2 = setTimeout(() => setStep(2), 6000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [loadingStage])

  // For social URL extraction, show the extract label immediately
  const displayStep = loadingStage === 'extracting' ? 'loading.extract' : LOADING_STEPS[step]

  return (
    <div className="flex flex-col items-center gap-4 mt-10">
      {/* Step pills */}
      <div className="flex items-center gap-2">
        {LOADING_STEPS.map((_, i) => (
          <div
            key={i}
            className={`rounded-full transition-all duration-500 h-1.5 ${
              i < step  ? 'w-8 bg-violet-500' :
              i === step ? 'w-8 bg-violet-500/60' :
              'w-2 bg-gray-700'
            }`}
          />
        ))}
      </div>
      {/* Animated step label */}
      <div className="flex items-center gap-3 h-6">
        <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin flex-none" />
        <AnimatePresence mode="wait">
          <motion.span
            key={displayStep}
            className="text-gray-400 text-sm"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            {t(displayStep)}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  )
}

export default function App() {
  const { t } = useTranslation()
  const { error, isLoading, reset } = useAnalysisStore()
  const adBanner = import.meta.env.VITE_ADSENSE_SLOT_BANNER

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-12">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-block mb-4 px-4 py-1.5 bg-violet-500/10 border border-violet-500/30 rounded-full text-violet-400 text-sm font-medium">
            {t('hero.badge')}
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-white mb-4 leading-tight">
            {t('hero.title')}
          </h1>
          <p className="text-gray-400 text-lg max-w-xl mx-auto mb-4">{t('hero.subtitle')}</p>
          {/* Trust badge */}
          <p className="text-gray-600 text-xs">🔒 {t('trust.badge')}</p>
        </div>

        {/* Input */}
        <InputTabs />

        {/* Loading */}
        {isLoading && <LoadingIndicator />}

        {/* Error */}
        {error && !isLoading && (
          <div className="mt-6 max-w-2xl mx-auto bg-red-950/40 border border-red-800/50 rounded-xl p-5">
            <div className="flex items-start gap-3 mb-4">
              <span className="text-red-400 text-lg flex-none mt-0.5">⚠️</span>
              <div>
                <p className="text-red-300 text-sm font-medium">{t(error) || error}</p>
                <p className="text-gray-500 text-xs mt-1">{t('errors.tryAgainHint')}</p>
              </div>
            </div>
            <button
              onClick={reset}
              className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg font-medium transition-colors border border-gray-700"
            >
              {t('errors.tryAgain')}
            </button>
          </div>
        )}

        {/* Results */}
        <ResultPanel />
      </main>

      {/* How it works */}
      <section id="how" className="border-t border-gray-800/60 mt-8 py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-white text-2xl font-bold text-center mb-10">{t('how.title')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {(['step1', 'step2', 'step3'] as const).map((step) => (
              <div key={step} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
                <div className="text-4xl mb-4">{t(`how.${step}.icon`)}</div>
                <h3 className="text-white font-semibold mb-2">{t(`how.${step}.title`)}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{t(`how.${step}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col items-center gap-4">
          <AdSlot slot={adBanner} format="leaderboard" />
          <p className="text-gray-600 text-xs">© 2025 AIDetect.pro — {t('app.tagline')}</p>
        </div>
      </footer>

      <RateLimitModal />
    </div>
  )
}
