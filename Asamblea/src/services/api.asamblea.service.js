// src/services/api.asamblea.service.js

let cachedToken = null;
let tokenExpiresAt = 0;

const SIISS_BASE_URL = 'http://10.192.168.8:8101';
const EMPRCODI = '8150006772';
const ASAMCODI = 10;
const USERNAME = '123123123';
const PASSWORD = 'CP123';

/**
 * Autentica contra la API SIISS y obtiene el token JWT.
 */
async function getSiissToken() {
    if (cachedToken && Date.now() < tokenExpiresAt) {
        return cachedToken;
    }

    try {
        const response = await fetch(`${SIISS_BASE_URL}/siiss-login/api/v1/qvaccesosys/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: USERNAME,
                password: PASSWORD
            })
        });

        if (!response.ok) {
            console.error(`[API Asamblea] Error en Login SIISS. Status: ${response.status}`);
            throw new Error('Error de autenticación SIISS');
        }

        const data = await response.json();
        cachedToken = data.token;
        // El token dura hasta las 11:59pm, expiraremos el caché cada 1 hora preventivamente
        tokenExpiresAt = Date.now() + 3600000;
        return cachedToken;
    } catch (e) {
        console.error(`[API Asamblea] Excepción en Login SIISS:`, e.message);
        throw e;
    }
}

/**
 * Consulta la lista de asambleístas y valida si el documento proporcionado existe.
 * @param {string|number} documento - Documento o NIT a buscar
 * @returns {Promise<object|null>} Objeto accionista si existe, null si no.
 */
async function validarDocumentoAsamblea(documento) {
    try {
        const token = await getSiissToken();
        const docLimpio = String(documento).replace(/\D/g, '');

        console.log(`[API Asamblea] Consultando accionistas para doc: ${docLimpio} en ${SIISS_BASE_URL}`);

        const response = await fetch(`${SIISS_BASE_URL}/siiss-quorum/api/v1/qoAccionistas/getAccionistasLst`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                emprcodi: EMPRCODI,
                asamcodi: { asamcodi: ASAMCODI }
            })
        });

        if (!response.ok) {
            console.error(`[API Asamblea] Error HTTP consultando accionistas. Status: ${response.status}`);
            return null;
        }

        const accionistas = await response.json();
        console.log(`[API Asamblea] Lista recibida: ${accionistas.length} accionistas.`);

        // Buscamos si el documento existe en la lista devuelta
        const accionista = accionistas.find(acc => String(acc.accicodi) === docLimpio);

        if (accionista) {
            console.log(`[API Asamblea] ✅ Doc ${docLimpio} VALIDADO: ${accionista.accinomb}`);
            return accionista; // retorna el objeto completo con accicodi, accinomb, etc.
        }

        console.log(`[API Asamblea] ❌ Doc ${docLimpio} DENEGADO: No encontrado en ${accionistas.length} registros.`);
        return null;
    } catch (e) {
        console.error(`[API Asamblea] 🔴 EXCEPCIÓN al validar doc (posible error de red con ${SIISS_BASE_URL}):`, e.message);
        return null;
    }
}


/**
 * Obtiene el censo completo de asambleístas autorizados desde SIISS.
 * @returns {Promise<Array>}
 */
async function obtenerCensoAsamblea() {
    try {
        const token = await getSiissToken();
        const response = await fetch(`${SIISS_BASE_URL}/siiss-quorum/api/v1/qoAccionistas/getAccionistasLst`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                emprcodi: EMPRCODI,
                asamcodi: { asamcodi: ASAMCODI }
            })
        });

        if (!response.ok) {
            console.error(`[API Asamblea] Error HTTP consultando censo. Status: ${response.status}`);
            return [];
        }

        return await response.json();
    } catch (e) {
        console.error(`[API Asamblea] EXCEPCIÓN al consultar censo:`, e.message);
        return [];
    }
}

/**
 * Registra la asistencia del accionista en la API Quorum SIISS.
 * @param {string|number} documento 
 * @param {string} nombre 
 * @returns {Promise<boolean>} True si el registro de la asistencia en API final fue ok.
 */
async function registrarAsistenciaSIISS(documento, nombre) {
    try {
        const token = await getSiissToken();
        const docLimpio = Number(String(documento).replace(/\D/g, ''));

        // Formato para asisfech: YYYY/MM/DD 00:00:00
        // Formato para asishora: YYYY/MM/DD HH:mm:ss
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const yyyy = now.getFullYear();
        const mm = pad(now.getMonth() + 1);
        const dd = pad(now.getDate());
        const hh = pad(now.getHours());
        const min = pad(now.getMinutes());
        const ss = pad(now.getSeconds());

        const asisfechStr = `${yyyy}/${mm}/${dd} 00:00:00`;
        const asishoraStr = `${yyyy}/${mm}/${dd} ${hh}:${min}:${ss}`;

        const requestBody = {
            accicodi: {
                accicodi: docLimpio,
                accirepr: nombre
            },
            asacodi: ASAMCODI,
            asisfech: asisfechStr,
            asishora: asishoraStr,
            asisdigi: USERNAME,
            asisause: 0
        };

        const response = await fetch(`${SIISS_BASE_URL}/siiss-quorum/api/v1/qoAsistencias/registraAsistencia`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(requestBody)
        });

        if (response.ok) {
            console.log(`[API Asamblea] Asistencia registrada OK en SIISS para doc ${docLimpio}.`);
            return true;
        } else {
            const errText = await response.text();
            console.error(`[API Asamblea] Error registrando asistencia SIISS. Status: ${response.status} Body: ${errText}`);
            return false;
        }
    } catch (e) {
        console.error(`[API Asamblea] Excepción registrando asistencia en SIISS:`, e.message);
        return false;
    }
}

module.exports = {
    validarDocumentoAsamblea,
    registrarAsistenciaSIISS,
    obtenerCensoAsamblea
};
