// lib/publicPair.js — Public pairing code issuer + DM handler.

import { default as makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { isOwner } from '../utils/helpers.js';

const SESSIONS_DIR = './sessions';
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const activePairings = new Map();

export function normalizePhone(input) {
  return String(input || '').replace(/[^\d]/g, '');
}

export async function issuePairingCode(mainSock, requesterJid, rawPhone) {
  const phone = normalizePhone(rawPhone);
  const NL = String.fromCharCode(10);

  if (!phone || phone.length < 8 || phone.length > 15) {
    await mainSock.sendMessage(requesterJid, {
      text: '❌ *Invalid number.*' + NL + NL +
            'Send your full international number with country code, e.g.' + NL +
            '`2348142656848` or `+2348142656848`'
    });
    return;
  }

  if (activePairings.has(phone)) {
    await mainSock.sendMessage(requesterJid, {
      text: '⏳ A pairing code was already sent for *' + phone + '*.' + NL +
            'Please wait for it to expire (90s) before requesting again.'
    });
    return;
  }

  const sessionPath = path.join(SESSIONS_DIR, phone);
  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true, force: true });
  }

  console.log('🔧 Spawning pairing socket for ' + phone + '...');

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const childSock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  childSock.ev.on('creds.update', saveCreds);

  await new Promise(r => setTimeout(r, 3000));

  let code;
  try {
    code = await childSock.requestPairingCode(phone);
  } catch (e) {
    console.error('❌ requestPairingCode failed for ' + phone + ':', e.message);
    await mainSock.sendMessage(requesterJid, {
      text: '❌ Could not generate a pairing code right now. Try again in a minute.'
    });
    try { childSock.end(); } catch {}
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    }
    return;
  }

  const formatted = code.match(/.{1,4}/g)?.join('-') || code;

  const message =
    '╭━━━━━━━━━━━━━━━━━━━━╮' + NL +
    '┃  🔗 YOUR PAIRING CODE  ┃' + NL +
    '╰━━━━━━━━━━━━━━━━━━━━╯' + NL + NL +
    '📱 *For number:* ' + phone + NL + NL +
    '👉 *Tap to copy:*' + NL +
    '```' + code + '```' + NL + NL +
    '*Formatted:* `' + formatted + '`' + NL + NL +
    '━━━━━━━━━━━━━━━━━━━━━━' + NL +
    '*How to use:*' + NL +
    '1️⃣  Open WhatsApp on your phone' + NL +
    '2️⃣  Settings → Linked Devices' + NL +
    '3️⃣  Tap *Link a Device*' + NL +
    '4️⃣  Tap *Link with phone number instead*' + NL +
    '5️⃣  Paste the 8 characters above' + NL +
    '━━━━━━━━━━━━━━━━━━━━━━' + NL + NL +
    '⏱  *Expires in 90 seconds.*' + NL +
    '⚠️  Never share this code with anyone else.';

  await mainSock.sendMessage(requesterJid, { text: message });
  console.log('✅ Pairing code sent to ' + requesterJid + ' for number ' + phone);

  const timeout = setTimeout(() => {
    console.log('🧹 Cleaning up unused pairing session for ' + phone);
    try { childSock.end(); } catch {}
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    }
    activePairings.delete(phone);
  }, 90 * 1000);

  childSock.ev.on('connection.update', (u) => {
    if (u.connection === 'open') {
      clearTimeout(timeout);
      activePairings.delete(phone);
      console.log('🎉 ' + phone + ' completed pairing — session persisted at ' + sessionPath);
      mainSock.sendMessage(requesterJid, {
        text: '✅ *Pairing successful!*' + NL +
              'Your number *' + phone + '* is now linked.' + NL +
              'You can close this chat — your session is saved.'
      }).catch(() => {});
    }
  });

  activePairings.set(phone, { sock: childSock, timeout });
}

export async function handlePublicPairRequest(sock, msg, from, sender, text) {
  if (from.endsWith('@g.us') || from === 'status@broadcast') return false;
  if (isOwner(sender)) return false;
  if (!text) return false;

  const cleaned = normalizePhone(text);

  const looksLikeNumber =
    /^[\s+\-()0-9]{8,20}$/.test(text.trim()) &&
    cleaned.length >= 8 &&
    cleaned.length <= 15;

  if (!looksLikeNumber) return false;

  await issuePairingCode(sock, from, cleaned);
  return true;
}
