// src/services/emailService.js
const nodemailer = require('nodemailer');

async function sendTicketEmail(ticketData) {
    console.log('[EmailService] Enviando correo de ticket:', ticketData);
    return true;
}

module.exports = { sendTicketEmail };
