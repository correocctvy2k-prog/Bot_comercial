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
        limit: '50mb',
        verify: (req, res, buf) => {
            req.rawBody = buf;
        },
    }));

    app.get("/", (req, res) => res.status(200).send("COMERCIAL BOT OK - V2 (Monitoring)"));
    app.get("/api/health", (req, res) => res.json({ status: "up", bot: "comercial", version: "2.1" }));

    // Cargar rutas de Webhooks
    try {
        const webhookRoutes = require("./routes/webhook.routes");
        app.use(webhookRoutes);
    } catch (e) {
        console.error("❌ Error loading Webhook Routes:", e.message);
    }

    // Cargar rutas de Monitoreo
    try {
        const monitoringRoutes = require("./routes/monitoring.routes");
        app.use(monitoringRoutes);
        console.log("✅ Monitoring Routes loaded successfully");
    } catch (e) {
        console.error("❌ Error loading Monitoring Routes:", e.message);
    }

    // Health check específico para monitoreo
    app.get("/api/monitoring/check", (req, res) => res.json({ status: "active", module: "monitoring" }));

    return app;
}

const { startPingService } = require("./services/ping.service");

function startServer() {
    const app = createApp();
    const server = http.createServer(app);

    // Inicializar Sockets
    initSockets(server);
    
    // Iniciar latidos de Ping
    startPingService();

    server.listen(PORT, "0.0.0.0", () => logStartup(PORT));
}

module.exports = { createApp, startServer };
