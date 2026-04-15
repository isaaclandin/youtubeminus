const BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN as string

export async function sendMessage(chatId: string, text: string, extra?: object): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra }),
    })
  } catch (err) {
    console.warn('Telegram sendMessage failed:', err)
  }
}

export async function notifyAll(chatIds: string[], text: string, extra?: object): Promise<void> {
  await Promise.all(chatIds.map((id) => sendMessage(id, text, extra)))
}

export async function notifyPartnersNewRequest(
  partnerChatIds: string[],
  ownerName: string,
  videoTitle: string,
  reason: string,
  requestId: string,
): Promise<void> {
  if (!partnerChatIds.length) return
  const text = `🎬 <b>${ownerName}</b> wants to watch:\n<b>${videoTitle}</b>\n\n💬 Reason: ${reason}`
  const inline_keyboard = [
    [
      { text: '✅ This video', callback_data: `approve:${requestId}:video_only` },
      { text: '⏱ 30 min', callback_data: `approve:${requestId}:30_minutes` },
    ],
    [
      { text: '⏰ 2 hours', callback_data: `approve:${requestId}:2_hours` },
      { text: '📅 Today', callback_data: `approve:${requestId}:today_only` },
    ],
    [{ text: '❌ Deny', callback_data: `deny:${requestId}` }],
  ]
  await notifyAll(partnerChatIds, text, { reply_markup: { inline_keyboard } })
}

export async function notifyOwnerApproved(
  ownerChatId: string,
  partnerName: string,
  videoTitle: string,
  durationLabel: string,
  expiresAt: string,
): Promise<void> {
  if (!ownerChatId) return
  const expires = new Date(expiresAt).toLocaleTimeString()
  const text = `✅ <b>${partnerName}</b> approved <b>${videoTitle}</b>\nDuration: ${durationLabel}\nExpires: ${expires}`
  await sendMessage(ownerChatId, text)
}

export async function notifyOwnerDenied(
  ownerChatId: string,
  partnerName: string,
  videoTitle: string,
): Promise<void> {
  if (!ownerChatId) return
  const text = `❌ <b>${partnerName}</b> denied your request for <b>${videoTitle}</b>\nAnother partner may still approve within 5 minutes.`
  await sendMessage(ownerChatId, text)
}

export async function notifyOwnerDenialOverride(ownerChatId: string, videoTitle: string): Promise<void> {
  if (!ownerChatId) return
  const text = `✅ Another partner approved <b>${videoTitle}</b> after the initial denial.`
  await sendMessage(ownerChatId, text)
}

export async function notifyPartnerDenied(partnerChatId: string, videoTitle: string): Promise<void> {
  if (!partnerChatId) return
  const text = `ℹ️ Your denial of <b>${videoTitle}</b> was overridden by another partner.`
  await sendMessage(partnerChatId, text)
}

export async function notifyBothRelationshipEstablished(
  ownerChatId: string | undefined,
  partnerChatId: string | undefined,
  ownerName: string,
  partnerName: string,
): Promise<void> {
  const promises: Promise<void>[] = []
  if (ownerChatId) {
    promises.push(sendMessage(ownerChatId, `🤝 <b>${partnerName}</b> is now your accountability partner!`))
  }
  if (partnerChatId) {
    promises.push(sendMessage(partnerChatId, `🤝 You are now an accountability partner for <b>${ownerName}</b>!`))
  }
  await Promise.all(promises)
}

export async function notifyBothRelationshipDissolved(
  ownerChatId: string | undefined,
  partnerChatId: string | undefined,
  ownerName: string,
  partnerName: string,
): Promise<void> {
  const promises: Promise<void>[] = []
  if (ownerChatId) {
    promises.push(sendMessage(ownerChatId, `💔 <b>${partnerName}</b> has dissolved your accountability partnership.`))
  }
  if (partnerChatId) {
    promises.push(sendMessage(partnerChatId, `💔 You have dissolved your partnership with <b>${ownerName}</b>.`))
  }
  await Promise.all(promises)
}

export async function notifyPartnersUninstallAttempt(
  partnerChatIds: string[],
  ownerName: string,
  code: string,
  expiresMinutes: number,
): Promise<void> {
  if (!partnerChatIds.length) return
  const text = `⚠️ <b>${ownerName}</b> is attempting to uninstall YouTubeMinus!\nApproval code: <code>${code}</code>\nExpires in ${expiresMinutes} minutes.`
  await notifyAll(partnerChatIds, text)
}

export async function notifyOwnerPartnerRequest(
  ownerChatId: string | undefined,
  partnerName: string,
  videoTitle: string,
  reason: string,
  requestId: string,
): Promise<void> {
  if (!ownerChatId) return
  const text = `🎬 Your partner <b>${partnerName}</b> wants to watch:\n<b>${videoTitle}</b>\n\n💬 Reason: ${reason}\nRequest ID: ${requestId}`
  await sendMessage(ownerChatId, text)
}

export async function notifyPartnerRequestApproved(
  partnerChatId: string | undefined,
  videoTitle: string,
  durationLabel: string,
): Promise<void> {
  if (!partnerChatId) return
  const text = `✅ Your request for <b>${videoTitle}</b> was approved!\nDuration: ${durationLabel}`
  await sendMessage(partnerChatId, text)
}

export async function notifyPartnerRequestDenied(
  partnerChatId: string | undefined,
  videoTitle: string,
): Promise<void> {
  if (!partnerChatId) return
  const text = `❌ Your request for <b>${videoTitle}</b> was denied.`
  await sendMessage(partnerChatId, text)
}
