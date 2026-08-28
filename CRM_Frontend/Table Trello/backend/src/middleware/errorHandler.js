const config = require('../config/trello');

function errorHandler(err, req, res, next) {
  console.error('❌ Error capturado:', err);

  const statusCode = err.statusCode || err.response?.status || 500;
  const message = err.message || 'Error interno del servidor';
  const details = config.nodeEnv === 'development' ? err.stack : undefined;

  res.status(statusCode).json({
    error: {
      message,
      statusCode,
      details
    }
  });
}

module.exports = errorHandler;
