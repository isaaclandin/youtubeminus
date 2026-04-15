// YouTubeMinus — popup script
// Renders active approvals (with live countdown), pending requests, and history.
// Polls Supabase every 30 seconds for updates.

(async function () {
  'use strict';

  // ── Elements ────────────────────────────────────────────────────────────────

  const activeList   = document.getElementById('active-list');
  const activeEmpty  = document.getElementById('active-empty');
  const pendingList  = document.getElementById('pending-list');
  const pendingEmpty = document.getElementById('pending-empty');
  const historyList  = document.getElementById('history-list');
  const historyEmpty = document.getElementById('history-empty');

  // ── State ───────────────────────────────────────────────────────────────────

  // Map of approvalId → setInterval handle for live countdown ticks
  let countdownTimers = {};

  // ── Initial load ─────────────────────────────────────────────────────────────

  await render();

  // ── Polling ──────────────────────────────────────────────────────────────────

  setInterval(render, 30_000);

  // ── Render ───────────────────────────────────────────────────────────────────

  async function render() {
    try {
      const [actives, pendings, history] = await Promise.all([
        SUPABASE.getAllActive(),
        SUPABASE.getAllPending(),
        SUPABASE.getHistory(10),
      ]);
      renderActive(actives   || []);
      renderPending(pendings || []);
      renderHistory(history  || []);
    } catch (e) {
      console.error('[YTM popup] render error:', e);
    }
  }

  // ── Active approvals ─────────────────────────────────────────────────────────

  function renderActive(approvals) {
    stopAllCountdowns();
    activeList.innerHTML = '';

    if (!approvals.length) {
      activeEmpty.classList.remove('hidden');
      return;
    }
    activeEmpty.classList.add('hidden');

    for (const approval of approvals) {
      const row = buildActiveRow(approval);
      activeList.appendChild(row);
    }
  }

  function buildActiveRow(approval) {
    const videoId   = approval.video_id;
    const title     = approval.video_title || 'Unknown Video';
    const thumbnail = approval.video_thumbnail || YOUTUBE.thumbnailUrl(videoId);

    const row = document.createElement('div');
    row.className = 'video-row';
    row.dataset.approvalId = approval.id;

    row.innerHTML = `
      <img class="thumb" src="${esc(thumbnail)}" alt="">
      <div class="video-info">
        <p class="video-title">
          <a href="https://www.youtube.com/watch?v=${esc(videoId)}" target="_blank">${esc(title)}</a>
        </p>
        <span class="countdown" id="cd-${esc(approval.id)}">…</span>
        <span class="expiry-warning hidden" id="warn-${esc(approval.id)}">Expiring soon</span>
      </div>
      <button class="release-btn" data-request-id="${esc(approval.id)}" data-video-id="${esc(videoId)}">
        Release
      </button>
    `;

    row.querySelector('.release-btn').addEventListener('click', onRelease);

    startCountdown(approval);
    return row;
  }

  function startCountdown(approval) {
    const id = approval.id;
    tick(approval); // immediate tick
    countdownTimers[id] = setInterval(() => tick(approval), 1_000);
  }

  function tick(approval) {
    const id  = approval.id;
    const cdEl   = document.getElementById(`cd-${id}`);
    const warnEl = document.getElementById(`warn-${id}`);
    if (!cdEl) { clearInterval(countdownTimers[id]); delete countdownTimers[id]; return; }

    const remaining = YOUTUBE.formatRemaining(approval.expires_at);
    if (!remaining) {
      clearInterval(countdownTimers[id]);
      delete countdownTimers[id];
      cdEl.textContent = 'Expired';
      cdEl.classList.add('warning');
      // Trigger a full re-render so the expired row moves to history
      setTimeout(render, 1_500);
      return;
    }

    cdEl.textContent = remaining;
    const soon = YOUTUBE.isExpiringSoon(approval.expires_at);
    cdEl.classList.toggle('warning', soon);
    if (warnEl) warnEl.classList.toggle('hidden', !soon);
  }

  function stopAllCountdowns() {
    for (const handle of Object.values(countdownTimers)) clearInterval(handle);
    countdownTimers = {};
  }

  async function onRelease(e) {
    const btn       = e.currentTarget;
    const requestId = btn.dataset.requestId;
    btn.disabled = true;
    btn.textContent = '…';
    await SUPABASE.releaseApproval(requestId);
    await render();
  }

  // ── Pending ──────────────────────────────────────────────────────────────────

  function renderPending(pendings) {
    pendingList.innerHTML = '';

    if (!pendings.length) {
      pendingEmpty.classList.remove('hidden');
      return;
    }
    pendingEmpty.classList.add('hidden');

    for (const req of pendings) {
      pendingList.appendChild(buildPendingRow(req));
    }
  }

  function buildPendingRow(req) {
    const videoId   = req.video_id;
    const title     = req.video_title || 'Unknown Video';
    const thumbnail = req.video_thumbnail || YOUTUBE.thumbnailUrl(videoId);
    const since     = timeAgo(req.created_at);

    const row = document.createElement('div');
    row.className = 'video-row';
    row.innerHTML = `
      <img class="thumb" src="${esc(thumbnail)}" alt="">
      <div class="video-info">
        <p class="video-title">
          <a href="https://www.youtube.com/watch?v=${esc(videoId)}" target="_blank">${esc(title)}</a>
        </p>
        <span class="video-meta">Requested ${esc(since)}</span>
      </div>
    `;
    return row;
  }

  // ── History ──────────────────────────────────────────────────────────────────

  function renderHistory(items) {
    historyList.innerHTML = '';

    if (!items.length) {
      historyEmpty.classList.remove('hidden');
      return;
    }
    historyEmpty.classList.add('hidden');

    for (const item of items) {
      historyList.appendChild(buildHistoryRow(item));
    }
  }

  function buildHistoryRow(req) {
    const videoId   = req.video_id;
    const title     = req.video_title || 'Unknown Video';
    const thumbnail = req.video_thumbnail || YOUTUBE.thumbnailUrl(videoId);
    const date      = formatDate(req.updated_at || req.created_at);
    const { cls, label } = statusBadge(req.status);
    const duration  = req.duration_type
      ? `<span class="video-meta"> · ${esc(YOUTUBE.durationLabel(req.duration_type))}</span>`
      : '';

    const row = document.createElement('div');
    row.className = 'video-row';
    row.innerHTML = `
      <img class="thumb" src="${esc(thumbnail)}" alt="">
      <div class="video-info">
        <p class="video-title">
          <a href="https://www.youtube.com/watch?v=${esc(videoId)}" target="_blank">${esc(title)}</a>
        </p>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span class="badge ${esc(cls)}">${esc(label)}</span>
          ${duration}
        </div>
        <span class="video-meta">${esc(date)}</span>
      </div>
    `;
    return row;
  }

  function statusBadge(status) {
    switch (status) {
      case 'approved':  return { cls: 'badge-approved',  label: 'Approved'  };
      case 'denied':    return { cls: 'badge-denied',    label: 'Denied'    };
      case 'released':  return { cls: 'badge-released',  label: 'Released'  };
      case 'expired':   return { cls: 'badge-expired',   label: 'Expired'   };
      case 'pending':   return { cls: 'badge-pending',   label: 'Pending'   };
      default:          return { cls: 'badge-released',  label: status      };
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────────────────

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function timeAgo(isoStr) {
    const ms = Date.now() - new Date(isoStr);
    const m  = Math.floor(ms / 60_000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function formatDate(isoStr) {
    return new Date(isoStr).toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  }

})();
