// YouTubeMinus — service worker (background.js)
// Handles: email dispatch, browser notifications, and a 30-second alarm
// that polls Supabase for new approvals so the popup stays current and
// Isaac gets notified even when he's not on a YouTube tab.

importScripts(
  'lib/config.js',
  'lib/supabase.js',
  'lib/youtube.js',
  'lib/resend.js'
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

      // New approval — show notification
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
// Content scripts send messages here for anything that requires API keys
// or chrome.notifications (not available in content script context).

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch(e => {
    console.error('[YTM background] message error:', e);
    sendResponse({ ok: false });
  });
  return true; // keep message channel open for async response
});

async function handleMessage(msg) {
  switch (msg.type) {

    // ── Email: new request to Jenna ─────────────────────────────────────────
    case 'SEND_REQUEST_EMAIL':
      await RESEND.notifyJennaRequest({
        requestId:      msg.requestId,
        videoTitle:     msg.videoTitle,
        videoThumbnail: msg.videoThumbnail,
        reason:         msg.reason,
      });
      return { ok: true };

    // ── Email: approval notification to Isaac ────────────────────────────────
    case 'SEND_APPROVAL_EMAIL':
      await RESEND.notifyIsaacApproved({
        videoTitle:     msg.videoTitle,
        videoThumbnail: msg.videoThumbnail,
        durationLabel:  YOUTUBE.durationLabel(msg.durationType),
        expiresAt:      msg.expiresAt,
        videoId:        msg.videoId,
      });
      return { ok: true };

    // ── Email: denial notification to Isaac ──────────────────────────────────
    case 'SEND_DENIAL_EMAIL':
      await RESEND.notifyIsaacDenied({
        videoTitle:     msg.videoTitle,
        videoThumbnail: msg.videoThumbnail,
        videoId:        msg.videoId,
      });
      return { ok: true };

    // ── Email: 15-minute expiry warning to Isaac ─────────────────────────────
    case 'SEND_EXPIRY_WARNING':
      await RESEND.notifyIsaacExpiryWarning({
        videoTitle:     msg.videoTitle,
        videoThumbnail: msg.videoThumbnail,
        videoId:        msg.videoId,
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

  // Auto-clear after 8 seconds
  setTimeout(() => chrome.notifications.clear(id), 8_000);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function notifyYouTubeTabs(message) {
  const tabs = await chrome.tabs.query({ url: ['*://*.youtube.com/*', '*://youtu.be/*'] });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, message).catch(() => {});
  }
}
