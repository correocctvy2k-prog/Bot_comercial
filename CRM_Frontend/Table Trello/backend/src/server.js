const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const config = require('./config/trello');
const tablerosRouter = require('./routes/tableros');
const webhooksRouter = require('./routes/webhooks');
const imagesRouter   = require('./routes/images');
const excelRouter    = require('./routes/excel');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const server = http.createServer(app);

// Configuración de Socket.IO con CORS amplio para desarrollo local
const io = new Server(server, {
  cors: {
    origin: '*', // Permitir cualquier frontend en desarrollo
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Guardar io en la app para poder usarlo en los controladores
app.set('io', io);

// Middlewares globales
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false, // Permitir cargar imágenes de este origen desde otros
  crossOriginResourcePolicy: false  // Permitir carga en modo no-cors o cross-origin
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    uptime: process.uptime(),
    env: config.nodeEnv
  });
});

// Rutas
app.use('/api/tableros', tablerosRouter);
app.use('/api/images',   imagesRouter);
app.use('/api/excel',    excelRouter);
app.use('/webhooks', webhooksRouter);

// Manejo de errores
app.use(errorHandler);

// Inicializar conexión Socket.IO
io.on('connection', (socket) => {
  console.log(`🔌 Cliente conectado por WebSocket: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`🔌 Cliente desconectado: ${socket.id}`);
  });
});

// Iniciar servidor
const PORT = config.port;
server.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`🚀 Servidor Skylab Tareas corriendo en puerto ${PORT}`);
  console.log(`   Entorno: ${config.nodeEnv}`);
  console.log(`   Healthcheck: http://localhost:${PORT}/health`);
  console.log(`===================================================`);
});
