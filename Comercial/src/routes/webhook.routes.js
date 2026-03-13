const express = require("express");
const router = express.Router();

const {
    verifyWebhookGet,
    handleWebhookPost,
    handleTelegramWebhook
} = require("../controllers/webhook.controller");

router.get("/webhook", verifyWebhookGet);
router.post("/webhook", handleWebhookPost);
router.post("/webhook/telegram", handleTelegramWebhook);

module.exports = router;
