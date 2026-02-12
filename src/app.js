// src/app.js
const express = require("express");
const { PORT } = require("./config/env");
const webhookRoutes = require("./routes/webhook.routes");
const { logStartup } = require("./utils/logger");

function createApp() {
  const app = express();

  app.use(
    express.json({
      verify: (req, res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  app.get("/", (req, res) => res.status(200).send("OK"));

  // ✅ OJO: aquí va el router
  app.use(webhookRoutes);

  return app;
}

function startServer() {
  const app = createApp();
  app.listen(PORT, "0.0.0.0", () => logStartup(PORT));
}

module.exports = { createApp, startServer };
