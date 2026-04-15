// YouTubeMinus — configuration template
// Copy this file to config.js and fill in the values.
// config.js is gitignored and must NEVER be committed.

const YTM_CONFIG = {
  supabaseUrl:  'https://tcyoaqqhnlibjmmukexh.supabase.co',
  supabaseKey:  'SUPABASE_ANON_KEY_HERE',   // safe to expose — controlled by RLS

  resendKey:    'RESEND_API_KEY_HERE',       // re_… — keep secret
  resendFrom:   'YouTubeMinus <onboarding@resend.dev>',

  jennaEmail:   'JENNA_EMAIL_HERE',
  isaacEmail:   'ISAAC_EMAIL_HERE',

  dashboardUrl: 'DASHBOARD_URL_HERE',
};
