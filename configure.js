// configure.js — Central user-editable config.
// Edit this file OR set environment variables on your host (env vars win).

import 'dotenv/config';

// Helper: env var → boolean
const bool = (v, def = false) => {
  if (v === undefined || v === null) return def;
  return String(v).toLowerCase() === 'true' || v === '1';
};

const config = {
  // ============ IDENTITY ============
  bot: {
    name:    process.env.BOT_NAME    || 'EMPIRE BOT-WAN (PROTOTYPE)',
    prefix:  process.env.PREFIX      || '.',
    owner:   process.env.OWNER_NUMBER|| '2348142656848',  // digits only, no @s.whatsapp.net
    private: bool(process.env.BOT_PRIVATE, true),         // true = owner-only commands
    timezone:process.env.TIMEZONE    || 'Africa/Lagos',
  },

  // ============ SESSION ============
  session: {
    // SESSION_ID is the encoded auth_info pasted by deployed users.
    // If empty, bot will trigger pairing-code flow on startup.
    id: process.env.SESSION_ID || '',
    folder: process.env.SESSION_FOLDER || 'auth_info',
  },

  // ============ WEB PORTAL ============
  web: {
    enabled: bool(process.env.WEB_ENABLED, true),
    port:    parseInt(process.env.PORT || '3000', 10),
    host:    process.env.HOST || '0.0.0.0',
    publicUrl: process.env.PUBLIC_URL || '',  // e.g. https://yourbot.onrender.com
  },

  // ============ FEATURE TOGGLES ============
  features: {
    autoStatusReact:   bool(process.env.AUTO_STATUS_REACT, true),
    autoStatusEmoji:   process.env.AUTO_STATUS_EMOJI || '💚',
    autoSaveContacts:  bool(process.env.AUTO_SAVE_CONTACTS, true),
    activityTracking:  bool(process.env.ACTIVITY_TRACKING, true),
    antilink:          bool(process.env.ANTILINK, true),
    domainKing:        bool(process.env.DOMAIN_KING, true),
    autoMind:          bool(process.env.AUTO_MIND, false),
    publicPairing:     bool(process.env.PUBLIC_PAIRING, true),
    welcomeDM:         bool(process.env.WELCOME_DM, true),
  },

  // ============ THIRD-PARTY API KEYS ============
  apis: {
    openai:      process.env.OPENAI_API_KEY      || '',
    gemini:      process.env.GEMINI_API_KEY      || '',
    removebg:    process.env.REMOVEBG_API_KEY    || '',
    rapidapi:    process.env.RAPIDAPI_KEY        || '',
    weather:     process.env.WEATHER_API_KEY     || '',
    mongoUri:    process.env.MONGO_URI           || '',  // for persistent auth state
  },

  // ============ RESPONSE TEMPLATES ============
  // Use {placeholders} — they'll be replaced at runtime
  templates: {
    welcomeDM:
      '╭━━━━━━━━━━━━━━━━━━━━╮\n' +
      '┃  ✅ PAIRING SUCCESS  ┃\n' +
      '╰━━━━━━━━━━━━━━━━━━━━╯\n\n' +
      '👑 Welcome back, Boss.\n\n' +
      '🤖 *Bot:* {botName}\n' +
      '⚡ *Prefix:* {prefix}\n' +
      '🆔 *JID:* {jid}\n' +
      '🕒 *Time:* {time}\n\n' +
      'Type *{prefix}menu* to begin.',

    publicPairCode:
      '╭━━━━━━━━━━━━━━━━━━━━╮\n' +
      '┃  🔗 YOUR PAIRING CODE  ┃\n' +
      '╰━━━━━━━━━━━━━━━━━━━━╯\n\n' +
      '📱 *Number:* {phone}\n\n' +
      '👉 *Tap to copy:*\n```{code}```\n\n' +
      '*Formatted:* `{formatted}`\n\n' +
      'WhatsApp → Linked Devices → Link with phone number',

    antilinkWarning:
      '⚠️ *Link detected!*\n@{user}, links are not allowed here.\n_Strike {strike}/3._',

    kickedForLink:
      '🚫 @{user} removed for repeated link violations.',

    botDetected:
      '👑 *Domain King:* rival bot detected.\n@{user} has been removed.',

    helpFooter:
      '\n\n━━━━━━━━━━━━━━━━━━━━━━\n_Powered by {botName}_',
  },

  // ============ LIMITS ============
  limits: {
    metadataCacheTTL: 5 * 60 * 1000,        // 5 minutes
    pairingCodeTTL:   90 * 1000,            // 90 seconds
    autoMindMaxEntries: 500,
    autoMindSimilarity: 0.4,
    autoMindDedup: 0.85,
    domainKingStrikes: 3,
  },
};

// Computed convenience exports (saves repeated string-building elsewhere)
config.bot.ownerJid = config.bot.owner.replace(/\D/g, '') + '@s.whatsapp.net';

export default config;
export const {
  bot, session, web, features, apis, templates, limits
} = config;
