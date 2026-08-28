const { execFile } = require('child_process');
const config = require('../config/trello');
const { excelService, getPeriodoFromDate } = require('../services/excel.service');

exports.abrirArchivo = (req, res, next) => {
  try {
    const filePath = config.excelPath;
    execFile('cmd.exe', ['/c', 'start', '', filePath], { windowsHide: true }, (error) => {
      if (error) {
        console.error('No se pudo abrir el archivo Excel:', error.message);
      }
    });
    res.json({ ok: true, filePath });
  } catch (error) {
    next(error);
  }
};
exports.marcarMantenimiento = async (req, res, next) => {
  try {
    const { nombrePunto, punto, zona, periodo, fecha, valor } = req.body;
    const result = await excelService.marcarMantenimiento({
      nombrePunto: nombrePunto || punto,
      zona,
      periodo,
      fecha: fecha || new Date(),
      valor: valor ?? 1,
      fuente: 'api',
      detalles: { body: req.body }
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
};

exports.getResumen = async (req, res, next) => {
  try {
    const result = await excelService.getResumen();
    res.json(result);
  } catch (error) {
    next(error);
  }
};

exports.getPuntos = async (req, res, next) => {
  try {
    const result = await excelService.listarPuntos(req.params.zona || req.query.zona || null);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

exports.getHistorial = (req, res, next) => {
  try {
    res.json(excelService.getHistorial(req.query.limite || 50));
  } catch (error) {
    next(error);
  }
};

exports.getPeriodo = (req, res) => {
  res.json({ periodo: getPeriodoFromDate(req.query.fecha || new Date()) });
};

