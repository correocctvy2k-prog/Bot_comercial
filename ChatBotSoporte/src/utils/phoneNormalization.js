// src/utils/phoneNormalization.js
function normalizePhone(phone) {
    if (!phone) return '';
    return phone.replace(/\D/g, '');
}

module.exports = { normalizePhone };
