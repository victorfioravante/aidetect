import { useTranslation } from 'react-i18next'

export function Header() {
  const { t, i18n } = useTranslation()

  function toggleLang() {
    const next = i18n.language === 'pt' ? 'en' : 'pt'
    i18n.changeLanguage(next)
    localStorage.setItem('lang', next)
  }

  return (
    <header className="w-full border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-white font-bold text-sm">
            AI
          </div>
          <span className="text-white font-bold text-lg tracking-tight">{t('app.name')}</span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm text-gray-400">
          <a href="#how" className="hover:text-white transition-colors">{t('nav.howItWorks')}</a>
          <a href="#api" className="hover:text-white transition-colors">{t('nav.api')}</a>
        </nav>

        <button
          onClick={toggleLang}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-700 text-sm text-gray-300 hover:border-gray-500 hover:text-white transition-all"
        >
          <span className={i18n.language === 'pt' ? 'text-white font-medium' : 'text-gray-500'}>PT</span>
          <span className="text-gray-600">/</span>
          <span className={i18n.language === 'en' ? 'text-white font-medium' : 'text-gray-500'}>EN</span>
        </button>
      </div>
    </header>
  )
}
