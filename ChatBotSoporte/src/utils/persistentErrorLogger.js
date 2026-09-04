// src/utils/persistentErrorLogger.js
function logError(error) {
    console.error('[ErrorLogger]', new Date().toISOString(), error);
}

module.exports = { logError };
