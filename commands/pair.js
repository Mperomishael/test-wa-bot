// commands/pair.js — owner-triggered: .pair <number>

import { issuePairingCode } from '../lib/publicPair.js';

export async function cmdPair(sock, msg, from, args) {
  const NL = String.fromCharCode(10);
  const phone = args[0];
  if (!phone) {
    await sock.sendMessage(from, {
      text: '⚙️ *Usage:* `.pair <number>`' + NL +
            '*Example:* `.pair 2348142656848`'
    });
    return;
  }
  await issuePairingCode(sock, from, phone);
}
