// @ts-nocheck — Deno runtime globals not in standard TS lib

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function sendInviteMessage(chatId: string, text: string, buttonText: string, inviteUrl: string) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: buttonText, url: inviteUrl },
        ]],
      },
    }),
  });
  if (!r.ok) console.error('[send-invite] telegram error:', await r.text());
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('ok', { headers: CORS });

  // Verify the caller is a logged-in user
  const authHeader = req.headers.get('Authorization') ?? '';
  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  let body: { partnerEmail?: string; appUrl?: string; role?: string };
  try { body = await req.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { partnerEmail, appUrl, role = 'primary' } = body;
  if (!partnerEmail || !appUrl) return json({ error: 'Missing partnerEmail or appUrl' }, 400);
  if (role !== 'primary' && role !== 'co_approver') return json({ error: 'Invalid role' }, 400);

  // Can't invite yourself
  if (user.email?.toLowerCase() === partnerEmail.toLowerCase()) {
    return json({ error: "You can't invite yourself." }, 400);
  }

  // Look up owner's display name
  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();
  const ownerName = ownerProfile?.display_name || user.email?.split('@')[0] || 'Someone';

  // Look up partner profile by email
  const { data: partnerProfile } = await supabase
    .from('profiles')
    .select('id, telegram_chat_id')
    .eq('email', partnerEmail.toLowerCase())
    .maybeSingle();

  // Check not already partnered (only for primary — co-approver can also be primary)
  if (role === 'primary' && partnerProfile) {
    const { data: alreadyPartner } = await supabase
      .from('relationships')
      .select('id')
      .eq('owner_id', user.id)
      .eq('partner_id', partnerProfile.id)
      .neq('status', 'dissolved')
      .maybeSingle();
    if (alreadyPartner) return json({ error: 'This person is already your partner.' }, 400);
  }

  // Generate invite token
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600_000).toISOString();
  const inviteUrl = `${appUrl}/invite/${token}`;

  const { error: tokenError } = await supabase.from('invite_tokens').insert({
    owner_id:   user.id,
    token,
    role,
    used:       false,
    expires_at: expiresAt,
  });

  if (tokenError) {
    console.error('[send-invite] token insert error:', tokenError);
    return json({ error: 'Failed to create invite token' }, 500);
  }

  // Build role-appropriate message text and button label
  const isCoApprover = role === 'co_approver';
  const telegramText = isCoApprover
    ? `🤝 *${ownerName} invited you to be their co-approver*\n\nYou'll receive escalated YouTube watch requests when their primary partner hasn't responded after 15 minutes.`
    : `🤝 *${ownerName} invited you to be their accountability partner*\n\nYou'll review their YouTube watch requests and approve or deny them.`;
  const buttonText = isCoApprover ? '✅ Accept as Co-approver' : '✅ Accept Partnership';

  // If partner has Telegram — send message with inline button
  if (partnerProfile?.telegram_chat_id) {
    await sendInviteMessage(partnerProfile.telegram_chat_id, telegramText, buttonText, inviteUrl);
    return json({ ok: true, method: 'telegram' });
  }

  // Existing user but no Telegram — return the link so the owner can send it manually
  if (partnerProfile) {
    return json({ ok: true, method: 'link', inviteUrl });
  }

  // New user — send Supabase invite email
  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(partnerEmail, {
    redirectTo: inviteUrl,
  });

  if (inviteError) {
    console.error('[send-invite] invite email error:', inviteError);
    return json({ error: 'Failed to send invite email' }, 500);
  }

  return json({ ok: true, method: 'email' });
});
