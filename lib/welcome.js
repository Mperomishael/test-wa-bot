// lib/welcome.js — Sends a confirmation DM to the owner once the bot connects.
// Only fires on the FIRST successful 'open' event per process to avoid spam on reconnects.

import { BOT_NAME, OWNER_NUMBER, PREFIX } from '../utils/helpers.js';

let alreadySent = false;

export async function sendBootSuccess(sock) {
  if (alreadySent) return;
  alreadySent = true;

  const NL = String.fromCharCode(10);
  const now = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Lagos' });

  const text =
    '╭━━━━━━━━━━━━━━━━━━━━╮' + NL +
    '┃  ✅ PAIRING SUCCESS  ┃' + NL +
    '╰━━━━━━━━━━━━━━━━━━━━╯' + NL + NL +
    '👑 Welcome back, Boss.' + NL + NL +
    '🤖 *Bot:* ' + BOT_NAME + NL +
    '🔗 *Status:* Online & Listening' + NL +
    '⚡ *Prefix:* ' + PREFIX + NL +
    '🆔 *Bot JID:* ' + (sock.user?.id || 'unknown') + NL +
    '👤 *Owner:* ' + OWNER_NUMBER.split('@')[0] + NL +
    '🕒 *Connected:* ' + now + NL + NL +
    '━━━━━━━━━━━━━━━━━━━━━━' + NL +
    'Type *' + PREFIX + 'menu* to see all commands.' + NL +
    'Type *' + PREFIX + 'pair <number>* to issue a pairing code to a user.' + NL +
    '━━━━━━━━━━━━━━━━━━━━━━';

  // Small delay so the socket fully stabilises before sending
  await new Promise(r => setTimeout(r, 2500));

  try {
    await sock.sendMessage(OWNER_NUMBER, { text });
    console.log('📬 Boot success DM sent to owner.');
  } catch (e) {
    console.error('❌ Could not send boot DM:', e.message);
  }
}
