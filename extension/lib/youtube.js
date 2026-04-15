// YouTube URL classification and video metadata helpers.

const YOUTUBE = (() => {

  // ── URL classification ──────────────────────────────────────────────────────

  // Returns one of: 'watch' | 'search' | 'blocked' | 'other'
  function classifyUrl(urlStr) {
    let u;
    try { u = new URL(urlStr); } catch { return 'other'; }

    const host = u.hostname.replace(/^www\./, '');
    if (host !== 'youtube.com' && host !== 'youtu.be') return 'other';

    // youtu.be short links are always watch pages
    if (host === 'youtu.be') return 'watch';

    const path = u.pathname.replace(/\/$/, '') || '/';

    if (path === '/results')                  return 'search';
    if (path === '/watch' && u.searchParams.has('v')) return 'watch';
    if (path === '/')                          return 'blocked';
    if (path.startsWith('/feed'))              return 'blocked';
    if (path.startsWith('/shorts'))            return 'blocked';
    if (path.startsWith('/@'))                 return 'blocked'; // channel pages
    if (path.startsWith('/channel'))           return 'blocked';
    if (path.startsWith('/c/'))                return 'blocked';
    if (path.startsWith('/playlist'))          return 'blocked';
    if (path.startsWith('/gaming'))            return 'blocked';
    if (path.startsWith('/trending'))          return 'blocked';
    if (u.hash.startsWith('#/'))               return 'blocked';

    return 'other';
  }

  // Extracts bare 11-char video ID from any YouTube URL.
  // Strips playlist, index, timestamp and all other parameters.
  function extractVideoId(urlStr) {
    let u;
    try { u = new URL(urlStr); } catch { return null; }

    const host = u.hostname.replace(/^www\./, '');
    let id = null;

    if (host === 'youtu.be') {
      id = u.pathname.slice(1).split('/')[0];
    } else if (host === 'youtube.com') {
      id = u.searchParams.get('v');
    }

    // Validate: YouTube video IDs are exactly 11 chars, alphanumeric + - _
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  }

  function thumbnailUrl(videoId) {
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  }

  // ── oEmbed metadata ─────────────────────────────────────────────────────────

  async function getVideoInfo(videoId) {
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
        { cache: 'default' }
      );
      if (res.ok) {
        const data = await res.json();
        return {
          title:     data.title || 'Unknown Video',
          thumbnail: thumbnailUrl(videoId),
        };
      }
    } catch { /* fall through */ }
    return { title: 'Unknown Video', thumbnail: thumbnailUrl(videoId) };
  }

  // ── Time formatting ─────────────────────────────────────────────────────────

  function formatRemaining(expiresAtIso) {
    const ms = new Date(expiresAtIso) - Date.now();
    if (ms <= 0) return null;
    const h  = Math.floor(ms / 3_600_000);
    const m  = Math.floor((ms % 3_600_000) / 60_000);
    const s  = Math.floor((ms % 60_000) / 1_000);
    if (h > 0)  return `${h}h ${m}m`;
    if (m > 0)  return `${m}m ${s}s`;
    return `${s}s`;
  }

  function isExpired(expiresAtIso) {
    return new Date(expiresAtIso) <= new Date();
  }

  function isExpiringSoon(expiresAtIso) {
    return new Date(expiresAtIso) - Date.now() < 15 * 60_000;
  }

  function durationLabel(durationType) {
    return {
      video_only:  'This video only',
      '30_minutes': '30 minutes',
      '2_hours':    '2 hours',
      today_only:  'Today only',
    }[durationType] || durationType;
  }

  return {
    classifyUrl,
    extractVideoId,
    thumbnailUrl,
    getVideoInfo,
    formatRemaining,
    isExpired,
    isExpiringSoon,
    durationLabel,
  };
})();
