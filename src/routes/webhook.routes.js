// src/routes/webhook.routes.js
const express = require("express");
const router = express.Router();

const {
  verifyWebhookGet,
  handleWebhookPost,
} = require("../controllers/webhook.controller");

router.get("/webhook", verifyWebhookGet);
router.post("/webhook", handleWebhookPost);

module.exports = router;
