'use strict';

// spec 0016 — detecta si el .xlsx de mantenimiento está abierto en Excel por alguien, sin
// forzar nada: Office crea un archivo oculto "~$<nombre original>.xlsx" junto al original
// mientras cualquier usuario lo tiene abierto (con o sin bloqueo de escritura explícito), y
// suele embeber el nombre de usuario de Windows de quien lo abrió cerca del inicio del archivo
// (texto plano, con relleno). Es solo informativo -- nunca se intenta cerrar el archivo desde
// acá (spec 0016 §4: forzar el cierre remoto de un archivo de red puede corromper ediciones en
// curso de esa persona).

const fs = require('fs/promises');
const path = require('path');

function lockFilePath(filePath) {
  return path.join(path.dirname(filePath), `~$${path.basename(filePath)}`);
}

/** Mejor esfuerzo: el nombre de usuario suele aparecer como texto plano (con separación nula
 *  ocasional) en los primeros ~200 bytes del archivo de bloqueo. Si no se puede aislar un
 *  nombre razonable, devuelve null (el llamador debe mostrar "alguien" en ese caso). */
function extractLockOwner(buffer) {
  const raw = buffer.subarray(0, 256).toString('latin1').replace(/\0/g, '');
  const match = raw.match(/[A-Za-z][A-Za-z0-9._ ]{2,40}/);
  if (!match) return null;
  const candidate = match[0].trim();
  return candidate.length >= 3 ? candidate : null;
}

/** @returns {Promise<{locked: boolean, lockedBy: string|null}>} */
async function getExcelLockStatus(filePath) {
  const lockPath = lockFilePath(filePath);
  let buffer;
  try {
    buffer = await fs.readFile(lockPath);
  } catch (error) {
    if (error.code === 'ENOENT') return { locked: false, lockedBy: null };
    throw error;
  }
  return { locked: true, lockedBy: extractLockOwner(buffer) };
}

module.exports = { lockFilePath, extractLockOwner, getExcelLockStatus };
