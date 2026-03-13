const crypto = require("crypto");
const { APP_SECRET } = require("../config/env");

function safeEqual(a, b) {
  try {
    const aa = Buffer.from(a);
    const bb = Buffer.from(b);
    if (aa.length !== bb.length) return false;
    return crypto.timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

function verifyMetaSignature(req) {
  if (!APP_SECRET) return true;

  const sig256 = req.get("X-Hub-Signature-256") || "";
  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", APP_SECRET)
      .update(req.rawBody)
      .digest("hex");

  const ok = safeEqual(sig256, expected);
  if (!ok) {
    console.log("❌ Firma inválida (X-Hub-Signature-256).");
  }
  return ok;
}

module.exports = { verifyMetaSignature };
