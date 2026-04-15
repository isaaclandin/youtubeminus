// Thin Supabase REST API wrapper — no npm package, no bundler needed.
// Uses YTM_CONFIG defined in config.js (loaded first).

// ── Auth ─────────────────────────────────────────────────────────────────────
// Handles sign-in / sign-out / session refresh via chrome.storage.local.

const AUTH = (() => {
  const KEY = 'ytm_session';

  function load() {
    return new Promise(resolve =>
      chrome.storage.local.get(KEY, r => resolve(r[KEY] || null))
    );
  }
  function save(session) {
    return new Promise(resolve => chrome.storage.local.set({ [KEY]: session }, resolve));
  }
  function wipe() {
    return new Promise(resolve => chrome.storage.local.remove(KEY, resolve));
  }

  async function callAuth(path, body, token) {
    const headers = { 'apikey': YTM_CONFIG.supabaseKey, 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${YTM_CONFIG.supabaseUrl}/auth/v1/${path}`, {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.message || 'Auth error');
    return data;
  }

  function parseSession(data) {
    return {
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_at:    data.expires_at,   // unix seconds
      user_id:       data.user.id,
      email:         data.user.email,
    };
  }

  return {
    async getSession() {
      const s = await load();
      if (!s) return null;
      // Refresh if within 60 s of expiry
      if (s.expires_at && Date.now() / 1000 > s.expires_at - 60) {
        try {
          const data = await callAuth('token?grant_type=refresh_token', { refresh_token: s.refresh_token });
          const fresh = parseSession(data);
          await save(fresh);
          return fresh;
        } catch {
          await wipe();
          return null;
        }
      }
      return s;
    },

    async signIn(email, password) {
      const data = await callAuth('token?grant_type=password', { email, password });
      const session = parseSession(data);
      await save(session);
      return session;
    },

    async signOut() {
      const s = await load();
      if (s?.access_token) {
        await callAuth('logout', {}, s.access_token).catch(() => {});
      }
      await wipe();
    },
  };
})();

// ── Supabase REST ─────────────────────────────────────────────────────────────

const SUPABASE = (() => {
  async function headers(extras = {}) {
    const session = await AUTH.getSession();
    const token = session?.access_token || YTM_CONFIG.supabaseKey;
    return {
      'apikey':        YTM_CONFIG.supabaseKey,
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
      ...extras,
    };
  }

  async function req(path, opts = {}) {
    try {
      const res = await fetch(`${YTM_CONFIG.supabaseUrl}/rest/v1/${path}`, {
        headers: await headers(opts.headers),
        ...opts,
      });
      if (!res.ok) {
        console.error('[SUPABASE]', res.status, await res.text());
        return null;
      }
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    } catch (e) {
      console.error('[SUPABASE] fetch error:', e);
      return null;
    }
  }

  function first(rows) {
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  return {
    // Returns the active (approved + not expired) approval for a video, or null.
    async getActiveApproval(videoId) {
      const now = new Date().toISOString();
      const rows = await req(
        `requests?video_id=eq.${encodeURIComponent(videoId)}&status=eq.approved&expires_at=gt.${encodeURIComponent(now)}&order=created_at.desc&limit=1`
      );
      return first(rows);
    },

    // Returns the most recent pending request for a video, or null.
    async getPendingRequest(videoId) {
      const rows = await req(
        `requests?video_id=eq.${encodeURIComponent(videoId)}&status=eq.pending&order=created_at.desc&limit=1`
      );
      return first(rows);
    },

    // Returns the most recent approved/pending/denied request for a video.
    async getLatestRequest(videoId) {
      const rows = await req(
        `requests?video_id=eq.${encodeURIComponent(videoId)}&status=in.(approved,pending,denied)&order=created_at.desc&limit=1`
      );
      return first(rows);
    },

    // Returns all active relationships for the signed-in user, with partner telegram_chat_ids.
    async getActiveRelationships() {
      const session = await AUTH.getSession();
      if (!session) return [];
      const rows = await req(
        `relationships?owner_id=eq.${session.user_id}&status=eq.active&select=id,partner:profiles!partner_id(telegram_chat_id)`
      );
      return rows ?? [];
    },

    // Create a new pending request. Returns the created row.
    async createRequest({ videoId, videoTitle, videoThumbnail, reason, relationshipId }) {
      const rows = await req('requests', {
        method: 'POST',
        body: JSON.stringify({
          video_id:        videoId,
          video_title:     videoTitle,
          video_thumbnail: videoThumbnail,
          reason:          reason,
          relationship_id: relationshipId,
          requested_by:    'account_owner',
          status:          'pending',
        }),
      });
      return first(rows);
    },

    // Set a request's status to 'released'.
    async releaseApproval(requestId) {
      const rows = await req(`requests?id=eq.${requestId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'released' }),
      });
      return first(rows);
    },

    // All active (approved + not expired) approvals — used by popup + background.
    async getAllActive() {
      const now = new Date().toISOString();
      return req(
        `requests?status=eq.approved&expires_at=gt.${encodeURIComponent(now)}&order=expires_at.asc`
      ) ?? [];
    },

    // All pending requests — used by popup.
    async getAllPending() {
      return req('requests?status=eq.pending&order=created_at.desc') ?? [];
    },

    // Recent history — used by popup.
    async getHistory(limit = 10) {
      return req(
        `requests?status=in.(approved,denied,expired,released)&order=created_at.desc&limit=${limit}`
      ) ?? [];
    },

    // Approvals that became active in the last hour — used by background poller.
    async getRecentlyApproved() {
      const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
      const now     = new Date().toISOString();
      return req(
        `requests?status=eq.approved&approved_at=gt.${encodeURIComponent(hourAgo)}&expires_at=gt.${encodeURIComponent(now)}&order=approved_at.desc`
      ) ?? [];
    },
  };
})();
