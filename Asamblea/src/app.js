// src/app.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const { PORT } = require("./config/env");
const webhookRoutes = require("./routes/webhook.routes");
const { logStartup } = require("./utils/logger");

function createApp() {
  const app = express();

  // Permitir peticiones desde cualquier origen (ej. frontend React)
  app.use(cors());

  app.use(
    express.json({
      verify: (req, res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  app.get("/", (req, res) => res.status(200).send("OK"));

  app.get("/health", async (req, res) => {
    res.json({
      status: "up",
      timestamp: new Date().toISOString(),
      env_loaded: Object.keys(process.env).length > 20
    });
  });

  // ✅ OJO: aquí va el router principal
  app.use(webhookRoutes);

  return app;
}

function startServer() {
  const app = createApp();
  const server = http.createServer(app);

  server.listen(PORT, "0.0.0.0", () => logStartup(PORT));
}

module.exports = { createApp, startServer };
