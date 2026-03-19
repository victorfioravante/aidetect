import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useTranslation } from 'react-i18next'
import { useAnalysis } from '../hooks/useAnalysis'
import { useAnalysisStore } from '../store/analysisStore'
import { Lang } from '../types'

type Tab = 'upload' | 'link' | 'video'

const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024 // 50MB

export function InputTabs() {
  const { t, i18n } = useTranslation()
  const [activeTab, setActiveTab] = useState<Tab>('upload')
  const [linkValue, setLinkValue] = useState('')
  const { analyzeFile, analyzeUrl } = useAnalysis()
  const { isLoading, setError } = useAnalysisStore()
  const lang = (i18n.language as Lang) || 'pt'

  const onDrop = useCallback(async (accepted: File[], isVideo = false) => {
    const file = accepted[0]
    if (!file) return

    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE
    if (file.size > maxSize) {
      setError(isVideo ? 'errors.fileTooBig' : 'errors.fileTooBig')
      return
    }

    await analyzeFile(file, lang)
  }, [analyzeFile, lang, setError])

  const { getRootProps: getImageProps, getInputProps: getImageInput, isDragActive: isImageDrag } = useDropzone({
    onDrop: (f) => onDrop(f, false),
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif'] },
    multiple: false,
    disabled: isLoading,
  })

  const { getRootProps: getVideoProps, getInputProps: getVideoInput, isDragActive: isVideoDrag } = useDropzone({
    onDrop: (f) => onDrop(f, true),
    accept: { 'video/*': ['.mp4', '.mov', '.avi'] },
    multiple: false,
    disabled: isLoading,
  })

  async function handleLinkSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!linkValue.trim()) return
    await analyzeUrl(linkValue.trim(), lang)
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'upload', label: t('tabs.upload') },
    { key: 'link', label: t('tabs.link') },
    { key: 'video', label: t('tabs.video') },
  ]

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Tab bar */}
      <div className="flex border-b border-gray-800 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-6 py-3 text-sm font-medium transition-all border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'text-violet-400 border-violet-500'
                : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Upload tab */}
      {activeTab === 'upload' && (
        <div
          {...getImageProps()}
          className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
            isImageDrag
              ? 'border-violet-500 bg-violet-500/10'
              : 'border-gray-700 hover:border-gray-600 bg-gray-900/50'
          } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input {...getImageInput()} />
          <div className="text-5xl mb-4">🖼️</div>
          <p className="text-white font-medium mb-1">{t('upload.title')}</p>
          <p className="text-gray-500 text-sm mb-4">{t('upload.subtitle')}</p>
          <button
            type="button"
            className="px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg font-medium transition-colors"
            disabled={isLoading}
          >
            {isLoading ? t('analyze.analyzing') : t('upload.btn')}
          </button>
          <p className="text-gray-600 text-xs mt-3">{t('upload.formats')}</p>
        </div>
      )}

      {/* Link tab */}
      {activeTab === 'link' && (
        <form onSubmit={handleLinkSubmit} className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <div className="text-4xl mb-4 text-center">🔗</div>
            <div className="flex gap-3">
              <input
                type="url"
                value={linkValue}
                onChange={(e) => setLinkValue(e.target.value)}
                placeholder={t('link.placeholder')}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-violet-500 transition-colors"
                disabled={isLoading}
              />
              <button
                type="submit"
                className="px-5 py-3 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50"
                disabled={isLoading || !linkValue.trim()}
              >
                {isLoading ? t('analyze.analyzing') : t('link.btn')}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Video tab */}
      {activeTab === 'video' && (
        <div
          {...getVideoProps()}
          className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
            isVideoDrag
              ? 'border-cyan-500 bg-cyan-500/10'
              : 'border-gray-700 hover:border-gray-600 bg-gray-900/50'
          } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input {...getVideoInput()} />
          <div className="text-5xl mb-4">🎬</div>
          <p className="text-white font-medium mb-1">{t('video.title')}</p>
          <p className="text-gray-500 text-sm mb-4">{t('video.subtitle')}</p>
          <button
            type="button"
            className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg font-medium transition-colors"
            disabled={isLoading}
          >
            {isLoading ? t('analyze.analyzing') : t('video.btn')}
          </button>
          <p className="text-gray-600 text-xs mt-3">{t('video.formats')}</p>
        </div>
      )}
    </div>
  )
}
