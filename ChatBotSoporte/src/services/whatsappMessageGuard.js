// src/services/whatsappMessageGuard.js
const processedIds = new Set();

function isDuplicate(messageId) {
    if (processedIds.has(messageId)) return true;
    processedIds.add(messageId);
    return false;
}

module.exports = { isDuplicate };
