// src/services/stateManager.js
const userState = new Map();

function getState(userId) {
    return userState.get(userId) || { step: 'IDLE' };
}

function setState(userId, state) {
    userState.set(userId, state);
}

module.exports = { getState, setState };
