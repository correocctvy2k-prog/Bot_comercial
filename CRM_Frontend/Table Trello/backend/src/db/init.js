const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const config = require('../config/trello');

// Asegurar que el directorio de la base de datos exista
const dbFullPath = path.resolve(__dirname, '../../', config.databasePath);
const dbDir = path.dirname(dbFullPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(dbFullPath);

// Inicializar tablas
db.exec(`
  CREATE TABLE IF NOT EXISTS tableros (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT,
    closed INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS listas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    idBoard TEXT NOT NULL,
    pos REAL,
    closed INTEGER DEFAULT 0,
    FOREIGN KEY(idBoard) REFERENCES tableros(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tarjetas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    desc TEXT,
    idList TEXT NOT NULL,
    idBoard TEXT NOT NULL,
    due TEXT,
    closed INTEGER DEFAULT 0,
    labels TEXT, -- JSON stringificado
    members TEXT, -- JSON stringificado
    cover TEXT, -- JSON de la portada
    attachments TEXT, -- JSON de los adjuntos de portada
    checklists TEXT, -- JSON de los checklists e items individuales
    FOREIGN KEY(idList) REFERENCES listas(id) ON DELETE CASCADE,
    FOREIGN KEY(idBoard) REFERENCES tableros(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS historial_cambios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cardId TEXT,
    actionType TEXT NOT NULL, -- 'CREATE', 'UPDATE', 'MOVE', 'DELETE'
    field TEXT, -- campo modificado si aplica
    oldValue TEXT,
    newValue TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    syncType TEXT NOT NULL, -- 'FULL', 'BOARD', 'WEBHOOK'
    status TEXT NOT NULL, -- 'SUCCESS', 'ERROR'
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sincronizacion_excel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    punto TEXT NOT NULL,
    zona TEXT,
    periodo TEXT NOT NULL,
    celda TEXT,
    valor INTEGER DEFAULT 1,
    estado TEXT NOT NULL,
    fuente TEXT,
    detalles TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
console.log(`📂 SQLite inicializado correctamente en: ${dbFullPath}`);

const ensureColumn = (table, column, definition) => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((info) => info.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`SQLite migracion aplicada: ${table}.${column}`);
  }
};

ensureColumn('tarjetas', 'cover', 'TEXT');
ensureColumn('tarjetas', 'attachments', 'TEXT');
ensureColumn('tarjetas', 'checklists', 'TEXT');
module.exports = db;
