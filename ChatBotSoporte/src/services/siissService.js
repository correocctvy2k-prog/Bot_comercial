// src/services/siissService.js
async function checkSiissStatus() {
    return { status: 'online', latencyMs: 45 };
}

module.exports = { checkSiissStatus };
