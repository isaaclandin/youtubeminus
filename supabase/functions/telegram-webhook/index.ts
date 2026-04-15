// @ts-nocheck — Deno runtime globals (Deno.serve, Deno.env) are not in the
// standard TS lib. This file runs in Supabase's Deno environment, not Node.

// Supabase Edge Function — telegram-webhook
//
// Handles two event types from Telegram:
//   1. callback_query — Jenna taps approve/deny buttons on a request message
//   2. message /start [code] — user linking their Telegram account to the web app

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BOT_TOKEN  = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const ISAAC_CHAT = Deno.env.get('ISAAC_CHAT_ID')!;

// Service role client — bypasses RLS for profile updates and code lookups
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// ── Shared helpers ────────────────────────────────────────────────────────────

const DURATION_LABELS: Record<string, string> = {
  '1_day':  '1 day',
  '1_week': '1 week',
};

function expiresAt(durationType: string): string {
  const now = Date.now();
  const map: Record<string, number> = {
    '1_day':  now + 24 * 3_600_000,
    '1_week': now + 7 * 24 * 3_600_000,
  };
  return new Date(map[durationType] ?? now + 24 * 3_600_000).toISOString();
}

async function tg(method: string, body: object) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!r.ok) console.error(`[tg] ${method} failed:`, await r.text());
  return r;
}

async function sendMessage(chatId: number | string, text: string, extra?: object) {
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown', ...extra });
}

async function editMessage(chatId: number, messageId: number, text: string) {
  const r = await tg('editMessageCaption', { chat_id: chatId, message_id: messageId, caption: text });
  if (!r.ok) await tg('editMessageText', { chat_id: chatId, message_id: messageId, text });
}

// ── /start [code] handler ─────────────────────────────────────────────────────

async function handleStartCommand(chatId: number, text: string) {
  // Telegram sends "/start CODE" or just "/start" when user clicks deep link
  const parts = text.trim().split(/\s+/);
  const code  = parts[1]?.toUpperCase();

  if (!code) {
    await sendMessage(chatId,
      'Welcome to YTMinus! 👋\n\nTo link your account, go to the web app and follow the Telegram connection steps.');
    return;
  }

  // Look up the code
  const { data: codeRow, error: codeErr } = await supabase
    .from('telegram_link_codes')
    .select('*')
    .eq('code', code)
    .single();

  if (codeErr || !codeRow) {
    await sendMessage(chatId, '❌ Code not found. Please generate a new code from the web app.');
    return;
  }

  if (codeRow.used) {
    await sendMessage(chatId, '❌ This code has already been used. Generate a new one from the web app.');
    return;
  }

  if (new Date(codeRow.expires_at) < new Date()) {
    await sendMessage(chatId, '❌ This code has expired (15 minute limit). Generate a new one from the web app.');
    return;
  }

  // Update the user's profile with this chat_id
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ telegram_chat_id: String(chatId) })
    .eq('id', codeRow.user_id);

  if (profileErr) {
    console.error('[start] profile update error:', profileErr);
    await sendMessage(chatId, '❌ Something went wrong. Please try again.');
    return;
  }

  // Mark code as used
  await supabase
    .from('telegram_link_codes')
    .update({ used: true })
    .eq('id', codeRow.id);

  // Confirm to user
  await sendMessage(chatId,
    '✅ *Connected!*\n\nYou\'ll receive YouTube accountability notifications here. Your system is now active.');
}

// ── callback_query handler (approve/deny buttons) ─────────────────────────────

async function handleCallbackQuery(cb: Record<string, unknown>) {
  const cbId      = cb.id as string;
  const data      = cb.data as string;
  const message   = cb.message as Record<string, unknown>;
  const chatId    = (message.chat as Record<string, unknown>).id as number;
  const messageId = message.message_id as number;

  // Answer immediately so Telegram removes the loading spinner
  await tg('answerCallbackQuery', { callback_query_id: cbId });

  const [action, requestId, durationType] = data.split(':');

  // Look up the owner's telegram_chat_id via request → relationship → profile
  async function getOwnerChatId(reqId: string): Promise<string | null> {
    const { data } = await supabase
      .from('requests')
      .select('relationships!relationship_id(owner:profiles!owner_id(telegram_chat_id))')
      .eq('id', reqId)
      .single();
    const rel = (data as any)?.relationships;
    return rel?.owner?.telegram_chat_id ?? ISAAC_CHAT ?? null;
  }

  if (action === 'approve' && requestId && durationType) {
    const label = DURATION_LABELS[durationType] ?? durationType;

    const { error } = await supabase
      .from('requests')
      .update({
        status:        'approved',
        duration_type: durationType,
        approved_at:   new Date().toISOString(),
        expires_at:    expiresAt(durationType),
      })
      .eq('id', requestId)
      .eq('status', 'pending');

    if (error) {
      console.error('[approve] supabase error:', error);
      await editMessage(chatId, messageId, '❌ Database error — try again');
    } else {
      await editMessage(chatId, messageId, `✅ Approved — ${label}`);
      const ownerChatId = await getOwnerChatId(requestId);
      if (ownerChatId) await sendMessage(ownerChatId, `✅ *Request approved*\nDuration: ${label}`);
    }

  } else if (action === 'deny' && requestId) {
    const { error } = await supabase
      .from('requests')
      .update({ status: 'denied' })
      .eq('id', requestId)
      .eq('status', 'pending');

    if (error) {
      console.error('[deny] supabase error:', error);
      await editMessage(chatId, messageId, '❌ Database error — try again');
    } else {
      await editMessage(chatId, messageId, '🚫 Denied');
      const ownerChatId = await getOwnerChatId(requestId);
      if (ownerChatId) await sendMessage(ownerChatId, '🚫 *Request denied*');
    }
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response('ok');
  }

  try {
    // Route: callback_query (button taps)
    const cb = body.callback_query as Record<string, unknown> | undefined;
    if (cb) {
      await handleCallbackQuery(cb);
      return new Response('ok');
    }

    // Route: regular message
    const msg = body.message as Record<string, unknown> | undefined;
    if (msg) {
      const chatId = (msg.chat as Record<string, unknown>).id as number;
      const text   = (msg.text as string | undefined) ?? '';

      if (text.startsWith('/start')) {
        await handleStartCommand(chatId, text);
      }
      // Other messages are silently ignored
      return new Response('ok');
    }
  } catch (e) {
    console.error('[webhook] unhandled error:', e);
  }

  return new Response('ok');
});
