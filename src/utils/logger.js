function logStartup(port) {
  console.log(`✅ Webhook activo en http://localhost:${port}/webhook`);
}

function logIncoming(req) {
  console.log("✅ POST /webhook recibido");
  console.log("HEADERS:", req.headers);
  try {
    console.log("BODY:", JSON.stringify(req.body));
  } catch {
    console.log("BODY: (no se pudo convertir a JSON)");
  }
}

module.exports = { logStartup, logIncoming };
