const dotenv = require('dotenv');
const path = require('path');

// Cargar variables de entorno del archivo .env correspondiente
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  apiKey: process.env.TRELLO_API_KEY,
  token: process.env.TRELLO_TOKEN,
  baseUrl: 'https://api.trello.com/1',
  port: process.env.PORT || 3003,
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  databasePath: process.env.DATABASE_PATH || './data/skylab-tareas.db',
  webhookSecret: process.env.WEBHOOK_SECRET,
  excelPath: process.env.EXCEL_FILE_PATH || String.raw`\\ganepalmir\dpto.informatica\Director.Informatica\1_SGC Indicadores de Gestión\Indicadores Recursos Tecnológicos\Año 2026 - (informatica)\2026 programacion anual CCTV.xlsx`,
  webhookUrl: process.env.WEBHOOK_URL
};

// Validar que las credenciales obligatorias estén presentes
if (!config.apiKey || !config.token) {
  console.warn('⚠️ ADVERTENCIA: TRELLO_API_KEY o TRELLO_TOKEN no están configurados en las variables de entorno.');
}

module.exports = config;
