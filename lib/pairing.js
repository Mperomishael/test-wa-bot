// lib/pairing.js — Pairing code generator (Option 1)
// Prints an 8-digit code to terminal/deploy logs.
// User enters it in WhatsApp → Linked Devices → Link with phone number instead.

export async function setupPairing(sock, ownerNumber) {
  // If already authenticated, do nothing — never re-pair on every restart
  if (sock.authState.creds.registered) return;

  // Strip @s.whatsapp.net, +, spaces, dashes — Baileys wants pure digits
  const phone = String(ownerNumber).replace(/[^\d]/g, '');
  if (!phone || phone.length < 8) {
    console.error('❌ Invalid phone number for pairing:', ownerNumber);
    return;
  }

  // Wait briefly so the WebSocket has time to open before requesting code
  await new Promise(r => setTimeout(r, 3000));

  try {
    const code = await sock.requestPairingCode(phone);
    const formatted = code.match(/.{1,4}/g)?.join('-') || code;

    const NL = String.fromCharCode(10);
    console.log(NL + '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮');
    console.log('┃   🔗 PAIRING CODE READY     ┃');
    console.log('┃                              ┃');
    console.log('┃   👉  ' + formatted.padEnd(20) + '┃');
    console.log('┃                              ┃');
    console.log('╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯' + NL);
    console.log('📱 On your phone:');
    console.log('   1. Open WhatsApp');
    console.log('   2. Settings → Linked Devices');
    console.log('   3. Link a Device');
    console.log('   4. Tap "Link with phone number instead"');
    console.log('   5. Enter the 8 characters above (ignore the dash)');
    console.log('   ⏱  Code expires in ~60 seconds — be quick!' + NL);
  } catch (e) {
    console.error('❌ Pairing code generation failed:', e.message);
    console.error('   Falling back to QR code — scan it instead.');
  }
}
