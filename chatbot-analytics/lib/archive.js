'use strict';

/**
 * Histórico acumulativo (append-only).
 *
 * El log del chatbot en el servidor puede rotarse o vaciarse; leerlo directo nos
 * haría perder lo viejo. Este módulo mantiene una copia local que SOLO CRECE.
 *
 * Estrategia: el log de origen es append-only, así que en cada lectura se compara
 * por PREFIJO COMÚN con lo ya guardado y se agregan únicamente las líneas nuevas
 * (las que están más allá del prefijo). Esto:
 *   - tolera que el servidor reenvíe el archivo completo en cada sondeo,
 *   - no colapsa líneas legítimamente repetidas (p. ej. "No disponible" ×N en
 *     messages.log, que no trae identificador),
 *   - ante una rotación, conserva el histórico y anexa el archivo nuevo desde el
 *     punto en que diverge.
 *
 * `prune(dias)` opcional descarta líneas más viejas que N días. Por defecto no
 * borra nada.
 */

const fs = require('fs');
const path = require('path');

const splitLines = (text) => String(text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

class Archive {
  /**
   * @param {string} filePath                 archivo .jsonl acumulado
   * @param {(line:string)=>boolean} isValid   ¿la línea entrante merece archivarse? (JSON completo y con forma esperada)
   * @param {(line:string)=>Date|null} tsOf    extrae la fecha de la línea (para prune); null si no aplica
   */
  constructor(filePath, isValid, tsOf) {
    this.filePath = filePath;
    this.isValid = isValid || (() => true);
    this.tsOf = tsOf || (() => null);
    this._lines = [];
    this._loaded = false;
  }

  load() {
    try {
      this._lines = splitLines(fs.readFileSync(this.filePath, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      this._lines = [];
    }
    this._loaded = true;
    return this;
  }

  /** Agrega las líneas de `incoming` que están más allá del prefijo común. Devuelve cuántas. */
  ingest(incoming) {
    if (!this._loaded) this.load();
    const inLines = splitLines(incoming).filter((l) => this.isValid(l));

    let k = 0;
    const max = Math.min(this._lines.length, inLines.length);
    while (k < max && this._lines[k] === inLines[k]) k += 1;

    const fresh = inLines.slice(k);
    if (fresh.length) {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.appendFileSync(this.filePath, `${fresh.join('\n')}\n`);
      this._lines.push(...fresh);
    }
    return fresh.length;
  }

  /** Contenido completo del histórico (lo que consume el parser). */
  readAll() {
    if (!this._loaded) this.load();
    return this._lines.length ? `${this._lines.join('\n')}\n` : '';
  }

  /** Descarta líneas más viejas que `days` días. days<=0 -> no hace nada. */
  prune(days) {
    if (!days || days <= 0) return 0;
    if (!this._loaded) this.load();
    const cutoff = Date.now() - days * 86400000;
    const before = this._lines.length;
    this._lines = this._lines.filter((line) => {
      const ts = this.tsOf(line);
      return !(ts && ts.getTime() < cutoff);
    });
    const removed = before - this._lines.length;
    if (removed) fs.writeFileSync(this.filePath, this.readAll());
    return removed;
  }

  stats() {
    if (!this._loaded) this.load();
    let since = null;
    for (const line of this._lines) {
      const ts = this.tsOf(line);
      if (ts && (!since || ts < since)) since = ts;
    }
    return { lines: this._lines.length, since: since ? since.toISOString() : null };
  }
}

module.exports = { Archive };
