// Telegram notification helpers.
// Called from background.js (via importScripts) — never directly from content.js.

const TELEGRAM = (() => {
  function api(method, body) {
    return fetch(`https://api.telegram.org/bot${YTM_CONFIG.telegramToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => { if (!r.ok) r.text().then(t => console.error('[TELEGRAM]', method, t)); });
  }

  // ── Partner: owner submitted a request ──────────────────────────────────────
  // escalation=false  → send only to primary
  // escalation=true   → send to all partners (15-min timer expired)
  async function notifyPartnerRequest({ chatId, requestId, videoTitle, videoThumbnail, reason, escalation }) {
    if (!chatId) return;

    const prefix = escalation
      ? '⏰ *Escalation: still waiting for approval*\n\n'
      : '🎬 *New video request*\n\n';

    const caption =
      `${prefix}*${videoTitle}*\n\n` +
      `_${reason}_`;

    const reply_markup = {
      inline_keyboard: [
        [
          { text: '✓ 1 day',  callback_data: `approve:${requestId}:1_day`  },
          { text: '✓ 1 week', callback_data: `approve:${requestId}:1_week` },
        ],
        [
          { text: '✗ Deny',   callback_data: `deny:${requestId}`           },
        ],
      ],
    };

    if (videoThumbnail) {
      return api('sendPhoto', {
        chat_id:      chatId,
        photo:        videoThumbnail,
        caption,
        parse_mode:   'Markdown',
        reply_markup,
      });
    }

    return api('sendMessage', {
      chat_id:      chatId,
      text:         caption,
      parse_mode:   'Markdown',
      reply_markup,
    });
  }

  // ── Owner: request approved ──────────────────────────────────────────────────
  async function notifyOwnerApproved({ ownerChatId, videoTitle, durationLabel, expiresAt }) {
    if (!ownerChatId) return;
    const expiry = new Date(expiresAt).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
    return api('sendMessage', {
      chat_id:    ownerChatId,
      text:       `✅ *Request approved*\n\n*${videoTitle}*\nDuration: ${durationLabel}\nExpires: ${expiry}`,
      parse_mode: 'Markdown',
    });
  }

  // ── Owner: request denied ────────────────────────────────────────────────────
  async function notifyOwnerDenied({ ownerChatId, videoTitle }) {
    if (!ownerChatId) return;
    return api('sendMessage', {
      chat_id:    ownerChatId,
      text:       `🚫 *Request denied*\n\n*${videoTitle}*`,
      parse_mode: 'Markdown',
    });
  }

  // ── Owner: 15-minute expiry warning ─────────────────────────────────────────
  async function notifyOwnerExpiryWarning({ ownerChatId, videoTitle }) {
    if (!ownerChatId) return;
    return api('sendMessage', {
      chat_id:    ownerChatId,
      text:       `⏳ *15 minutes remaining*\n\n*${videoTitle}*`,
      parse_mode: 'Markdown',
    });
  }

  // Deprecated aliases — kept for backward compat with background.js
  const notifyJennaRequest    = (args) => notifyPartnerRequest(args);
  const notifyIsaacApproved   = ({ videoTitle, durationLabel, expiresAt }) =>
    notifyOwnerApproved({ ownerChatId: YTM_CONFIG.isaacChatId, videoTitle, durationLabel, expiresAt });
  const notifyIsaacDenied     = ({ videoTitle }) =>
    notifyOwnerDenied({ ownerChatId: YTM_CONFIG.isaacChatId, videoTitle });
  const notifyIsaacExpiryWarning = ({ videoTitle }) =>
    notifyOwnerExpiryWarning({ ownerChatId: YTM_CONFIG.isaacChatId, videoTitle });

  return {
    notifyPartnerRequest,
    notifyOwnerApproved,
    notifyOwnerDenied,
    notifyOwnerExpiryWarning,
    // Legacy
    notifyJennaRequest,
    notifyIsaacApproved,
    notifyIsaacDenied,
    notifyIsaacExpiryWarning,
  };
})();
