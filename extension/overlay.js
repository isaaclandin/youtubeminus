// Overlay rendering — injected into youtube.com as a content script.
// Uses Shadow DOM so YouTube's CSS can't interfere with our UI.
// Exposes the YTMOverlay object which content.js drives.

const YTMOverlay = (() => {

  // ── Shadow host ─────────────────────────────────────────────────────────────
  // A single fixed host element holds all overlay states inside a shadow root.

  let host = null;
  let shadow = null;
  let timerHost = null;
  let timerShadow = null;

  function ensureHost() {
    if (host && document.body.contains(host)) return;
    host = document.createElement('div');
    host.id = 'ytm-overlay-host';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${GATE_CSS}</style><div id="gate" class="gate hidden"></div>`;
    document.body.appendChild(host);
  }

  function gate() {
    ensureHost();
    return shadow.getElementById('gate');
  }

  // ── Shared CSS ───────────────────────────────────────────────────────────────

  const GATE_CSS = `
    :host { all: initial; }
    .gate {
      position: fixed; inset: 0; z-index: 2147483647;
      background: #0f0f0f;
      display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #fff;
    }
    .gate.hidden { display: none; }

    .card {
      background: #1f1f1f;
      border-radius: 12px;
      padding: 28px;
      width: 440px;
      max-width: calc(100vw - 32px);
      box-shadow: 0 24px 48px rgba(0,0,0,.6);
    }

    .thumb {
      width: 100%; border-radius: 8px; display: block; margin-bottom: 16px;
    }
    .title {
      font-size: 16px; font-weight: 600; margin: 0 0 4px; line-height: 1.4;
      display: -webkit-box; -webkit-line-clamp: 2;
      -webkit-box-orient: vertical; overflow: hidden;
    }
    .subtitle {
      font-size: 13px; color: #aaa; margin: 0 0 20px;
    }

    label { font-size: 13px; color: #aaa; display: block; margin-bottom: 6px; }
    textarea {
      width: 100%; box-sizing: border-box;
      background: #2f2f2f; border: 1px solid #3f3f3f; border-radius: 8px;
      color: #fff; font-size: 14px; padding: 10px 12px; resize: vertical;
      min-height: 72px; outline: none; font-family: inherit;
    }
    textarea:focus { border-color: #ff0000; }

    .btn {
      display: inline-flex; align-items: center; justify-content: center;
      gap: 6px;
      background: #ff0000; color: #fff; border: none; border-radius: 8px;
      padding: 10px 20px; font-size: 14px; font-weight: 600;
      cursor: pointer; margin-top: 14px; width: 100%;
    }
    .btn:hover { background: #cc0000; }
    .btn:disabled { background: #555; cursor: not-allowed; }

    .btn-ghost {
      background: transparent; border: 1px solid #555; color: #aaa;
      border-radius: 8px; padding: 8px 16px; font-size: 13px;
      cursor: pointer; margin-top: 10px; width: 100%;
    }
    .btn-ghost:hover { border-color: #aaa; color: #fff; }

    .spinner {
      width: 28px; height: 28px; border: 3px solid #444;
      border-top-color: #ff0000; border-radius: 50%;
      animation: spin .8s linear infinite; margin: 16px auto 8px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .center { text-align: center; }
    .lock-icon { font-size: 48px; display: block; margin: 0 0 12px; }
    .blocked-title { font-size: 20px; font-weight: 700; margin: 0 0 8px; }
    .blocked-sub { font-size: 14px; color: #aaa; margin: 0 0 24px; }
    .search-link {
      display: inline-block; background: #ff0000; color: #fff;
      text-decoration: none; border-radius: 8px; padding: 10px 24px;
      font-weight: 600; font-size: 14px;
    }
    .search-link:hover { background: #cc0000; }
    .error { color: #f87171; font-size: 13px; margin-top: 8px; }
  `;

  const TIMER_CSS = `
    :host { all: initial; }
    .timer {
      position: fixed; bottom: 20px; right: 20px; z-index: 2147483646;
      background: rgba(20,20,20,.92); backdrop-filter: blur(8px);
      border: 1px solid #333; border-radius: 10px;
      padding: 10px 14px; display: flex; align-items: center; gap: 10px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px; color: #fff; min-width: 160px;
      box-shadow: 0 4px 16px rgba(0,0,0,.4);
      transition: border-color .3s;
    }
    .timer.warning { border-color: #d97706; }
    .timer.warning .time { color: #fbbf24; }
    .icon { font-size: 16px; }
    .time { font-variant-numeric: tabular-nums; font-weight: 600; flex: 1; }
    .release {
      background: none; border: 1px solid #555; color: #aaa;
      border-radius: 6px; padding: 4px 8px; font-size: 12px;
      cursor: pointer; flex-shrink: 0;
    }
    .release:hover { border-color: #aaa; color: #fff; }

    /* Expiry soft overlay */
    .expiry-overlay {
      position: fixed; inset: 0; z-index: 2147483645;
      background: rgba(0,0,0,.7); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .expiry-card {
      background: #1f1f1f; border-radius: 12px; padding: 28px;
      width: 380px; max-width: calc(100vw - 32px); text-align: center; color: #fff;
    }
    .expiry-icon { font-size: 40px; margin-bottom: 12px; }
    .expiry-title { font-size: 18px; font-weight: 700; margin: 0 0 8px; }
    .expiry-sub { font-size: 14px; color: #aaa; margin: 0 0 20px; }
    .expiry-btn {
      display: block; background: #ff0000; color: #fff; border: none;
      border-radius: 8px; padding: 10px 20px; font-size: 14px;
      font-weight: 600; cursor: pointer; width: 100%; margin-bottom: 8px;
    }
    .expiry-btn:hover { background: #cc0000; }
    .expiry-dismiss {
      background: none; border: none; color: #666; font-size: 13px;
      cursor: pointer;
    }
  `;

  // ── Gate states ──────────────────────────────────────────────────────────────

  function showGate(html) {
    const g = gate();
    g.innerHTML = html;
    g.classList.remove('hidden');
  }

  function hideGate() {
    gate().classList.add('hidden');
  }

  // Loading spinner while we query Supabase
  function showLoading() {
    showGate(`<div class="card center"><div class="spinner"></div></div>`);
  }

  // Full-page block for homepage / shorts / feed
  function showBlocked() {
    showGate(`
      <div class="card center">
        <span class="lock-icon">🔒</span>
        <p class="blocked-title">This area of YouTube is blocked</p>
        <p class="blocked-sub">YouTube's homepage, feeds, and Shorts are not available.</p>
        <a href="https://www.youtube.com/results" class="search-link">Search YouTube</a>
      </div>
    `);
    // No way to dismiss — the content script will also re-block on any navigation
  }

  // Request form
  function showRequest(videoId, info, onSubmit) {
    showGate(`
      <div class="card">
        <img class="thumb" src="${info.thumbnail}" alt="">
        <p class="title">${info.title}</p>
        <p class="subtitle">Request required to watch this video</p>
        <label>Why do you want to watch this?</label>
        <textarea id="ytm-reason" placeholder="Enter your reason…"></textarea>
        <p id="ytm-req-error" class="error" style="display:none"></p>
        <button class="btn" id="ytm-submit-btn">Send Request</button>
      </div>
    `);

    const submitBtn = shadow.getElementById('ytm-submit-btn');
    const reasonEl  = shadow.getElementById('ytm-reason');
    const errorEl   = shadow.getElementById('ytm-req-error');

    submitBtn.addEventListener('click', () => {
      const reason = reasonEl.value.trim();
      if (!reason) {
        errorEl.textContent = 'Please enter a reason.';
        errorEl.style.display = '';
        return;
      }
      errorEl.style.display = 'none';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
      onSubmit(reason);
    });
  }

  // Pending — waiting for Jenna
  function showPending(info) {
    showGate(`
      <div class="card center">
        <img class="thumb" src="${info.thumbnail}" alt="">
        <p class="title">${info.title}</p>
        <div class="spinner"></div>
        <p style="color:#aaa;font-size:14px;margin:8px 0 0">Waiting for Jenna…</p>
        <p style="color:#666;font-size:12px;margin:4px 0 0">Checking every 30 seconds</p>
      </div>
    `);
  }

  // Denied
  function showDenied(info, onReRequest) {
    showGate(`
      <div class="card center">
        <img class="thumb" src="${info.thumbnail}" alt="">
        <p class="title">${info.title}</p>
        <p style="color:#f87171;font-size:15px;font-weight:600;margin:12px 0 4px">
          Jenna denied this request
        </p>
        <button class="btn-ghost" id="ytm-rerequest">Request again with new reason</button>
      </div>
    `);
    shadow.getElementById('ytm-rerequest').addEventListener('click', onReRequest);
  }

  // ── Timer widget ─────────────────────────────────────────────────────────────

  let timerInterval = null;
  let expiryWarningSent = false;

  function showTimer(expiresAt, requestId, videoTitle, videoThumbnail, videoId) {
    removeTimer();

    timerHost = document.createElement('div');
    timerHost.id = 'ytm-timer-host';
    timerShadow = timerHost.attachShadow({ mode: 'open' });
    timerShadow.innerHTML = `<style>${TIMER_CSS}</style>
      <div class="timer" id="ytm-timer">
        <span class="icon">⏱</span>
        <span class="time" id="ytm-time">…</span>
        <button class="release" id="ytm-release">Release</button>
      </div>`;
    document.body.appendChild(timerHost);

    const timeEl   = timerShadow.getElementById('ytm-time');
    const timerEl  = timerShadow.getElementById('ytm-timer');
    const releaseBtn = timerShadow.getElementById('ytm-release');

    function tick() {
      const remaining = YOUTUBE.formatRemaining(expiresAt);
      if (!remaining) {
        clearInterval(timerInterval);
        removeTimer();
        showExpiryPrompt(videoTitle, videoThumbnail, videoId);
        return;
      }
      timeEl.textContent = remaining;

      const soon = YOUTUBE.isExpiringSoon(expiresAt);
      timerEl.classList.toggle('warning', soon);

      // Send 15-minute warning email once
      if (soon && !expiryWarningSent) {
        expiryWarningSent = true;
        chrome.runtime.sendMessage({
          type: 'SEND_EXPIRY_WARNING',
          videoTitle, videoThumbnail, videoId,
        });
      }
    }

    tick();
    timerInterval = setInterval(tick, 1000);

    releaseBtn.addEventListener('click', async () => {
      releaseBtn.disabled = true;
      await SUPABASE.releaseApproval(requestId);
      removeTimer();
      // The content script's navigation handler will show the request form again
      window.dispatchEvent(new CustomEvent('ytm-approval-released', { detail: { videoId } }));
    });
  }

  function removeTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    expiryWarningSent = false;
    timerHost?.remove();
    timerHost = null;
    timerShadow = null;
  }

  // Soft expiry prompt — does NOT hard-cut the video
  function showExpiryPrompt(videoTitle, videoThumbnail, videoId) {
    if (!timerHost) {
      timerHost = document.createElement('div');
      timerHost.id = 'ytm-timer-host';
      timerShadow = timerHost.attachShadow({ mode: 'open' });
      timerShadow.innerHTML = `<style>${TIMER_CSS}</style>`;
      document.body.appendChild(timerHost);
    }

    const overlay = document.createElement('div');
    overlay.className = 'expiry-overlay';
    overlay.innerHTML = `
      <div class="expiry-card">
        <div class="expiry-icon">⏳</div>
        <p class="expiry-title">Your approved time has ended</p>
        <p class="expiry-sub">${videoTitle}</p>
        <button class="expiry-btn" id="ytm-request-more">Request more time →</button>
        <button class="expiry-dismiss" id="ytm-dismiss-expiry">Keep watching without approval</button>
      </div>
    `;
    timerShadow.appendChild(overlay);

    timerShadow.getElementById('ytm-request-more').addEventListener('click', () => {
      window.location.href = `https://www.youtube.com/watch?v=${videoId}`;
    });
    timerShadow.getElementById('ytm-dismiss-expiry').addEventListener('click', () => {
      overlay.remove();
    });
  }

  // ── Watch page mods ──────────────────────────────────────────────────────────

  let watchModStyle = null;

  function applyWatchMods() {
    if (!watchModStyle) {
      watchModStyle = document.createElement('style');
      watchModStyle.id = 'ytm-watch-mods';
      document.documentElement.appendChild(watchModStyle);
    }
    watchModStyle.textContent = `
      /* Hide recommendation sidebar */
      #secondary,
      ytd-watch-next-secondary-results-renderer { display: none !important; }
      /* Hide autoplay toggle */
      .ytp-autonav-toggle-button-container { display: none !important; }
      /* Hide endscreen */
      .ytp-endscreen-content { display: none !important; }
      /* Hide up-next overlay */
      .ytp-upnext { display: none !important; }
    `;
    // Kill autoplay preference in localStorage
    try { localStorage.setItem('yt-autoplay', JSON.stringify({ status: false })); } catch {}
  }

  function removeWatchMods() {
    watchModStyle?.remove();
    watchModStyle = null;
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  return {
    showLoading,
    showBlocked,
    showRequest,
    showPending,
    showDenied,
    hideGate,
    showTimer,
    removeTimer,
    applyWatchMods,
    removeWatchMods,
  };
})();
