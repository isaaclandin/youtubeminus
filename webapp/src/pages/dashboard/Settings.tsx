import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AccountSettings } from '../../components/settings/AccountSettings'
import { TelegramConnect } from '../../components/onboarding/TelegramConnect'
import { getProfile } from '../../lib/supabase'
import type { DashboardOutletContext } from './Layout'

type Tab = 'telegram' | 'account' | 'billing'

export function Settings() {
  const { profile, refetchRels } = useOutletContext<DashboardOutletContext>()
  const [tab, setTab] = useState<Tab>('telegram')
  const [localProfile, setLocalProfile] = useState(profile)
  const [showConnect, setShowConnect] = useState(false)

  async function handleTelegramConnected() {
    const refreshed = await getProfile(localProfile.id)
    if (refreshed) setLocalProfile(refreshed)
    setShowConnect(false)
    refetchRels()
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
      <div>
        <h1 className="text-white text-2xl font-bold">Settings</h1>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-neutral-800 gap-1">
        {(['telegram', 'account', 'billing'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'text-white border-red-600'
                : 'text-neutral-500 border-transparent hover:text-white'
            }`}
          >
            {t === 'telegram' ? 'Telegram' : t === 'account' ? 'Account' : 'Billing'}
          </button>
        ))}
      </div>

      {/* Telegram tab */}
      {tab === 'telegram' && (
        <div className="flex flex-col gap-4">
          {localProfile.telegram_chat_id ? (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                <div>
                  <p className="text-white text-sm font-medium">Telegram connected</p>
                  <p className="text-neutral-500 text-xs mt-0.5">Chat ID: {localProfile.telegram_chat_id}</p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setShowConnect(true)}
                  className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-lg text-xs font-medium transition-colors"
                >
                  Change account
                </button>
                <button
                  onClick={() => setShowConnect(true)}
                  className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-lg text-xs font-medium transition-colors"
                >
                  Reconnect
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-yellow-950/40 border border-yellow-800/50 rounded-xl px-4 py-3">
              <p className="text-yellow-400 text-sm font-medium">Telegram not connected</p>
              <p className="text-yellow-600 text-xs mt-1">
                Connect Telegram to receive approval notifications and send approvals from your phone.
              </p>
            </div>
          )}

          {(!localProfile.telegram_chat_id || showConnect) && (
            <TelegramConnect
              userId={localProfile.id}
              onConnected={handleTelegramConnected}
            />
          )}
        </div>
      )}

      {/* Account tab */}
      {tab === 'account' && (
        <AccountSettings
          profile={localProfile}
          onUpdate={p => setLocalProfile(p)}
        />
      )}

      {/* Billing tab */}
      {tab === 'billing' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-semibold">Free plan</p>
              <p className="text-neutral-500 text-sm mt-1">Unlimited requests, 1 accountability partner</p>
            </div>
            <span className="px-3 py-1 bg-neutral-800 text-neutral-400 rounded-full text-xs font-medium">Free</span>
          </div>
          <div className="border-t border-neutral-800 pt-4">
            <p className="text-neutral-500 text-xs">Billing is not yet configured. Check back soon.</p>
          </div>
        </div>
      )}
    </div>
  )
}
