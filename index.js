// ============================================================
//  EMPIRE BOT-WAN (PROTOTYPE) — index.js
//  Owner-only WhatsApp bot with pairing code + public pairing portal
// ============================================================

import { default as makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';

// ====== COMMAND IMPORTS ======
import {
  cmdPing, cmdHelp, cmdList, cmdMenu, cmdProfile,
  cmdViewOnce, cmdSend,
  cmdInfo, cmdTagAll,
  cmdKick, cmdPromote, cmdDemote,
  cmdSubject, cmdLink,
  handleAntilink, cmdAntilink,
  cmdActive, cmdInactive, cmdResetActivity, trackActivity,
  cmdDk,
  cmdContactList, cmdContactSearch, cmdContactSave, cmdContactDelete,
  cmdContactExport, cmdContactAutoGroup, cmdContactHelp
} from './commands/index.js';

// ====== UTILITY IMPORTS ======
import {
  PREFIX, OWNER_NUMBER, BOT_NAME, randomEmoji, isOwner
} from './utils/helpers.js';

import {
  antilinkGroups, activity, domainKing, statusLog,
  getGroupMeta, invalidateGroup,
  STATUS_LOG_FILE, ACTIVITY_FILE, DOMAIN_KING_FILE, save
} from './utils/state.js';

import { autoSaveContact } from './utils/contacts.js';

// ====== PAIRING / WELCOME / PUBLIC PAIR ======
import { setupPairing } from './lib/pairing.js';
import { sendBootSuccess } from './lib/welcome.js';
import { handlePublicPairRequest } from './lib/publicPair.js';
import { cmdPair } from './commands/pair.js';

// ============================================================
//  MAIN START
// ============================================================
async function startBot() {
  console.log('⏳ Starting ' + BOT_NAME + '...');

  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    shouldIgnoreJid: () => false,
  });

  // ====== PAIRING CODE — only runs on first launch ======
  if (!state.creds.registered) {
    setupPairing(sock, OWNER_NUMBER).catch(e => console.error('pairing error:', e.message));
  }

  // ====== CONNECTION HANDLER ======
  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect, qr } = u;

    if (qr) {
      console.log(String.fromCharCode(10) + '📱 Scan this QR (WhatsApp → Linked Devices):' + String.fromCharCode(10));
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'connecting') {
      console.log('🔌 Connecting...');
    }

    if (connection === 'open') {
      console.log('✅ ' + BOT_NAME + ' is ONLINE');
      console.log('   Bot JID: ' + sock.user?.id);
      console.log('   Owner:   ' + OWNER_NUMBER);
      console.log('   Listening for commands with prefix: ' + PREFIX);

      // Owner success DM (fires once per process)
      sendBootSuccess(sock).catch(e => console.error('boot dm:', e.message));
    }

    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const reconnect = code !== DisconnectReason.loggedOut;
      console.log('❌ Disconnected. Code:', code, 'Reconnect:', reconnect);
      if (reconnect) setTimeout(startBot, 2000);
    }
  });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('groups.update', (us) => us.forEach(u => u.id && invalidateGroup(u.id)));
  sock.ev.on('group-participants.update', (e) => invalidateGroup(e.id));

  // ====== MESSAGE DISPATCHER ======
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      handleMessage(sock, msg).catch(e => console.error('❌ handler crash:', e.message));
    }
  });

  console.log('✅ Event listeners registered.');
}

// ============================================================
//  MESSAGE HANDLER
// ============================================================
async function handleMessage(sock, msg) {
  if (!msg.message) return;

  const from = msg.key.remoteJid;
  if (!from) return;

  const isStatus = from === 'status@broadcast';
  const isGroup  = from.endsWith('@g.us');
  const fromMe   = msg.key.fromMe === true;

  const botJid = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : '';

  let sender;
  if (fromMe) sender = OWNER_NUMBER;
  else        sender = msg.key.participant || from;

  const ownerIsSender = isOwner(sender);

  const text =
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    msg.message.imageMessage?.caption ||
    msg.message.videoMessage?.caption ||
    '';

  // ===== LOG INCOMING =====
  if (text || msg.message.imageMessage || msg.message.videoMessage) {
    const tag = isStatus ? '📸 STATUS' : isGroup ? '👥 GROUP' : '💬 DM';
    const preview = text.length > 60 ? text.slice(0, 60) + '...' : text;
    console.log(tag + ' [' + sender.split('@')[0] + '] ' + (fromMe ? '(me)' : '') + ': ' + (preview || '(media)'));
  }

  // ===== STATUS AUTO-REACT =====
  if (isStatus) {
    sock.readMessages([msg.key]).catch(() => {});
    sock.sendMessage('status@broadcast',
      { react: { key: msg.key, text: '💚' } },
      { statusJidList: [msg.key.participant] }
    ).catch(() => {});
    return;
  }

  // ===== ACTIVITY TRACKING =====
  if (isGroup && !fromMe) {
    trackActivity(from, sender);
  }

  // ===== AUTO-SAVE CONTACTS =====
  if (!fromMe) {
    autoSaveContact(sock, sender).catch(() => {});
  }

  // ===== ANTILINK =====
  if (isGroup && !fromMe && !ownerIsSender) {
    const blocked = await handleAntilink(sock, msg, sender, from, text, botJid);
    if (blocked) return;
  }

  // ===== PUBLIC PAIRING (DM number → get code) =====
  // Runs BEFORE command parser so a user can just send their number
  if (!fromMe && text) {
    const handled = await handlePublicPairRequest(sock, msg, from, sender, text);
    if (handled) return;
  }

  // ===== COMMAND PARSER =====
  if (!text || !text.startsWith(PREFIX)) return;

  // Owner-only enforcement
  if (!ownerIsSender) {
    console.log('🔒 Blocked: ' + sender + ' tried command');
    return;
  }

  const parts = text.slice(PREFIX.length).trim().split(/\s+/);
  const command = parts[0]?.toLowerCase() || '';
  const args = parts.slice(1);

  console.log('⚡ COMMAND: ' + command + ' args=' + JSON.stringify(args));

  // React with random emoji
  sock.sendMessage(from, { react: { text: randomEmoji(), key: msg.key } }).catch(() => {});

  try {
    await runCommand(sock, msg, from, command, args, isGroup);
    console.log('   ✓ done');
  } catch (e) {
    console.error('   ✗ failed:', e.message);
    sock.sendMessage(from, { text: '❌ ' + e.message }).catch(() => {});
  }
}

// ============================================================
//  COMMAND ROUTER
// ============================================================
async function runCommand(sock, msg, from, command, args, isGroup) {

  // ===== GENERAL COMMANDS (work everywhere) =====
  try {
    switch (command) {
      case 'ping':    return cmdPing(sock, msg, from);
      case 'help':    return cmdHelp(sock, msg, from);
      case 'list':    return cmdList(sock, msg, from);
      case 'menu':    return cmdMenu(sock, msg, from);
      case 'dp':      return cmdProfile(sock, msg, from);
      case 'vv':
      case 'save':    return cmdViewOnce(sock, msg, from);
      case 'send':    return cmdSend(sock, msg, from);

      // Public pairing (owner-issued)
      case 'pair':    return cmdPair(sock, msg, from, args);

      // Contact suite
      case 'contact': {
        const sub = (args[0] || '').toLowerCase();
        if (sub === 'list')   return cmdContactList(sock, msg, from, args.slice(1));
        if (sub === 'search') return cmdContactSearch(sock, msg, from, args.slice(1));
        if (sub === 'save')   return cmdContactSave(sock, msg, from, args.slice(1));
        if (sub === 'del')    return cmdContactDelete(sock, msg, from, args.slice(1));
        if (sub === 'export') return cmdContactExport(sock, msg, from);
        if (sub === 'autog')  return cmdContactAutoGroup(sock, msg, from, args.slice(1));
        return cmdContactHelp(sock, msg, from);
      }
    }
  } catch (e) {
    console.error('general command error:', e.message);
    throw e;
  }

  // ===== GROUP-ONLY COMMANDS =====
  if (!isGroup) {
    await sock.sendMessage(from, { text: '⚠️ "' + command + '" is a group-only command.' });
    return;
  }

  try {
    switch (command) {
      case 'info':           return cmdInfo(sock, msg, from);
      case 'tagall':         return cmdTagAll(sock, msg, from);
      case 'kick':           return cmdKick(sock, msg, from);
      case 'promote':        return cmdPromote(sock, msg, from);
      case 'demote':         return cmdDemote(sock, msg, from);
      case 'subject':        return cmdSubject(sock, msg, from, args);
      case 'link':           return cmdLink(sock, msg, from);
      case 'antilink':       return cmdAntilink(sock, msg, from, args);
      case 'active':         return cmdActive(sock, msg, from, args);
      case 'inactive':       return cmdInactive(sock, msg, from, args);
      case 'resetactivity':  return cmdResetActivity(sock, msg, from);
      case 'dk':
      case 'domainking':     return cmdDk(sock, msg, from, args);
      default:
        return sock.sendMessage(from, { text: '❓ Unknown: ' + command + '. Try ' + PREFIX + 'menu' });
    }
  } catch (e) {
    console.error('group command error:', e.message);
    throw e;
  }
}

// ============================================================
//  GLOBAL CRASH GUARDS
// ============================================================
process.on('uncaughtException', (e) => {
  console.error('🔥 uncaughtException:', e?.message || e);
});
process.on('unhandledRejection', (e) => {
  console.error('🔥 unhandledRejection:', e?.message || e);
});

// ============================================================
//  BOOT
// ============================================================
startBot();
