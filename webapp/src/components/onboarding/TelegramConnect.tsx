import { useTelegramConnection } from '../../hooks/useTelegramConnection'

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string

interface TelegramConnectProps {
  userId: string
  onConnected: () => void
}

export function TelegramConnect({ userId, onConnected }: TelegramConnectProps) {
  const { code, isConnected, justConnected, isGenerating, codeExpired, error, regenerate } =
    useTelegramConnection(userId)

  // Notify parent when connected
  if (isConnected && !justConnected) {
    onConnected()
  }

  const deepLink = code ? `https://t.me/${BOT_USERNAME}?start=${code}` : `https://t.me/${BOT_USERNAME}`

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-white font-semibold text-lg">Connect Telegram</h2>
        <p className="text-neutral-400 text-sm">
          You need a Telegram account to send and receive approval notifications.
          This takes about 30 seconds.
        </p>
      </div>

      {/* Success state */}
      {justConnected && (
        <div className="flex items-center gap-3 bg-green-950 border border-green-800 rounded-lg px-4 py-3">
          <span className="text-green-400 text-lg">✅</span>
          <p className="text-green-300 text-sm font-medium">Telegram connected! Setting up your dashboard…</p>
        </div>
      )}

      {!justConnected && (
        <>
          {/* Step 1 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
              <p className="text-white text-sm font-medium">Open the Telegram bot</p>
            </div>
            <a
              href={deepLink}
              target="_blank"
              rel="noreferrer"
              className="ml-8 inline-flex items-center gap-2 px-4 py-2.5 bg-[#2AABEE] hover:bg-[#229ED9] text-white rounded-lg text-sm font-medium transition-colors w-fit"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/>
              </svg>
              Open @{BOT_USERNAME}
            </a>
          </div>

          {/* Step 2 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
              <p className="text-white text-sm font-medium">Send your link code to the bot</p>
            </div>
            <div className="ml-8 flex flex-col gap-2">
              <p className="text-neutral-400 text-sm">
                When the bot opens, tap <strong className="text-white">Start</strong> or send this command:
              </p>
              {isGenerating ? (
                <div className="h-12 bg-neutral-800 rounded-lg animate-pulse" />
              ) : codeExpired ? (
                <div className="flex flex-col gap-2">
                  <div className="bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3">
                    <p className="text-neutral-500 text-sm">Code expired</p>
                  </div>
                  <button
                    onClick={regenerate}
                    className="text-red-400 hover:text-red-300 text-sm underline w-fit"
                  >
                    Generate new code
                  </button>
                </div>
              ) : code ? (
                <div className="flex flex-col gap-2">
                  <div className="bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 flex items-center justify-between">
                    <code className="text-white font-mono text-base tracking-widest">/start {code}</code>
                    <button
                      onClick={() => navigator.clipboard.writeText(`/start ${code}`)}
                      className="text-neutral-500 hover:text-white transition-colors ml-3 flex-shrink-0"
                      title="Copy"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-neutral-500 text-xs">
                    Code displayed prominently:{' '}
                    <span className="text-neutral-300 font-mono tracking-widest font-bold text-sm">{code}</span>
                    {' '}— expires in 15 minutes.{' '}
                    <button onClick={regenerate} className="text-red-400 hover:text-red-300 underline">
                      Regenerate
                    </button>
                  </p>
                </div>
              ) : null}
              {error && <p className="text-red-400 text-sm">{error}</p>}
            </div>
          </div>

          {/* Waiting indicator */}
          {code && !codeExpired && (
            <div className="flex items-center gap-3 ml-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <p className="text-neutral-500 text-sm">Waiting for connection…</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
