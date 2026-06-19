const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { Client } = require('ssh2');

const PORT = Number(process.env.PORT || 3003);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 15000);
const SSH_TIMEOUT_MS = Number(process.env.SSH_TIMEOUT_MS || 15000);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const TARGETS_FILE = path.join(DATA_DIR, 'targets.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const state = {
  targets: [],
  results: new Map(),
  polling: false,
  lastSweepAt: null
};

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Payload demasiado grande'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('JSON invalido'));
      }
    });
    req.on('error', reject);
  });
}

function normalizeTarget(input, existing = {}) {
  const name = String(input.name || existing.name || '').trim();
  const host = String(input.host || existing.host || '').trim();
  const port = Number(input.port || existing.port || 22);
  const type = String(input.type || existing.type || 'linux').trim();

  if (!name) throw new Error('El nombre es obligatorio');
  if (!host) throw new Error('La IP o hostname es obligatorio');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('El puerto debe estar entre 1 y 65535');
  }

  const password =
    Object.prototype.hasOwnProperty.call(input, 'password') && input.password !== ''
      ? String(input.password)
      : existing.password || '';

  return {
    id: existing.id || input.id || crypto.randomUUID(),
    name,
    host,
    port,
    username: String(input.username || existing.username || '').trim(),
    password,
    type,
    enabled: typeof input.enabled === 'boolean' ? input.enabled : existing.enabled ?? true,
    tags: Array.isArray(input.tags)
      ? input.tags.map(tag => String(tag).trim()).filter(Boolean)
      : typeof input.tags === 'string'
        ? input.tags.split(',').map(tag => tag.trim()).filter(Boolean)
        : existing.tags || [],
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function publicTarget(target) {
  const { password, ...safe } = target;
  return {
    ...safe,
    hasPassword: Boolean(password)
  };
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function loadTargets() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(TARGETS_FILE, 'utf8');
    state.targets = JSON.parse(raw);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    state.targets = [];
    await saveTargets();
  }
}

async function saveTargets() {
  await ensureDataDir();
  await fs.writeFile(TARGETS_FILE, JSON.stringify(state.targets, null, 2), 'utf8');
}

function tcpCheck(target) {
  const startedAt = Date.now();
  return new Promise(resolve => {
    const socket = net.createConnection({ host: target.host, port: target.port });
    const finish = result => {
      socket.destroy();
      resolve({
        ok: result.ok,
        latencyMs: Date.now() - startedAt,
        error: result.error || null
      });
    };

    socket.setTimeout(SSH_TIMEOUT_MS);
    socket.once('connect', () => finish({ ok: true }));
    socket.once('timeout', () => finish({ ok: false, error: 'timeout' }));
    socket.once('error', error => finish({ ok: false, error: error.message }));
  });
}

function sshExec(target, command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      conn.end();
      reject(new Error('SSH timeout'));
    }, SSH_TIMEOUT_MS);

    conn
      .on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
        finish(prompts.map(() => target.password));
      })
      .on('ready', () => {
        conn.exec(command, (error, stream) => {
          if (error) {
            clearTimeout(timeout);
            settled = true;
            conn.end();
            reject(error);
            return;
          }

          let stdout = '';
          let stderr = '';
          stream.on('data', chunk => {
            stdout += chunk.toString();
          });
          stream.stderr.on('data', chunk => {
            stderr += chunk.toString();
          });
          stream.on('close', code => {
            clearTimeout(timeout);
            settled = true;
            conn.end();
            if (code !== 0 && !stdout.trim()) {
              reject(new Error(stderr.trim() || `SSH command failed with code ${code}`));
              return;
            }
            resolve(stdout.trim());
          });
        });
      })
      .on('error', error => {
        if (settled) return;
        clearTimeout(timeout);
        settled = true;
        reject(error);
      })
      .connect({
        host: target.host,
        port: target.port,
        username: target.username,
        password: target.password,
        readyTimeout: SSH_TIMEOUT_MS,
        tryKeyboard: true
      });
  });
}

function linuxMetricsCommand() {
  return String.raw`
set +e
echo "__KV__"
printf "PLATFORM=%s\n" "$(uname -srm 2>/dev/null)"
printf "HOSTNAME=%s\n" "$(hostname 2>/dev/null)"
printf "UPTIME=%s\n" "$(uptime -p 2>/dev/null || uptime 2>/dev/null)"
printf "CORES=%s\n" "$(nproc 2>/dev/null || echo 1)"
awk 'NR==1 {i1=$5+$6; t1=0; for (x=2; x<=NF; x++) t1+=$x} END {printf "CPU1_IDLE=%d\nCPU1_TOTAL=%d\n", i1, t1}' /proc/stat
sleep 0.5
awk 'NR==1 {i2=$5+$6; t2=0; for (x=2; x<=NF; x++) t2+=$x} END {printf "CPU2_IDLE=%d\nCPU2_TOTAL=%d\n", i2, t2}' /proc/stat
awk '{printf "LOAD1=%s\nLOAD5=%s\nLOAD15=%s\n", $1, $2, $3}' /proc/loadavg
awk '
  /^MemTotal:/ {mt=$2}
  /^MemAvailable:/ {ma=$2}
  /^MemFree:/ {mf=$2}
  /^Buffers:/ {buf=$2}
  /^Cached:/ {cache=$2}
  /^SReclaimable:/ {sr=$2}
  /^Shmem:/ {shm=$2}
  /^SwapTotal:/ {st=$2}
  /^SwapFree:/ {sf=$2}
  END {
    if (ma == 0) {
      ma = mf + buf + cache + sr - shm;
      if (ma < 0) ma = mf;
    }
    mu=mt-ma; su=st-sf;
    printf "MEM_TOTAL_MB=%d\nMEM_USED_MB=%d\nMEM_AVAILABLE_MB=%d\n", mt/1024, mu/1024, ma/1024;
    if (mt > 0) printf "MEM_USED_PERCENT=%.2f\n", (mu/mt)*100; else print "MEM_USED_PERCENT=0";
    printf "SWAP_TOTAL_MB=%d\nSWAP_USED_MB=%d\n", st/1024, su/1024;
    if (st > 0) printf "SWAP_USED_PERCENT=%.2f\n", (su/st)*100; else print "SWAP_USED_PERCENT=0";
  }
' /proc/meminfo
df -P -h | awk 'NR>1 {gsub("%","",$5); printf "%s\t%s\t%s\t%s\t%s\t%s\n", $1, $6, $2, $3, $4, $5}' | sed 's/^/FS\t/'
df -P -h / | awk 'NR==2 {gsub("%","",$5); printf "DISK_SIZE=%s\nDISK_USED=%s\nDISK_AVAILABLE=%s\nDISK_USED_PERCENT=%s\n", $2, $3, $4, $5}'
df -P -i / | awk 'NR==2 {gsub("%","",$5); printf "INODE_USED_PERCENT=%s\n", $5}'
echo "__DOCKER_PS__"
if command -v docker >/dev/null 2>&1; then
  docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.State}}\t{{.Status}}' 2>/dev/null
fi
echo "__DOCKER_STATS__"
if command -v docker >/dev/null 2>&1; then
  docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}' 2>/dev/null
fi
echo "__SHAREPLEX_PS__"
ps -eo pid,comm,args 2>/dev/null | awk 'tolower($0) ~ /sp_cop|sp_ctrl|shareplex/ && $0 !~ /awk/ {print}'
echo "__SHAREPLEX_PORTS__"
if command -v ss >/dev/null 2>&1; then
  ss -ltnp 2>/dev/null | awk 'tolower($0) ~ /sp_cop|shareplex/ || $4 ~ /:2100$|:2101$|:2102$|:2103$/ {print}'
elif command -v netstat >/dev/null 2>&1; then
  netstat -ltnp 2>/dev/null | awk 'tolower($0) ~ /sp_cop|shareplex/ || $4 ~ /:2100$|:2101$|:2102$|:2103$/ {print}'
fi
echo "__END__"
`;
}

function parseKeyValueSection(lines) {
  const values = {};
  for (const line of lines) {
    const index = line.indexOf('=');
    if (index === -1) continue;
    values[line.slice(0, index)] = line.slice(index + 1);
  }
  return values;
}

function parseDockerRows(psLines, statsLines) {
  const statsByName = new Map();
  for (const line of statsLines) {
    const [name, cpu, mem, memoryUsage, netIO, blockIO] = line.split('\t');
    if (!name) continue;
    statsByName.set(name, { cpu, mem, memoryUsage, netIO, blockIO });
  }

  const containers = psLines.filter(Boolean).map(line => {
    const [name, image, status, statusText] = line.split('\t');
    const stats = statsByName.get(name) || {};
    return {
      name,
      image,
      status: String(status || '').toLowerCase(),
      statusText,
      cpuPercent: Number(String(stats.cpu || '0').replace('%', '')) || 0,
      memoryUsage: stats.memoryUsage || '',
      memoryPercent: Number(String(stats.mem || '0').replace('%', '')) || 0,
      netIO: stats.netIO || '',
      blockIO: stats.blockIO || ''
    };
  });

  return {
    available: psLines.length > 0,
    summary: {
      running: containers.filter(container => container.status === 'running').length,
      exited: containers.filter(container => container.status === 'exited').length,
      restarting: containers.filter(container => container.status === 'restarting').length
    },
    containers
  };
}

function parseSharePlex(psLines, portLines) {
  const processes = psLines
    .filter(Boolean)
    .map(line => line.trim())
    .filter(Boolean);
  const ports = portLines
    .filter(Boolean)
    .map(line => line.trim())
    .filter(Boolean);

  return {
    detected: processes.length > 0 || ports.length > 0,
    running: processes.some(line => /sp_cop/i.test(line)),
    processCount: processes.length,
    processes: processes.slice(0, 8),
    ports: ports.slice(0, 8)
  };
}

function parseFilesystemRows(lines) {
  return lines
    .filter(line => line.startsWith('FS\t'))
    .map(line => {
      const [, filesystem, mount, size, used, available, usedPercent] = line.split('\t');
      return {
        filesystem,
        mount,
        name: mount || filesystem,
        size,
        used,
        available,
        usedPercent: numberValue(usedPercent)
      };
    })
    .filter(item => item.filesystem && item.mount);
}

function numberValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseLinuxMetrics(raw) {
  const lines = raw.split(/\r?\n/);
  const kvStart = lines.indexOf('__KV__');
  const dockerStart = lines.indexOf('__DOCKER_PS__');
  const statsStart = lines.indexOf('__DOCKER_STATS__');
  const sharePlexStart = lines.indexOf('__SHAREPLEX_PS__');
  const sharePlexPortsStart = lines.indexOf('__SHAREPLEX_PORTS__');
  const end = lines.indexOf('__END__');

  const kvLines = lines.slice(kvStart + 1, dockerStart);
  const psLines = lines.slice(dockerStart + 1, statsStart);
  const statsLines = lines.slice(statsStart + 1, sharePlexStart === -1 ? (end === -1 ? lines.length : end) : sharePlexStart);
  const sharePlexLines = sharePlexStart === -1 ? [] : lines.slice(sharePlexStart + 1, sharePlexPortsStart === -1 ? (end === -1 ? lines.length : end) : sharePlexPortsStart);
  const sharePlexPortLines = sharePlexPortsStart === -1 ? [] : lines.slice(sharePlexPortsStart + 1, end === -1 ? lines.length : end);
  const values = parseKeyValueSection(kvLines);

  const totalDelta = numberValue(values.CPU2_TOTAL) - numberValue(values.CPU1_TOTAL);
  const idleDelta = numberValue(values.CPU2_IDLE) - numberValue(values.CPU1_IDLE);
  const cpuPercent = totalDelta > 0 ? Number((((totalDelta - idleDelta) / totalDelta) * 100).toFixed(2)) : 0;

  return {
    platform: values.PLATFORM || '',
    hostname: values.HOSTNAME || '',
    checkedAt: new Date().toISOString(),
    uptime: values.UPTIME || '',
    cpu: {
      cores: numberValue(values.CORES) || 1,
      usagePercent: cpuPercent,
      load1: numberValue(values.LOAD1),
      load5: numberValue(values.LOAD5),
      load15: numberValue(values.LOAD15)
    },
    memory: {
      totalMb: numberValue(values.MEM_TOTAL_MB),
      usedMb: numberValue(values.MEM_USED_MB),
      availableMb: numberValue(values.MEM_AVAILABLE_MB),
      usedPercent: numberValue(values.MEM_USED_PERCENT),
      swap: {
        totalMb: numberValue(values.SWAP_TOTAL_MB),
        usedMb: numberValue(values.SWAP_USED_MB),
        usedPercent: numberValue(values.SWAP_USED_PERCENT)
      }
    },
    disk: {
      mount: '/',
      size: values.DISK_SIZE || '',
      used: values.DISK_USED || '',
      available: values.DISK_AVAILABLE || '',
      usedPercent: numberValue(values.DISK_USED_PERCENT),
      inodeUsedPercent: numberValue(values.INODE_USED_PERCENT)
    },
    filesystems: parseFilesystemRows(kvLines),
    docker: parseDockerRows(psLines, statsLines),
    shareplex: parseSharePlex(sharePlexLines, sharePlexPortLines)
  };
}

function buildAlerts(tcp, metrics) {
  const alerts = [];
  if (!tcp.ok) {
    alerts.push({ severity: 'critical', message: `Puerto no responde: ${tcp.error || 'sin conexion'}` });
  }
  if (!metrics) return alerts;

  if (metrics.memory?.usedPercent >= 90) alerts.push({ severity: 'critical', message: 'RAM critica' });
  else if (metrics.memory?.usedPercent >= 75) alerts.push({ severity: 'medium', message: 'RAM elevada' });

  const swap = metrics.memory?.swap;
  if (swap?.usedPercent >= 60) alerts.push({ severity: 'high', message: 'Swap elevada' });
  else if (swap?.usedPercent >= 25) alerts.push({ severity: 'medium', message: 'Swap en uso' });

  if (metrics.disk?.usedPercent >= 90) alerts.push({ severity: 'critical', message: 'Disco raiz casi lleno' });
  else if (metrics.disk?.usedPercent >= 75) alerts.push({ severity: 'medium', message: 'Disco raiz elevado' });

  for (const container of metrics.docker?.containers || []) {
    if (container.status === 'exited' || container.status === 'dead') {
      alerts.push({ severity: 'critical', message: `Contenedor detenido: ${container.name}` });
    }
    if (container.status === 'restarting') {
      alerts.push({ severity: 'high', message: `Contenedor reiniciando: ${container.name}` });
    }
  }

  return alerts;
}

function severityRank(severity) {
  return {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
    info: 0
  }[severity] ?? 0;
}

function smartAlert(target, severity, scope, title, message, recommendation, value = null) {
  return {
    id: `${target.id}:${scope}:${title}`.toLowerCase().replace(/[^a-z0-9:]+/g, '-'),
    targetId: target.id,
    targetName: target.name,
    severity,
    scope,
    title,
    message,
    recommendation,
    value,
    createdAt: new Date().toISOString()
  };
}

function buildSmartAlertsForTarget(target, result) {
  const alerts = [];
  const metrics = result?.metrics;

  if (!target.enabled) return alerts;

  if (!result) {
    alerts.push(smartAlert(
      target,
      'medium',
      'monitor',
      'Sin lectura',
      'El servidor aun no tiene una lectura disponible.',
      'Espera el siguiente ciclo o valida conectividad desde el monitor.'
    ));
    return alerts;
  }

  if (result.status === 'offline') {
    alerts.push(smartAlert(
      target,
      'critical',
      'connectivity',
      'Servidor fuera de linea',
      `${target.name} no responde en ${target.host}:${target.port}.`,
      'Verifica red, firewall, servicio SSH y estado general del servidor.',
      result.tcp?.error || null
    ));
  }

  if (result.status === 'degraded') {
    alerts.push(smartAlert(
      target,
      'high',
      'ssh',
      'Servidor degradado',
      `${target.name} responde por puerto, pero no entrega metricas SSH.`,
      'Valida usuario, clave, permisos SSH y autenticacion keyboard-interactive.',
      result.sshError || null
    ));
  }

  if (!metrics) return alerts;

  const cpu = Number(metrics.cpu?.usagePercent || 0);
  if (cpu >= 95) {
    alerts.push(smartAlert(target, 'critical', 'cpu', 'CPU critica', `${target.name} tiene CPU en ${cpu.toFixed(1)}%.`, 'Revisa procesos con mayor consumo y carga del servidor.', cpu));
  } else if (cpu >= 80) {
    alerts.push(smartAlert(target, 'high', 'cpu', 'CPU alta', `${target.name} tiene CPU en ${cpu.toFixed(1)}%.`, 'Observa tendencia y procesos activos si se mantiene alto.', cpu));
  }

  const cores = Number(metrics.cpu?.cores || 1);
  const load1 = Number(metrics.cpu?.load1 || 0);
  if (load1 > cores * 2) {
    alerts.push(smartAlert(target, 'critical', 'load', 'Load critico', `${target.name} tiene load ${load1} con ${cores} cores.`, 'Revisa procesos bloqueados, I/O y saturacion de CPU.', load1));
  } else if (load1 > cores) {
    alerts.push(smartAlert(target, 'medium', 'load', 'Load elevado', `${target.name} tiene load ${load1} con ${cores} cores.`, 'Monitorea si la cola de procesos sigue creciendo.', load1));
  }

  const ram = Number(metrics.memory?.usedPercent || 0);
  if (ram >= 95) {
    alerts.push(smartAlert(target, 'critical', 'memory', 'RAM critica', `${target.name} tiene RAM en ${ram.toFixed(1)}%.`, 'Revisa servicios/procesos con mayor consumo y posible fuga de memoria.', ram));
  } else if (ram >= 85) {
    alerts.push(smartAlert(target, 'high', 'memory', 'RAM alta', `${target.name} tiene RAM en ${ram.toFixed(1)}%.`, 'Observa tendencia y valida procesos de mayor uso.', ram));
  }

  const swap = Number(metrics.memory?.swap?.usedPercent || 0);
  if (swap >= 60) {
    alerts.push(smartAlert(target, 'high', 'swap', 'Swap alta', `${target.name} tiene swap en ${swap.toFixed(1)}%.`, 'Valida presion de memoria y servicios que esten paginando.', swap));
  } else if (swap >= 25) {
    alerts.push(smartAlert(target, 'medium', 'swap', 'Swap en uso', `${target.name} tiene swap en ${swap.toFixed(1)}%.`, 'Monitorea si aumenta durante el dia.', swap));
  }

  for (const fsItem of metrics.filesystems || []) {
    const pct = Number(fsItem.usedPercent || 0);
    const name = fsItem.name || fsItem.mount || fsItem.filesystem;
    if (pct >= 95) {
      alerts.push(smartAlert(target, 'critical', 'disk', 'Particion critica', `${target.name} tiene ${name} al ${pct.toFixed(1)}%.`, 'Libera espacio, revisa logs, backups o archivos temporales.', pct));
    } else if (pct >= 85) {
      alerts.push(smartAlert(target, 'high', 'disk', 'Particion alta', `${target.name} tiene ${name} al ${pct.toFixed(1)}%.`, 'Programa limpieza o expansion antes de llegar a nivel critico.', pct));
    }
  }

  const docker = metrics.docker;
  for (const container of docker?.containers || []) {
    const name = container.name || 'contenedor';
    const status = container.status || 'unknown';
    const cCpu = Number(container.cpuPercent || 0);
    const cRam = Number(container.memoryPercent || 0);

    if (status !== 'running') {
      alerts.push(smartAlert(target, 'critical', 'docker', 'Contenedor no activo', `${target.name}: ${name} esta en estado ${status}.`, 'Revisa logs del contenedor y causa de salida/reinicio.', status));
    }
    if (cCpu >= 90) {
      alerts.push(smartAlert(target, 'high', 'docker-cpu', 'Contenedor con CPU alta', `${target.name}: ${name} usa CPU ${cCpu.toFixed(1)}%.`, 'Revisa carga de la aplicacion dentro del contenedor.', cCpu));
    }
    if (cRam >= 90) {
      alerts.push(smartAlert(target, 'high', 'docker-ram', 'Contenedor con RAM alta', `${target.name}: ${name} usa RAM ${cRam.toFixed(1)}%.`, 'Valida limites, memoria disponible y posible fuga.', cRam));
    }
  }

  const shareplex = metrics.shareplex;
  if (shareplex?.detected && !shareplex.running) {
    alerts.push(smartAlert(
      target,
      'high',
      'shareplex',
      'SharePlex detectado no activo',
      `${target.name} tiene rastros de SharePlex, pero sp_cop no aparece activo.`,
      'Valida estado de sp_cop/sp_ctrl y replicacion antes de intervenir.',
      shareplex.processCount || 0
    ));
  }

  return alerts;
}

function buildSmartAlerts() {
  const alerts = state.targets.flatMap(target => buildSmartAlertsForTarget(target, state.results.get(target.id)));
  return alerts.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

async function checkTarget(target) {
  const checkedAt = new Date().toISOString();
  if (!target.enabled) {
    return {
      targetId: target.id,
      status: 'paused',
      checkedAt,
      tcp: null,
      metrics: null,
      alerts: []
    };
  }

  const tcp = await tcpCheck(target);
  let metrics = null;
  let sshError = null;

  if (tcp.ok && target.type === 'linux' && target.username && target.password) {
    try {
      const raw = await sshExec(target, linuxMetricsCommand());
      metrics = parseLinuxMetrics(raw);
    } catch (error) {
      sshError = error.message;
    }
  }

  const alerts = buildAlerts(tcp, metrics);
  if (sshError) alerts.push({ severity: 'medium', message: `SSH sin metricas: ${sshError}` });

  return {
    targetId: target.id,
    status: tcp.ok && !sshError ? 'online' : tcp.ok ? 'degraded' : 'offline',
    checkedAt,
    tcp,
    metrics,
    sshError,
    alerts
  };
}

async function runSweep() {
  if (state.polling) return;
  state.polling = true;
  try {
    const enabledTargets = [...state.targets];
    const results = await Promise.all(enabledTargets.map(target => checkTarget(target)));
    for (const result of results) {
      state.results.set(result.targetId, result);
    }
    state.lastSweepAt = new Date().toISOString();
  } finally {
    state.polling = false;
  }
}

function dashboardState() {
  return {
    updatedAt: new Date().toISOString(),
    lastSweepAt: state.lastSweepAt,
    pollIntervalMs: POLL_INTERVAL_MS,
    smartAlerts: buildSmartAlerts(),
    targets: state.targets.map(target => ({
      ...publicTarget(target),
      result: state.results.get(target.id) || null
    }))
  };
}

function buildAnalysis() {
  const targets = state.targets.map(target => ({
    ...publicTarget(target),
    result: state.results.get(target.id) || null
  }));

  const online = targets.filter(target => target.result?.status === 'online');
  const degraded = targets.filter(target => target.result?.status === 'degraded');
  const offline = targets.filter(target => target.result?.status === 'offline');

  const resources = targets
    .map(target => {
      const metrics = target.result?.metrics;
      if (!metrics) return null;
      return {
        id: target.id,
        name: target.name,
        status: target.result?.status || 'unknown',
        cpuPercent: metrics.cpu?.usagePercent ?? null,
        ramPercent: metrics.memory?.usedPercent ?? null,
        swapPercent: metrics.memory?.swap?.usedPercent ?? null,
        diskPercent: metrics.disk?.usedPercent ?? null,
        uptime: metrics.uptime || null
      };
    })
    .filter(Boolean);

  const partitions = targets.flatMap(target => {
    const filesystems = target.result?.metrics?.filesystems || [];
    return filesystems.map(fsItem => ({
      serverId: target.id,
      serverName: target.name,
      name: fsItem.name || fsItem.mount || fsItem.filesystem,
      filesystem: fsItem.filesystem,
      mount: fsItem.mount,
      size: fsItem.size,
      used: fsItem.used,
      available: fsItem.available,
      usedPercent: fsItem.usedPercent
    }));
  });

  const containers = targets.flatMap(target => {
    const dockerContainers = target.result?.metrics?.docker?.containers || [];
    return dockerContainers.map(container => ({
      serverId: target.id,
      serverName: target.name,
      name: container.name,
      image: container.image,
      status: container.status,
      statusText: container.statusText,
      cpuPercent: container.cpuPercent,
      memoryPercent: container.memoryPercent,
      memoryUsage: container.memoryUsage
    }));
  });

  const shareplex = targets
    .map(target => {
      const service = target.result?.metrics?.shareplex;
      if (!service?.detected) return null;
      return {
        serverId: target.id,
        serverName: target.name,
        running: service.running,
        processCount: service.processCount,
        ports: service.ports || []
      };
    })
    .filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    lastSweepAt: state.lastSweepAt,
    smartAlerts: buildSmartAlerts(),
    summary: {
      total: targets.length,
      online: online.length,
      degraded: degraded.length,
      offline: offline.length,
      containers: containers.length,
      partitions: partitions.length,
      shareplex: shareplex.length
    },
    degraded: degraded.map(target => ({
      id: target.id,
      name: target.name,
      host: target.host,
      reason: target.result?.sshError || target.result?.tcp?.error || 'Sin detalle'
    })),
    resources: {
      highestCpu: [...resources].sort((a, b) => (b.cpuPercent || 0) - (a.cpuPercent || 0)).slice(0, 5),
      highestRam: [...resources].sort((a, b) => (b.ramPercent || 0) - (a.ramPercent || 0)).slice(0, 5),
      highestSwap: [...resources].sort((a, b) => (b.swapPercent || 0) - (a.swapPercent || 0)).slice(0, 5)
    },
    partitions: {
      highestUsage: [...partitions].sort((a, b) => (b.usedPercent || 0) - (a.usedPercent || 0)).slice(0, 12),
      warnings: partitions.filter(item => Number(item.usedPercent || 0) >= 75)
    },
    containers: {
      all: containers,
      notRunning: containers.filter(container => container.status !== 'running'),
      highestCpu: [...containers].sort((a, b) => (b.cpuPercent || 0) - (a.cpuPercent || 0)).slice(0, 10),
      highestMemory: [...containers].sort((a, b) => (b.memoryPercent || 0) - (a.memoryPercent || 0)).slice(0, 10)
    },
    shareplex
  };
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/state') {
    sendJson(res, 200, dashboardState());
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/analysis') {
    sendJson(res, 200, buildAnalysis());
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/targets') {
    sendJson(res, 200, state.targets.map(publicTarget));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/targets') {
    try {
      const body = await readBody(req);
      const target = normalizeTarget(body);
      state.targets.push(target);
      await saveTargets();
      runSweep();
      sendJson(res, 201, publicTarget(target));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  const targetMatch = url.pathname.match(/^\/api\/targets\/([^/]+)$/);
  if (targetMatch && req.method === 'PUT') {
    try {
      const id = targetMatch[1];
      const index = state.targets.findIndex(target => target.id === id);
      if (index === -1) {
        sendJson(res, 404, { error: 'Servidor no encontrado' });
        return;
      }
      const body = await readBody(req);
      const target = normalizeTarget({ ...body, id }, state.targets[index]);
      state.targets[index] = target;
      await saveTargets();
      runSweep();
      sendJson(res, 200, publicTarget(target));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (targetMatch && req.method === 'DELETE') {
    const id = targetMatch[1];
    const before = state.targets.length;
    state.targets = state.targets.filter(target => target.id !== id);
    state.results.delete(id);
    await saveTargets();
    sendJson(res, before === state.targets.length ? 404 : 200, { ok: before !== state.targets.length });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/sweep') {
    runSweep();
    sendJson(res, 202, { ok: true });
    return;
  }

  sendJson(res, 404, { error: 'API no encontrada' });
}

async function serveStatic(req, res, url) {
  const requestPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': contentTypes[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=60'
    });
    res.end(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(error.message);
  }
}

async function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function main() {
  await loadTargets();
  await runSweep();
  setInterval(runSweep, POLL_INTERVAL_MS).unref();

  const server = http.createServer(requestHandler);
  server.listen(PORT, () => {
    console.log(`Skylab Node Monitor listo en http://localhost:${PORT}`);
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
