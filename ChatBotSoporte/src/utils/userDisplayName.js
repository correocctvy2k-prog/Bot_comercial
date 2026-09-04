// src/utils/userDisplayName.js
function getDisplayName(user) {
    return user?.name || user?.phone || 'Usuario';
}

module.exports = { getDisplayName };
