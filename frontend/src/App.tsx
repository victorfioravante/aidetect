import './i18n'
import { useTranslation } from 'react-i18next'
import { Header } from './components/Header'
import { InputTabs } from './components/InputTabs'
import { ResultPanel } from './components/ResultPanel'
import { RateLimitModal } from './components/RateLimitModal'
import { AdSlot } from './components/AdSlot'
import { useAnalysisStore } from './store/analysisStore'

export default function App() {
  const { t } = useTranslation()
  const { error, isLoading } = useAnalysisStore()
  const adBanner = import.meta.env.VITE_ADSENSE_SLOT_BANNER

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-block mb-4 px-4 py-1.5 bg-violet-500/10 border border-violet-500/30 rounded-full text-violet-400 text-sm font-medium">
            {t('hero.badge')}
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-white mb-4 leading-tight">
            {t('hero.title')}
          </h1>
          <p className="text-gray-400 text-lg max-w-xl mx-auto">{t('hero.subtitle')}</p>
        </div>

        {/* Input */}
        <InputTabs />

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center items-center mt-10 gap-3">
            <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-400">{t('analyze.analyzing')}</span>
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="mt-6 max-w-2xl mx-auto bg-red-900/20 border border-red-700/50 rounded-xl p-4 text-center text-red-400 text-sm">
            {t(error) || error}
          </div>
        )}

        {/* Results */}
        <ResultPanel />
      </main>

      {/* Footer Ad */}
      <footer className="border-t border-gray-800 mt-16 py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col items-center gap-4">
          <AdSlot slot={adBanner} format="leaderboard" />
          <p className="text-gray-600 text-xs">© 2025 AIDetect.pro — {t('app.tagline')}</p>
        </div>
      </footer>

      <RateLimitModal />
    </div>
  )
}
