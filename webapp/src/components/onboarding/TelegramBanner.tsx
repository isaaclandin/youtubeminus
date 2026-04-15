interface TelegramBannerProps {
  onSetup: () => void
}

export function TelegramBanner({ onSetup }: TelegramBannerProps) {
  return (
    <div className="bg-yellow-950 border border-yellow-800 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="text-yellow-400 text-base flex-shrink-0">⚠️</span>
        <p className="text-yellow-200 text-sm">
          Connect Telegram to activate your accountability system
        </p>
      </div>
      <button
        onClick={onSetup}
        className="flex-shrink-0 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-semibold rounded-lg transition-colors"
      >
        Connect
      </button>
    </div>
  )
}
