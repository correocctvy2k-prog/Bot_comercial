'use strict';

/**
 * Abstraccion de la FUENTE del log.
 *
 * El resto del sistema (analitica + servidor) solo conoce esta interfaz:
 *
 *   const source = createLogSource(config);
 *   source.on('change', () => { ... recalcular ... });
 *   await source.start();
 *   const text = await source.read();      // contenido completo del log
 *   const meta = source.stat();            // { size, mtime, exists }
 *
 * Implementaciones:
 *   - LocalFileLogSource : lee un archivo del disco y lo vigila (fs.watch + sondeo).
 *                          LOG_SOURCE=local  (por defecto)
 *   - RemoteSshLogSource : se conecta por SSH al servidor del chatbot, descarga el
 *                          log por SFTP y lo sigue con `tail -F`.
 *                          LOG_SOURCE=ssh    (requiere: npm install ssh2)
 *
 * La fabrica createLogSource(config) elige segun configuracion. La analitica y el
 * frontend no dependen de cual sea la fuente.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const { EventEmitter } = require('events');

// ssh2 es opcional: solo hace falta con LOG_SOURCE=ssh. Si no esta instalado,
// el modo local sigue funcionando igual.
let SSH2 = null;
try {
  // eslint-disable-next-line global-require, import/no-unresolved
  SSH2 = require('ssh2');
} catch (_) { /* se avisa al usar la fuente ssh */ }

/** Envuelve una ruta para pasarla segura a un shell remoto. */
const shq = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

// -------------------------------------------------------------------------
// Fuente local: archivo en disco + vigilancia (fs.watch con sondeo de respaldo)
// -------------------------------------------------------------------------
class LocalFileLogSource extends EventEmitter {
  /**
   * @param {Object} opts
   * @param {string} opts.logPath
   * @param {number} [opts.debounceMs]
   * @param {number} [opts.pollIntervalMs]
   */
  constructor({ logPath, debounceMs = 400, pollIntervalMs = 3000 }) {
    super();
    this.logPath = logPath;
    this.debounceMs = debounceMs;
    this.pollIntervalMs = pollIntervalMs;
    this._watcher = null;
    this._poll = null;
    this._debounce = null;
    this._lastSignature = '';
  }

  async start() {
    // El servidor ya hizo la primera lectura en el arranque; solo fijamos la
    // firma actual para no recalcular de mas, y empezamos a vigilar cambios.
    this._lastSignature = this._signature();
    this._startWatch();
    this._startPoll();
    return this;
  }

  stop() {
    if (this._watcher) this._watcher.close();
    if (this._poll) clearInterval(this._poll);
    if (this._debounce) clearTimeout(this._debounce);
    this._watcher = null;
    this._poll = null;
  }

  stat() {
    try {
      const st = fs.statSync(this.logPath);
      return { exists: true, size: st.size, mtime: st.mtime.toISOString() };
    } catch (_) {
      return { exists: false, size: 0, mtime: null };
    }
  }

  async read() {
    try {
      return await fsp.readFile(this.logPath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return '';
      throw err;
    }
  }

  // --- internos --------------------------------------------------------
  _signature() {
    const st = this.stat();
    return `${st.exists ? 1 : 0}:${st.size}:${st.mtime || ''}`;
  }

  _emitChangeIfMoved() {
    const sig = this._signature();
    if (sig !== this._lastSignature) {
      this._lastSignature = sig;
      this.emit('change', this.stat());
      return true;
    }
    return false;
  }

  _scheduleCheck() {
    if (this._debounce) clearTimeout(this._debounce);
    this._debounce = setTimeout(() => this._emitChangeIfMoved(), this.debounceMs);
  }

  _startWatch() {
    try {
      this._watcher = fs.watch(this.logPath, { persistent: false }, () => this._scheduleCheck());
      this._watcher.on('error', () => { /* el sondeo cubre el hueco */ });
    } catch (_) {
      // fs.watch puede fallar si el archivo aun no existe; el sondeo lo cubre.
    }
  }

  _startPoll() {
    this._poll = setInterval(() => this._scheduleCheck(), this.pollIntervalMs);
    if (this._poll.unref) this._poll.unref();
  }
}

// -------------------------------------------------------------------------
// Fuente remota por SSH: lee el log directamente del servidor del chatbot.
// -------------------------------------------------------------------------
/**
 * Se activa con LOG_SOURCE=ssh. Requiere `npm install ssh2`.
 *
 * Funcionamiento:
 *   - start()  abre la conexion SSH (clave privada o contrasena).
 *   - read()   descarga el archivo completo por SFTP (el log es pequeno; para
 *              logs muy grandes se puede pasar a lectura incremental con
 *              `tail -c +<offset>` — ver nota abajo).
 *   - watch    lanza `tail -F <remotePath>` en un canal SSH: cada trozo de datos
 *              nuevo dispara 'change' (con rebote). Un sondeo de `stat` de
 *              respaldo cubre el caso de que el canal tail muera.
 *   - stat()   devuelve el ultimo tamano/mtime conocido (refrescado por el
 *              sondeo); es solo diagnostico, por eso puede ser sincrono/cacheado.
 *   - reconecta solo con backoff si la conexion se cae.
 *
 * Variables de entorno (ver config.js):
 *   LOG_SSH_HOST, LOG_SSH_PORT, LOG_SSH_USER,
 *   LOG_SSH_KEY (ruta a la clave privada) [+ LOG_SSH_PASSPHRASE],
 *   LOG_SSH_PASSWORD (alternativa a la clave),
 *   LOG_SSH_REMOTE_PATH (ruta del conversations.log en el servidor).
 *
 * Nota (lectura incremental, optimizacion futura): guardar el offset en bytes ya
 * leido y ejecutar `tail -c +<offset+1> <path>` para traer solo lo nuevo; releer
 * completo si el tamano disminuye (rotacion del log).
 */
class RemoteSshLogSource extends EventEmitter {
  constructor(sshConfig, watch = {}) {
    super();
    this.cfg = sshConfig || {};
    this.debounceMs = watch.debounceMs || 400;
    this.pollIntervalMs = watch.pollIntervalMs || 5000;

    this.conn = null;
    this.ready = false;
    this._stopped = false;
    this._stat = { exists: false, size: 0, mtime: null };
    this._debounce = null;
    this._poll = null;
    this._retry = null;
    this._tail = null;
  }

  async start() {
    if (!SSH2) {
      throw new Error(
        'LOG_SOURCE=ssh requiere la dependencia "ssh2". Instalala con:  npm install ssh2',
      );
    }
    for (const k of ['host', 'username', 'remotePath']) {
      if (!this.cfg[k]) throw new Error(`Config SSH incompleta: falta ${k} (revisa las variables LOG_SSH_*)`);
    }
    if (!this.cfg.privateKeyPath && !this.cfg.password) {
      throw new Error('Config SSH: define LOG_SSH_KEY (clave privada) o LOG_SSH_PASSWORD');
    }
    if (this.cfg.privateKeyPath && !fs.existsSync(this.cfg.privateKeyPath)) {
      throw new Error(`Config SSH: no existe la clave privada en ${this.cfg.privateKeyPath}`);
    }
    this._stopped = false;
    await this._connect(); // resuelve de inmediato; conecta en segundo plano
    return this;
  }

  stop() {
    this._stopped = true;
    if (this._debounce) clearTimeout(this._debounce);
    if (this._poll) clearInterval(this._poll);
    if (this._retry) clearTimeout(this._retry);
    if (this._tail) { try { this._tail.close(); } catch (_) { /* noop */ } }
    if (this.conn) { try { this.conn.end(); } catch (_) { /* noop */ } }
    this.conn = null;
    this.ready = false;
  }

  stat() {
    return { ...this._stat };
  }

  async read() {
    if (!this.ready) throw new Error('SSH aun no conectado');
    return new Promise((resolve, reject) => {
      this.conn.sftp((err, sftp) => {
        if (err) return reject(err);
        const chunks = [];
        const rs = sftp.createReadStream(this.cfg.remotePath);
        rs.on('data', (c) => chunks.push(c));
        rs.on('error', (e) => { try { sftp.end(); } catch (_) { /* noop */ } reject(e); });
        rs.on('end', () => { try { sftp.end(); } catch (_) { /* noop */ } resolve(Buffer.concat(chunks).toString('utf8')); });
      });
    });
  }

  // --- internos --------------------------------------------------------
  _authOpts() {
    const o = {
      host: this.cfg.host,
      port: this.cfg.port || 22,
      username: this.cfg.username,
      readyTimeout: 20000,
      keepaliveInterval: 15000,
      keepaliveCountMax: 3,
    };
    if (this.cfg.privateKeyPath) o.privateKey = fs.readFileSync(this.cfg.privateKeyPath);
    if (this.cfg.passphrase) o.passphrase = this.cfg.passphrase;
    if (this.cfg.password) {
      o.password = this.cfg.password;
      // Muchos servidores solo aceptan "keyboard-interactive" (no "password" a
      // secas). Habilitamos ese metodo y respondemos con la misma contrasena.
      o.tryKeyboard = true;
    }
    return o;
  }

  /**
   * Inicia la conexion SSH y RESUELVE de inmediato: no bloquea el arranque del
   * servidor esperando el handshake. Cuando la conexion queda lista se emite
   * 'change' (que dispara la primera carga real). Si falla, reintenta solo.
   */
  _connect() {
    let opts;
    try {
      opts = this._authOpts();
    } catch (e) {
      console.error(`[ssh] configuracion invalida: ${e.message}`);
      this._scheduleReconnect();
      return Promise.resolve();
    }

    const conn = new SSH2.Client();
    this.conn = conn;

    if (this.cfg.password) {
      conn.on('keyboard-interactive', (name, instr, lang, prompts, finish) => {
        finish(prompts.map(() => this.cfg.password));
      });
    }

    conn.on('ready', () => {
      this.ready = true;
      console.log(`[ssh] conectado a ${this.cfg.username}@${this.cfg.host}:${this.cfg.port || 22}`);
      this._refreshStat().finally(() => {
        this.emit('change', this.stat()); // dispara la primera carga
        this._startTail();
        this._startPoll();
      });
    });
    conn.on('error', (e) => {
      this.ready = false;
      console.error(`[ssh] error de conexion: ${e.message}`);
      if (!this._stopped) this._scheduleReconnect();
    });
    conn.on('close', () => {
      this.ready = false;
      if (this._tail) { try { this._tail.close(); } catch (_) { /* noop */ } this._tail = null; }
      if (!this._stopped) {
        console.error('[ssh] conexion cerrada, reintentando en 5 s…');
        this._scheduleReconnect();
      }
    });

    try {
      conn.connect(opts);
    } catch (e) {
      console.error(`[ssh] no se pudo iniciar la conexion: ${e.message}`);
      if (!this._stopped) this._scheduleReconnect();
    }
    return Promise.resolve();
  }

  _scheduleReconnect() {
    if (this._retry || this._stopped) return;
    if (this._poll) { clearInterval(this._poll); this._poll = null; }
    this._retry = setTimeout(() => {
      this._retry = null;
      if (!this._stopped) this._connect();
    }, 5000);
  }

  _scheduleChange() {
    if (this._debounce) clearTimeout(this._debounce);
    this._debounce = setTimeout(async () => {
      await this._refreshStat();
      this.emit('change', this.stat());
    }, this.debounceMs);
  }

  _startTail() {
    if (!this.ready) return;
    this.conn.exec(`tail -F -n 0 ${shq(this.cfg.remotePath)}`, (err, stream) => {
      if (err) { console.error(`[ssh] no se pudo lanzar tail: ${err.message}`); return; }
      this._tail = stream;
      stream.on('data', () => this._scheduleChange());
      stream.stderr.on('data', () => { /* "file truncated" al rotar: lo cubre el sondeo */ });
      stream.on('close', () => { this._tail = null; });
    });
  }

  _startPoll() {
    if (this._poll) clearInterval(this._poll);
    this._poll = setInterval(async () => {
      const before = `${this._stat.size}:${this._stat.mtime}`;
      await this._refreshStat();
      if (`${this._stat.size}:${this._stat.mtime}` !== before) this.emit('change', this.stat());
    }, this.pollIntervalMs);
    if (this._poll.unref) this._poll.unref();
  }

  _refreshStat() {
    return new Promise((resolve) => {
      if (!this.ready || !this.conn) return resolve();
      this.conn.exec(`stat -c '%s %Y' ${shq(this.cfg.remotePath)} 2>/dev/null || echo NONE`, (err, stream) => {
        if (err) return resolve();
        let out = '';
        stream.on('data', (d) => { out += d.toString(); });
        stream.on('close', () => {
          const s = out.trim();
          if (!s || s === 'NONE') {
            this._stat = { exists: false, size: 0, mtime: null };
          } else {
            const [size, mtime] = s.split(/\s+/);
            this._stat = {
              exists: true,
              size: Number(size) || 0,
              mtime: new Date((Number(mtime) || 0) * 1000).toISOString(),
            };
          }
          resolve();
        });
        stream.on('error', () => resolve());
      });
    });
  }
}

// -------------------------------------------------------------------------
// Fuente compuesta: agrupa varios archivos (p. ej. Betty usa messages.log +
// state-manager.log). read() devuelve { <clave>: contenido } y 'change' se
// dispara cuando cambia CUALQUIERA de los archivos.
// -------------------------------------------------------------------------
class MultiLogSource extends EventEmitter {
  /** @param {Object<string, LocalFileLogSource|RemoteSshLogSource>} children  clave -> fuente de 1 archivo */
  constructor(children) {
    super();
    this.children = children; // { key: source }
    for (const [key, src] of Object.entries(children)) {
      src.on('change', () => this.emit('change', { key, ...this.stat() }));
    }
  }

  async start() {
    await Promise.all(Object.values(this.children).map((s) => s.start().catch((e) => {
      console.error(`[source] ${e.message}`);
    })));
    return this;
  }

  stop() {
    Object.values(this.children).forEach((s) => s.stop());
  }

  get ready() {
    return Object.values(this.children).every((s) => (typeof s.ready === 'boolean' ? s.ready : true));
  }

  stat() {
    const files = {};
    let size = 0;
    let mtime = null;
    let exists = true;
    for (const [key, src] of Object.entries(this.children)) {
      const st = src.stat();
      files[key] = st;
      size += st.size || 0;
      if (!st.exists) exists = false;
      if (st.mtime && (!mtime || st.mtime > mtime)) mtime = st.mtime;
    }
    return { exists, size, mtime, files };
  }

  /** @returns {Promise<Object<string,string>>} */
  async read() {
    const out = {};
    await Promise.all(Object.entries(this.children).map(async ([key, src]) => {
      out[key] = await src.read();
    }));
    return out;
  }
}

/** Crea una fuente de 1 archivo (local o ssh) segun la config. */
function createFileSource(filePath, config) {
  if (config.source && config.source.type === 'ssh') {
    return new RemoteSshLogSource({ ...config.source.ssh, remotePath: filePath }, config.watch);
  }
  return new LocalFileLogSource({
    logPath: filePath,
    debounceMs: config.watch.debounceMs,
    pollIntervalMs: config.watch.pollIntervalMs,
  });
}

/**
 * Fabrica por bot: devuelve una MultiLogSource con una fuente por cada archivo
 * declarado en bot.files.
 * @param {{files: Object<string,string>}} bot
 * @param {import('../config')} config
 */
function createBotSource(bot, config) {
  const children = {};
  for (const [key, filePath] of Object.entries(bot.files)) {
    children[key] = createFileSource(filePath, config);
  }
  return new MultiLogSource(children);
}

/** Compat: fuente de 1 solo archivo a partir de la config antigua. */
function createLogSource(config) {
  const p = config.logPath
    || (config.bots && config.bots[0] && Object.values(config.bots[0].files)[0]);
  return createFileSource(p, config);
}

module.exports = {
  createLogSource, createBotSource, createFileSource,
  LocalFileLogSource, RemoteSshLogSource, MultiLogSource,
};
