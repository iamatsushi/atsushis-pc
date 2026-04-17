// pb_hooks/guestbook_verify.pb.js
// Server-side Altcha proof-of-work verification for guestbook submissions.
// Runs on every guestbook beforeCreate event; rejects any POST that does not
// carry a valid, HMAC-signed Altcha payload.
//
// Verified against PocketBase 0.28.2 API:
//   $app.onRecordBeforeCreateRequest(handler, 'collection')
//   $security.sha256(text)         → hex SHA-256 string
//   $security.hs256(text, key)     → hex HMAC-SHA256 string
//   $os.getenv(key)                → environment variable string
//   throw new BadRequestError(msg) → 400 response
//   e.next()                       → proceed with record creation
//
// atob() and Buffer are NOT available in PocketBase's goja runtime.
// base64Decode() below is a pure-JS implementation.
//
// Challenge protocol (mirrors altcha-server.py exactly):
//   challenge  = SHA-256(salt + number)         ← client brute-forces number
//   signature  = HMAC-SHA256(secret, challenge) ← proves challenge came from our server
//
// Required: 'altcha' text field in guestbook collection (stores the encoded payload).
// Required: ALTCHA_HMAC_SECRET env var — loaded via EnvironmentFile in pocketbase.service.
//
// Deploy:
//   cp pb_hooks/guestbook_verify.pb.js /home/atsushi/pocketbase/pb_hooks/
//   sudo systemctl restart pocketbase

// ---------------------------------------------------------------------------
// Pure-JS base64 decoder — atob() is not available in PocketBase's JS runtime
// ---------------------------------------------------------------------------

function base64Decode(str) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  var out = '';
  // Strip any characters that are not valid base64
  str = str.replace(/[^A-Za-z0-9+/=]/g, '');
  var i = 0;
  while (i < str.length) {
    var e1 = chars.indexOf(str.charAt(i++));
    var e2 = chars.indexOf(str.charAt(i++));
    var e3 = chars.indexOf(str.charAt(i++));
    var e4 = chars.indexOf(str.charAt(i++));
    var c1 = (e1 << 2) | (e2 >> 4);
    var c2 = ((e2 & 15) << 4) | (e3 >> 2);
    var c3 = ((e3 & 3) << 6) | e4;
    out += String.fromCharCode(c1);
    if (e3 !== 64) { out += String.fromCharCode(c2); }
    if (e4 !== 64) { out += String.fromCharCode(c3); }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Guestbook beforeCreate hook
// ---------------------------------------------------------------------------

$app.onRecordBeforeCreateRequest(function (e) {
  // 1. Read the submitted Altcha payload
  var payload = e.record.get('altcha');
  if (!payload) {
    throw new BadRequestError('Missing Altcha payload');
  }

  // 2. Decode base64 → JSON
  var decoded;
  try {
    decoded = JSON.parse(base64Decode(String(payload)));
  } catch (_) {
    throw new BadRequestError('Invalid Altcha payload');
  }

  var algorithm = decoded.algorithm;
  var challenge = decoded.challenge;
  var number    = decoded.number;
  var salt      = decoded.salt;
  var signature = decoded.signature;

  // 3. Ensure all required fields are present
  if (!algorithm || !challenge || number === undefined || !salt || !signature) {
    throw new BadRequestError('Incomplete Altcha payload');
  }

  // 4. Only SHA-256 is supported (matches altcha-server.py)
  if (algorithm !== 'SHA-256') {
    throw new BadRequestError('Unsupported Altcha algorithm: ' + algorithm);
  }

  // 5. Re-derive and verify the challenge: SHA-256(salt + number)
  var expectedChallenge = $security.sha256(salt + String(number));
  if (expectedChallenge !== challenge) {
    throw new BadRequestError('Altcha challenge mismatch');
  }

  // 6. Re-derive and verify the HMAC signature: HMAC-SHA256(secret, challenge)
  //    $security.hs256(text, key) — text is the message, key is the HMAC secret
  var secret = $os.getenv('ALTCHA_HMAC_SECRET');
  if (!secret) {
    // Secret not configured — fail closed rather than silently accepting submissions
    throw new Error('ALTCHA_HMAC_SECRET is not set in the environment');
  }

  var expectedSignature = $security.hs256(challenge, secret);
  if (expectedSignature !== signature) {
    throw new BadRequestError('Altcha signature invalid');
  }

  // All checks passed — proceed with record creation
  e.next();

}, 'guestbook');
