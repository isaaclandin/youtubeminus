// YouTubeMinus — extension configuration
// Loaded as the first content script and via importScripts() in background.js.
//
// SUPABASE_URL and SUPABASE_ANON_KEY are read-only public credentials; safe
// to commit. RESEND_API_KEY allows sending email — keep this file out of
// public repos. The extension is published as UNLISTED on the Chrome Web Store.
//
// ── Fill in before deploying ─────────────────────────────────────────────────
const YTM_CONFIG = {
  supabaseUrl:  'https://tcyoaqqhnlibjmmukexh.supabase.co',
  supabaseKey:  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjeW9hcXFobmxpYmptbXVrZXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTY2MDgsImV4cCI6MjA5MTc3MjYwOH0.u-WIkAwPawybJPWAoQfjZrSdy2nghXLx24f_Byq3Weg',

  resendKey:    're_PLCeR7dH_69RiwGCMA88yvo3sBz2KeoWb',
  resendFrom:   'YouTubeMinus <onboarding@resend.dev>',

  jennaEmail:   'jkull2003@gmail.com',
  isaacEmail:   'isaac.landin@gmail.com',

  // Base URL of the approval dashboard — used in email deep links.
  // Open dashboard/index.html locally or host it anywhere (GitHub Pages, etc.)
  // then paste the URL here.
  dashboardUrl: 'https://isaaclandin.github.io/youtubeminus/dashboard',
};
// ─────────────────────────────────────────────────────────────────────────────
