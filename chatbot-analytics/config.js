'use strict';

/**
 * Configuracion central del proyecto.
 *
 * Todos los valores se pueden sobreescribir con variables de entorno, de modo
 * que el mismo codigo sirve para:
 *   - Desarrollo local leyendo ./conversations.log
 *   - Un servidor donde el log real se va llenando (LOG_PATH + polling / watch)
 *   - Una fuente remota (SSH/SFTP) en el futuro, sin tocar la logica de negocio
 */

const path = require('path');
const fs = require('fs');

// --- Carga opcional de un archivo .env (sin dependencias) -------------------
// Util sobre todo para las credenciales SSH: evita ponerlas en la linea de
// comandos (historial del shell) y el "path mangling" de Git Bash en Windows.
// Formato: LINEAS  CLAVE=valor  (# para comentarios). No sobreescribe variables
// que ya vengan del entorno real.
(function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}());

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

module.exports = {
  // Puerto del servidor HTTP
  port: num(process.env.PORT, 3000),

  // Ruta al archivo de log de Oskitar (modo local). En produccion se usa SSH.
  // Sin LOG_PATH se usa el ejemplo incluido para poder arrancar tras clonar.
  logPath: process.env.LOG_PATH
    ? path.resolve(process.env.LOG_PATH)
    : path.join(__dirname, 'conversations.sample.log'),

  // Minutos de inactividad que separan una sesion de la siguiente para un
  // mismo usuario. 30 min es el estandar de analitica conversacional.
  sessionGapMinutes: num(process.env.SESSION_GAP_MIN, 30),

  // Desfase horario aplicado a los timestamps (que llegan en UTC/Z) para que
  // los cortes por dia/hora reflejen la operacion real. Colombia = UTC-5.
  tzOffsetHours: num(process.env.TZ_OFFSET_HOURS, -5),

  // Privacidad: enmascara los telefonos en la API (57••••••4631, deja los
  // ultimos 4). Poner MASK_PHONES=0 para mostrarlos completos.
  maskPhones: process.env.MASK_PHONES !== '0',

  // Betty: el state-manager.log solo guarda el 'timeout' (cuando el estado
  // expira), que va ~12 min adelante del momento real. Le restamos esta ventana
  // para aproximar la hora de interaccion. Ajustable con BETTY_STATE_TTL_SEC.
  bettyStateTtlSec: num(process.env.BETTY_STATE_TTL_SEC, 720),

  // Historico acumulativo: se guarda una copia local que solo crece, para no
  // perder datos si el log del servidor se rota o se vacia. Ver lib/archive.js.
  historyDir: process.env.HISTORY_DIR
    ? path.resolve(process.env.HISTORY_DIR)
    : path.join(__dirname, 'data'),
  // Dias de historico a conservar. 0 = guardar TODO, nunca borrar.
  historyDays: num(process.env.HISTORY_DAYS, 0),

  // Vigilancia del log
  watch: {
    // Rebote para agrupar rafagas de escritura antes de recalcular
    debounceMs: num(process.env.WATCH_DEBOUNCE_MS, 400),
    // Sondeo de respaldo por si fs.watch no dispara (unidades de red, Docker, etc.)
    pollIntervalMs: num(process.env.WATCH_POLL_MS, 3000),
  },

  // Fuente de datos:
  //   'local' (por defecto)  -> lee archivos del disco y los vigila.
  //   'ssh'                   -> lee los logs directo del servidor del chatbot
  //                             (requiere: npm install ssh2). Ver lib/logSource.js.
  source: {
    type: process.env.LOG_SOURCE || 'local',
    ssh: {
      host: process.env.LOG_SSH_HOST || '',
      port: num(process.env.LOG_SSH_PORT, 22),
      username: process.env.LOG_SSH_USER || '',
      // Autenticacion: preferir clave privada. Nunca versionar credenciales.
      privateKeyPath: process.env.LOG_SSH_KEY || '',
      passphrase: process.env.LOG_SSH_PASSPHRASE || '',
      password: process.env.LOG_SSH_PASSWORD || '',
    },
  },

  // -----------------------------------------------------------------------
  // Bots a analizar. Cada uno tiene su motor de analitica y su(s) archivo(s).
  //   engine 'oskitar' -> lib/analytics.js       (1 archivo: conversations)
  //   engine 'betty'   -> lib/analyticsBetty.js  (2 archivos: messages + state)
  // Las rutas son locales (modo local) o remotas absolutas (modo ssh).
  // -----------------------------------------------------------------------
  bots: buildBots(),
};

function buildBots() {
  const ssh = (process.env.LOG_SOURCE || 'local') === 'ssh';
  const abs = (p) => (p ? path.resolve(p) : '');

  const bots = [{
    id: 'oskitar',
    name: 'Oskitar',
    subtitle: 'Soporte tecnico interno',
    engine: 'oskitar',
    files: {
      conversations: ssh
        ? (process.env.LOG_SSH_REMOTE_PATH || '')
        : (process.env.LOG_PATH ? abs(process.env.LOG_PATH) : path.join(__dirname, 'conversations.sample.log')),
    },
  }];

  // Betty es opcional: aparece solo si se configuran sus rutas.
  //   modo ssh   -> LOG_SSH_BETTY_MESSAGES + LOG_SSH_BETTY_STATE (rutas remotas)
  //   modo local -> BETTY_MESSAGES_PATH + BETTY_STATE_PATH (rutas locales)
  const bettyMessages = ssh
    ? (process.env.LOG_SSH_BETTY_MESSAGES || '')
    : (process.env.BETTY_MESSAGES_PATH || '');
  const bettyState = ssh
    ? (process.env.LOG_SSH_BETTY_STATE || '')
    : (process.env.BETTY_STATE_PATH || '');

  if (bettyMessages && bettyState && process.env.BETTY_DISABLED !== '1') {
    bots.push({
      id: 'betty',
      name: 'Betty',
      subtitle: 'Atencion a clientes',
      engine: 'betty',
      files: ssh
        ? { messages: bettyMessages, state: bettyState }
        : { messages: abs(bettyMessages), state: abs(bettyState) },
    });
  }
  return bots;
}
