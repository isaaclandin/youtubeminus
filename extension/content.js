// YouTubeMinus — content script
// Injected at document_start into every youtube.com page.
// Drives YTMOverlay (overlay.js) based on URL and Supabase approval state.

(function () {
  'use strict';

  // ── Prevent flash of unblocked content ──────────────────────────────────────
  // Run at document_start (body may not exist yet). Inject a CSS rule that
  // hides the body; we remove it once we know what overlay to show.
  const hideStyle = document.createElement('style');
  hideStyle.id = 'ytm-initial-hide';
  hideStyle.textContent = 'body{visibility:hidden!important}';
  (document.head || document.documentElement).appendChild(hideStyle);

  // ── State ────────────────────────────────────────────────────────────────────
  let currentVideoId  = null;   // video ID currently being handled
  let currentApproval = null;   // active approval row
  let pollTimer       = null;   // setInterval handle for pending-state polling
  let expiryCheckTimer = null;  // setInterval handle for expiry countdown

  // ── Entry point ──────────────────────────────────────────────────────────────
  // Process on DOM ready (first load) and on every YouTube SPA navigation.

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => processPage(location.href));
  } else {
    processPage(location.href);
  }

  // YouTube fires this after each SPA navigation (pushState).
  window.addEventListener('yt-navigate-finish', () => processPage(location.href));

  // Fired by the timer widget's "Release Early" button
  window.addEventListener('ytm-approval-released', (e) => {
    if (e.detail.videoId === currentVideoId) {
      currentApproval = null;
      currentVideoId  = null;
      processPage(location.href);
    }
  });

  // ── Core page processor ──────────────────────────────────────────────────────

  async function processPage(url) {
    clearPolling();

    const kind = YOUTUBE.classifyUrl(url);

    if (kind === 'search') {
      revealPage();
      YTMOverlay.hideGate();
      YTMOverlay.removeTimer();
      YTMOverlay.removeWatchMods();
      currentVideoId  = null;
      currentApproval = null;
      return;
    }

    if (kind === 'blocked') {
      YTMOverlay.removeTimer();
      YTMOverlay.removeWatchMods();
      currentVideoId  = null;
      currentApproval = null;
      await waitForBody();
      YTMOverlay.showBlocked();
      revealPage();         // body is visible, but the gate is on top
      return;
    }

    if (kind === 'watch') {
      const videoId = YOUTUBE.extractVideoId(url);
      if (!videoId) { revealPage(); YTMOverlay.hideGate(); return; }

      // Same video, already approved and not expired — just refresh the timer
      if (videoId === currentVideoId && currentApproval &&
          !YOUTUBE.isExpired(currentApproval.expires_at)) {
        revealPage();
        return;
      }

      currentVideoId  = videoId;
      currentApproval = null;
      YTMOverlay.removeTimer();

      await waitForBody();
      YTMOverlay.showLoading();
      revealPage();

      await handleWatchPage(videoId);
      return;
    }

    // 'other' — allow freely (channel pages are 'blocked', so this is things
    // like /premium, /t/terms, etc. — not worth blocking)
    revealPage();
    YTMOverlay.hideGate();
  }

  // ── Watch page handler ───────────────────────────────────────────────────────

  async function handleWatchPage(videoId) {
    // Check for an active approval first
    let approval = await SUPABASE.getActiveApproval(videoId);

    if (approval) {
      return enterApprovedState(approval, { fromPoll: false });
    }

    // Check for a pending request
    let pending = await SUPABASE.getPendingRequest(videoId);
    if (pending) {
      const info = await YOUTUBE.getVideoInfo(videoId);
      return enterPendingState(pending, info, videoId);
    }

    // Check if the most-recent request was denied (show denial UI instead of
    // a fresh form, so user sees why they're blocked before re-requesting)
    const latest = await SUPABASE.getLatestRequest(videoId);
    if (latest && latest.status === 'denied') {
      const info = await YOUTUBE.getVideoInfo(videoId);
      return YTMOverlay.showDenied(info, () => enterRequestState(videoId, info));
    }

    // No request at all — show request form
    const info = await YOUTUBE.getVideoInfo(videoId);
    enterRequestState(videoId, info);
  }

  // ── States ───────────────────────────────────────────────────────────────────

  function enterApprovedState(approval, { fromPoll }) {
    currentApproval = approval;

    YTMOverlay.hideGate();
    YTMOverlay.applyWatchMods();

    // Show the countdown timer in the corner
    SUPABASE.getLatestRequest(approval.video_id).then(req => {
      const title     = req?.video_title     || approval.video_title || '';
      const thumbnail = req?.video_thumbnail || YOUTUBE.thumbnailUrl(approval.video_id);
      YTMOverlay.showTimer(
        approval.expires_at,
        approval.id,
        title,
        thumbnail,
        approval.video_id
      );
    });

    // If we just transitioned from pending → approved, show a notification
    if (fromPoll) {
      chrome.runtime.sendMessage({
        type:     'SHOW_NOTIFICATION',
        title:    'Request approved',
        body:     `You can now watch the video.`,
        videoId:  approval.video_id,
      });
    }

    // Poll periodically to catch expiry and keep the UI in sync
    startExpiryCheck(approval);
  }

  function enterPendingState(request, info, videoId) {
    YTMOverlay.showPending(info);
    startPolling(videoId, info, request);
  }

  function enterRequestState(videoId, info) {
    YTMOverlay.showRequest(videoId, info, async (reason) => {
      // Look up active relationships to get relationship_id and partner chat IDs
      const relationships = await SUPABASE.getActiveRelationships();
      const primaryRel = relationships[0];
      const partnerChatIds = relationships
        .map(r => r.partner?.telegram_chat_id)
        .filter(Boolean);

      // Create request in Supabase
      const request = await SUPABASE.createRequest({
        videoId,
        videoTitle:     info.title,
        videoThumbnail: info.thumbnail,
        reason,
        relationshipId: primaryRel?.id,
      });

      if (!request) {
        // Re-show form with error (overlay.js handles submit-btn re-enable)
        YTMOverlay.showRequest(videoId, info, arguments.callee);
        return;
      }

      // Tell background to send partner(s) the Telegram notification
      chrome.runtime.sendMessage({
        type:           'SEND_REQUEST_EMAIL',
        requestId:      request.id,
        videoTitle:     info.title,
        videoThumbnail: info.thumbnail,
        reason,
        partnerChatIds,
      });

      enterPendingState(request, info, videoId);
    });
  }

  // ── Polling ──────────────────────────────────────────────────────────────────

  function startPolling(videoId, info, existingRequest) {
    clearPolling();
    pollTimer = setInterval(async () => {
      if (currentVideoId !== videoId) { clearPolling(); return; }

      // Check for approval
      const approval = await SUPABASE.getActiveApproval(videoId);
      if (approval) {
        clearPolling();
        return enterApprovedState(approval, { fromPoll: true });
      }

      // Check if request was denied while we were waiting
      const latest = await SUPABASE.getLatestRequest(videoId);
      if (latest && latest.status === 'denied') {
        clearPolling();
        chrome.runtime.sendMessage({
          type:           'SEND_DENIAL_EMAIL',
          videoTitle:     info.title,
          videoThumbnail: info.thumbnail,
          videoId,
        });
        return YTMOverlay.showDenied(info, () => enterRequestState(videoId, info));
      }
    }, 30_000);
  }

  function startExpiryCheck(approval) {
    clearInterval(expiryCheckTimer);
    expiryCheckTimer = setInterval(() => {
      if (currentApproval?.id !== approval.id) {
        clearInterval(expiryCheckTimer);
        return;
      }
      if (YOUTUBE.isExpired(approval.expires_at)) {
        clearInterval(expiryCheckTimer);
        currentApproval = null;
        // The timer widget handles the soft expiry prompt itself
      }
    }, 10_000);
  }

  function clearPolling() {
    clearInterval(pollTimer);
    clearInterval(expiryCheckTimer);
    pollTimer = expiryCheckTimer = null;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  // Remove the initial body-hide CSS so the page (or overlay) becomes visible.
  function revealPage() {
    document.getElementById('ytm-initial-hide')?.remove();
  }

  // Wait for document.body to exist (content_scripts can run at document_start
  // before the body element is created).
  function waitForBody() {
    return new Promise(resolve => {
      if (document.body) { resolve(); return; }
      const obs = new MutationObserver(() => {
        if (document.body) { obs.disconnect(); resolve(); }
      });
      obs.observe(document.documentElement, { childList: true });
    });
  }

})();
