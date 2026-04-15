// YouTubeMinus — service worker (background.js)
// Handles: Telegram notifications, browser notifications, and a 30-second alarm
// that polls Supabase for new approvals so the popup stays current and
// Isaac gets notified even when he's not on a YouTube tab.

importScripts(
  'lib/config.js',
  'lib/supabase.js',
  'lib/youtube.js',
  'lib/telegram.js'
);

// ── Alarm: poll every 30 seconds ─────────────────────────────────────────────

chrome.alarms.create('ytm_poll', { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'ytm_poll') pollForNewApprovals();
});

// Run once immediately on service worker startup
pollForNewApprovals();

async function pollForNewApprovals() {
  try {
    const approvals = await SUPABASE.getRecentlyApproved();
    if (!approvals || !approvals.length) return;

    const { notifiedIds = [] } = await chrome.storage.local.get('notifiedIds');

    for (const approval of approvals) {
      if (notifiedIds.includes(approval.id)) continue;

      // New approval — show browser notification
      showNotification(
        'Request approved ✓',
        `You can watch: ${approval.video_title || 'the video'}`,
        approval.video_id
      );

      // Ask the active YouTube tab (if any) to refresh its state
      notifyYouTubeTabs({ type: 'APPROVAL_RECEIVED', videoId: approval.video_id });

      notifiedIds.push(approval.id);
    }

    // Keep the list bounded
    await chrome.storage.local.set({ notifiedIds: notifiedIds.slice(-100) });
  } catch (e) {
    console.error('[YTM background] poll error:', e);
  }
}

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch(e => {
    console.error('[YTM background] message error:', e);
    sendResponse({ ok: false });
  });
  return true;
});

async function handleMessage(msg) {
  switch (msg.type) {

    // ── Telegram: new request to partner(s) ─────────────────────────────────
    case 'SEND_REQUEST_EMAIL': {
      const chatIds = msg.partnerChatIds?.length ? msg.partnerChatIds : [YTM_CONFIG.isaacChatId];
      await Promise.all(chatIds.map(chatId => TELEGRAM.notifyJennaRequest({
        chatId,
        requestId:      msg.requestId,
        videoTitle:     msg.videoTitle,
        videoThumbnail: msg.videoThumbnail,
        reason:         msg.reason,
      })));
      return { ok: true };
    }

    // ── Telegram: approval notification to Isaac ─────────────────────────────
    case 'SEND_APPROVAL_EMAIL':
      await TELEGRAM.notifyIsaacApproved({
        videoTitle:    msg.videoTitle,
        durationLabel: YOUTUBE.durationLabel(msg.durationType),
        expiresAt:     msg.expiresAt,
      });
      return { ok: true };

    // ── Telegram: denial notification to Isaac ───────────────────────────────
    case 'SEND_DENIAL_EMAIL':
      await TELEGRAM.notifyIsaacDenied({
        videoTitle: msg.videoTitle,
      });
      return { ok: true };

    // ── Telegram: 15-minute expiry warning to Isaac ──────────────────────────
    case 'SEND_EXPIRY_WARNING':
      await TELEGRAM.notifyIsaacExpiryWarning({
        videoTitle: msg.videoTitle,
      });
      return { ok: true };

    // ── Browser notification (from content script) ───────────────────────────
    case 'SHOW_NOTIFICATION':
      showNotification(msg.title, msg.body, msg.videoId);
      return { ok: true };

    default:
      return { ok: false, error: 'unknown message type' };
  }
}

// ── Browser notifications ─────────────────────────────────────────────────────

function showNotification(title, message, videoId) {
  const iconUrl = videoId
    ? `https://img.youtube.com/vi/${videoId}/default.jpg`
    : 'icons/icon128.png';

  const id = `ytm_${Date.now()}`;
  chrome.notifications.create(id, {
    type:     'basic',
    iconUrl,
    title,
    message,
    priority: 2,
  });

  setTimeout(() => chrome.notifications.clear(id), 8_000);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function notifyYouTubeTabs(message) {
  const tabs = await chrome.tabs.query({ url: ['*://*.youtube.com/*', '*://youtu.be/*'] });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, message).catch(() => {});
  }
}
