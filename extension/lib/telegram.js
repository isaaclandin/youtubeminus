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

  // ── Partner: Isaac submitted a request ──────────────────────────────────────
  async function notifyJennaRequest({ chatId, requestId, videoTitle, videoThumbnail, reason }) {
    if (!chatId) return;

    const caption =
      `🎬 *Isaac wants to watch a video*\n\n` +
      `*${videoTitle}*\n\n` +
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

    // Send thumbnail as photo with caption + buttons
    if (videoThumbnail) {
      return api('sendPhoto', {
        chat_id:      chatId,
        photo:        videoThumbnail,
        caption,
        parse_mode:   'Markdown',
        reply_markup,
      });
    }

    // Fallback: text only
    return api('sendMessage', {
      chat_id:      chatId,
      text:         caption,
      parse_mode:   'Markdown',
      reply_markup,
    });
  }

  // ── Isaac: request approved ──────────────────────────────────────────────────
  async function notifyIsaacApproved({ videoTitle, durationLabel, expiresAt }) {
    const expiry = new Date(expiresAt).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
    return api('sendMessage', {
      chat_id:    YTM_CONFIG.isaacChatId,
      text:       `✅ *Request approved*\n\n*${videoTitle}*\nDuration: ${durationLabel}\nExpires: ${expiry}`,
      parse_mode: 'Markdown',
    });
  }

  // ── Isaac: request denied ────────────────────────────────────────────────────
  async function notifyIsaacDenied({ videoTitle }) {
    return api('sendMessage', {
      chat_id:    YTM_CONFIG.isaacChatId,
      text:       `🚫 *Request denied*\n\n*${videoTitle}*`,
      parse_mode: 'Markdown',
    });
  }

  // ── Isaac: 15-minute expiry warning ─────────────────────────────────────────
  async function notifyIsaacExpiryWarning({ videoTitle }) {
    return api('sendMessage', {
      chat_id:    YTM_CONFIG.isaacChatId,
      text:       `⏳ *15 minutes remaining*\n\n*${videoTitle}*`,
      parse_mode: 'Markdown',
    });
  }

  return {
    notifyJennaRequest,
    notifyIsaacApproved,
    notifyIsaacDenied,
    notifyIsaacExpiryWarning,
  };
})();
