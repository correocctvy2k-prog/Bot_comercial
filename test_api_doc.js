const { validarDocumentoAsamblea } = require('./Asamblea/src/services/api.asamblea.service');
require('dotenv').config({ path: './Asamblea/.env' });

async function test() {
    console.log("Testing document 44558885...");
    try {
        const result = await validarDocumentoAsamblea('44558885');
        console.log("Result:", result);
    } catch (e) {
        console.error("Error:", e);
    }
}

test();
