const express = require("express");
const router = express.Router();

const {
    verifyWebhookGet,
    handleWebhookPost,
    handleTelegramWebhook,
    handleTriggerMonitor
} = require("../controllers/webhook.controller");

router.get("/webhook", verifyWebhookGet);
router.post("/webhook", handleWebhookPost);
router.post("/webhook/telegram", handleTelegramWebhook);
router.post("/api/webhook/trigger-monitor", handleTriggerMonitor);

module.exports = router;
