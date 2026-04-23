const express = require("express");
const http = require("http");
const cors = require("cors");
const { PORT } = require("./config/env");
const { initSockets } = require("./services/socket.service");
const { logStartup } = require("./utils/logger");

function createApp() {
    const app = express();

    app.use(cors());
    app.use(express.json({
        verify: (req, res, buf) => {
            req.rawBody = buf;
        },
    }));

    app.get("/", (req, res) => res.status(200).send("COMERCIAL BOT OK"));
    app.get("/api/health", (req, res) => res.json({ status: "up", bot: "comercial" }));

    // Cargar rutas
    try {
        const webhookRoutes = require("./routes/webhook.routes");
        const monitoringRoutes = require("./routes/monitoring.routes");
        app.use(webhookRoutes);
        app.use(monitoringRoutes);
    } catch (e) {
        console.warn("⚠️ Routes failed to load in Comercial. Using fallback.");
    }

    return app;
}

function startServer() {
    const app = createApp();
    const server = http.createServer(app);

    // Inicializar Sockets
    initSockets(server);

    server.listen(PORT, "0.0.0.0", () => logStartup(PORT));
}

module.exports = { createApp, startServer };
