// YouTubeMinus — service worker (background.js)
// Handles: Telegram notifications, browser notifications, and a 30-second alarm
// that polls Supabase for new approvals so the popup stays current.

importScripts(
  'lib/config.js',
  'lib/supabase.js',
  'lib/youtube.js',
  'lib/telegram.js'
);

// ── Alarm: poll every 30 seconds ─────────────────────────────────────────────

chrome.alarms.create('ytm_poll', { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'ytm_poll') {
    pollForNewApprovals();
  } else if (alarm.name.startsWith('ytm_escalate_')) {
    handleEscalationAlarm(alarm.name);
  }
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

      showNotification(
        'Request approved ✓',
        `You can watch: ${approval.video_title || 'the video'}`,
        approval.video_id
      );

      notifyYouTubeTabs({ type: 'APPROVAL_RECEIVED', videoId: approval.video_id });

      notifiedIds.push(approval.id);
    }

    await chrome.storage.local.set({ notifiedIds: notifiedIds.slice(-100) });
  } catch (e) {
    console.error('[YTM background] poll error:', e);
  }
}

// ── Escalation: notify co-approvers if request is still pending after 15 min ─

async function handleEscalationAlarm(alarmName) {
  // alarmName: ytm_escalate_<requestId>
  const requestId = alarmName.replace('ytm_escalate_', '');
  try {
    const { [`escalation_${requestId}`]: data } = await chrome.storage.local.get(`escalation_${requestId}`);
    if (!data) return;

    // Check if still pending
    const pending = await SUPABASE.getPendingRequest(data.videoId);
    if (!pending || pending.id !== requestId) {
      // Already approved/denied — skip escalation
      await chrome.storage.local.remove(`escalation_${requestId}`);
      return;
    }

    // Notify co-approvers
    await Promise.all(data.coApproverChatIds.map(chatId =>
      TELEGRAM.notifyPartnerRequest({
        chatId,
        requestId,
        videoTitle:     data.videoTitle,
        videoThumbnail: data.videoThumbnail,
        reason:         data.reason,
        escalation:     true,
      })
    ));

    await chrome.storage.local.remove(`escalation_${requestId}`);
  } catch (e) {
    console.error('[YTM background] escalation error:', e);
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

    // ── Telegram: new request to primary partner(s) ──────────────────────────
    case 'SEND_REQUEST_EMAIL': {
      if (!msg.partnerChatIds?.length) {
        console.warn('[YTM] No partner chat IDs — is the extension signed in?');
        return { ok: false, error: 'no_partners' };
      }
      await Promise.all(msg.partnerChatIds.map(chatId => TELEGRAM.notifyPartnerRequest({
        chatId,
        requestId:      msg.requestId,
        videoTitle:     msg.videoTitle,
        videoThumbnail: msg.videoThumbnail,
        reason:         msg.reason,
        escalation:     false,
      })));
      return { ok: true };
    }

    // ── Schedule co-approver escalation after 15 min ─────────────────────────
    case 'SCHEDULE_ESCALATION': {
      if (!msg.coApproverChatIds?.length) return { ok: true };

      // Store escalation data so the alarm handler can retrieve it
      await chrome.storage.local.set({
        [`escalation_${msg.requestId}`]: {
          videoId:           msg.videoId,
          videoTitle:        msg.videoTitle,
          videoThumbnail:    msg.videoThumbnail,
          reason:            msg.reason,
          coApproverChatIds: msg.coApproverChatIds,
        },
      });

      const delayMinutes = (msg.delayMs || 15 * 60 * 1000) / 60_000;
      chrome.alarms.create(`ytm_escalate_${msg.requestId}`, {
        delayInMinutes: delayMinutes,
      });
      return { ok: true };
    }

    // ── Telegram: approval notification to owner ──────────────────────────────
    case 'SEND_APPROVAL_EMAIL':
      await TELEGRAM.notifyOwnerApproved({
        ownerChatId:   msg.ownerChatId,
        videoTitle:    msg.videoTitle,
        durationLabel: YOUTUBE.durationLabel(msg.durationType),
        expiresAt:     msg.expiresAt,
      });
      return { ok: true };

    // ── Telegram: denial notification to owner ────────────────────────────────
    case 'SEND_DENIAL_EMAIL':
      await TELEGRAM.notifyOwnerDenied({
        ownerChatId: msg.ownerChatId,
        videoTitle:  msg.videoTitle,
      });
      return { ok: true };

    // ── Telegram: 15-minute expiry warning to owner ───────────────────────────
    case 'SEND_EXPIRY_WARNING':
      await TELEGRAM.notifyOwnerExpiryWarning({
        ownerChatId: msg.ownerChatId,
        videoTitle:  msg.videoTitle,
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
