// Email notification helpers via the Resend API.
// Called from background.js (via importScripts) — never directly from content.js.

const RESEND = (() => {
  async function send(to, subject, html) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${YTM_CONFIG.resendKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          from:    YTM_CONFIG.resendFrom,
          to:      Array.isArray(to) ? to : [to],
          subject,
          html,
        }),
      });
      if (!res.ok) console.error('[RESEND]', res.status, await res.text());
      return res.ok;
    } catch (e) {
      console.error('[RESEND] fetch error:', e);
      return false;
    }
  }

  // ── Shared styles ────────────────────────────────────────────────────────────
  const base = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                max-width:520px;margin:0 auto;padding:24px;background:#fff;color:#0f0f0f">
  `;
  const close = `</div>`;

  function thumb(url, title) {
    return `<img src="${url}" alt="${title}"
                 style="width:100%;max-width:320px;border-radius:8px;display:block;margin:0 0 16px">`;
  }

  function btn(href, label, bg = '#ff0000') {
    return `<a href="${href}"
               style="display:inline-block;padding:10px 20px;margin:6px 4px;
                      background:${bg};color:#fff;text-decoration:none;
                      border-radius:6px;font-weight:600;font-size:14px">${label}</a>`;
  }

  function approveLinks(dashboardUrl, requestId) {
    const durations = [
      ['video_only',  'This video only'],
      ['30_minutes',  '30 minutes'],
      ['2_hours',     '2 hours'],
      ['today_only',  'Today only'],
    ];
    return durations
      .map(([d, label]) =>
        btn(`${dashboardUrl}/approve?id=${requestId}&duration=${d}`, `✓ ${label}`, '#16a34a'))
      .join('');
  }

  // ── Email builders ───────────────────────────────────────────────────────────

  return {
    // → Jenna: Isaac submitted a request
    async notifyJennaRequest({ requestId, videoTitle, videoThumbnail, reason }) {
      const d = YTM_CONFIG.dashboardUrl;
      const html = base + `
        <h2 style="margin:0 0 4px">Isaac wants to watch a YouTube video</h2>
        <p style="margin:0 0 16px;color:#666;font-size:14px">Waiting for your approval</p>
        ${thumb(videoThumbnail, videoTitle)}
        <h3 style="margin:0 0 4px">${videoTitle}</h3>
        <p style="margin:0 0 20px;color:#444">${reason}</p>
        <p style="margin:0 0 8px;font-weight:600">Approve for:</p>
        ${approveLinks(d, requestId)}
        <br>
        ${btn(`${d}/deny?id=${requestId}`, '✗ Deny', '#dc2626')}
        <p style="margin:24px 0 0">
          <a href="${d}" style="color:#666;font-size:13px">Open dashboard →</a>
        </p>
      ` + close;

      return send(
        YTM_CONFIG.jennaEmail,
        'Isaac wants to watch a YouTube video',
        html
      );
    },

    // → Isaac: Jenna approved the request
    async notifyIsaacApproved({ videoTitle, videoThumbnail, durationLabel, expiresAt, videoId }) {
      const expiry = new Date(expiresAt).toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });
      const html = base + `
        <h2 style="margin:0 0 4px;color:#16a34a">✓ Request approved</h2>
        ${thumb(videoThumbnail, videoTitle)}
        <h3 style="margin:0 0 4px">${videoTitle}</h3>
        <p style="margin:0 0 4px">Duration: <strong>${durationLabel}</strong></p>
        <p style="margin:0 0 20px;color:#666">Expires: ${expiry}</p>
        ${btn(`https://www.youtube.com/watch?v=${videoId}`, 'Watch now →')}
      ` + close;

      return send(YTM_CONFIG.isaacEmail, 'Jenna approved your request', html);
    },

    // → Isaac: Jenna denied the request
    async notifyIsaacDenied({ videoTitle, videoThumbnail, videoId }) {
      const html = base + `
        <h2 style="margin:0 0 4px;color:#dc2626">Request denied</h2>
        ${thumb(videoThumbnail, videoTitle)}
        <h3 style="margin:0 0 16px">${videoTitle}</h3>
        ${btn(`https://www.youtube.com/watch?v=${videoId}`, 'Request again →', '#6b7280')}
      ` + close;

      return send(YTM_CONFIG.isaacEmail, 'Jenna denied your request', html);
    },

    // → Isaac: 15-minute expiry warning
    async notifyIsaacExpiryWarning({ videoTitle, videoThumbnail, videoId }) {
      const html = base + `
        <h2 style="margin:0 0 4px;color:#d97706">⏳ 15 minutes remaining</h2>
        ${thumb(videoThumbnail, videoTitle)}
        <h3 style="margin:0 0 16px">${videoTitle}</h3>
        ${btn(`https://www.youtube.com/watch?v=${videoId}`, 'Request more time →', '#d97706')}
      ` + close;

      return send(
        YTM_CONFIG.isaacEmail,
        'Your approved video expires in 15 minutes',
        html
      );
    },
  };
})();
