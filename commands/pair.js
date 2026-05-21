// commands/pair.js — owner can issue codes via .pair <number>;
// any user can DM the bot with just their number to get a code.

import { issuePairingCode, normalizePhone } from '../lib/publicPair.js';
import { isOwner } from '../utils/helpers.js';

// Owner-triggered: .pair 2348142656848
export async function cmdPair(sock, msg, from, args) {
  const phone = args[0];
  if (!phone) {
    await sock.sendMessage(from, {
      text: '⚙️ Usage: `.pair <number>`' + String.fromCharCode(10) +
            'Example: `.pair 2348142656848`'
    });
    return;
  }
  await issuePairingCode(sock, from, phone);
}

// Public-triggered: any DM that looks like a phone number
export async function handlePublicPairRequest(sock, msg, from, sender, text) {
  // Only act in DMs, never in groups or status
  if (from.endsWith('@g.us') || from === 'status@broadcast') return false;

  // Owner uses .pair — skip auto-detection for them
  if (isOwner(sender)) return false;

  const cleaned = normalizePhone(text);

  // Heuristic: 8–15 digits, and the trimmed text is mostly digits/+/spaces
  const looksLikeNumber = /^[\s+\-()0-9]{8,20}$/.test(text.trim()) && cleaned.length >= 8;
  if (!looksLikeNumber) return false;

  await issuePairingCode(sock, from, cleaned);
  return true; // signal that we handled this message
}
