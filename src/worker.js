// spec 0015 — worker dedicado al monitoreo de puntos en tiempo real (ping cada minuto,
// en horario de operación), separado por completo del bot de WhatsApp (comercial-bot).
// Corre en su propio contenedor Docker (comercial-worker, ya declarado en
// docker-compose.yml -- este archivo era el que faltaba).
//
// Reutiliza monitor_puntos_wpp.py (ya probado, ya paralelo, ya escribe a Supabase) con un
// modo nuevo (--tipo ping_only) que corta antes de generar el reporte/gráfico del bot.
require('dotenv').config();

const cron = require('node-cron');
const { spawn } = require('child_process');
const path = require('path');
const { isWithinPointsMonitorWindow } = require('./services/businessHours.service');

function pickPython() {
    if (process.env.PYTHON_BIN && process.env.PYTHON_BIN.trim()) return process.env.PYTHON_BIN.trim();
    return 'python';
}

function runPingCycle() {
    return new Promise((resolve) => {
        const pythonBin = pickPython();
        const scriptPath = process.env.MONITOR_SCRIPT || path.resolve(__dirname, '..', 'monitor_puntos_wpp.py');
        const child = spawn(pythonBin, [scriptPath, '--json', '--tipo', 'ping_only'], {
            windowsHide: true,
            cwd: path.dirname(scriptPath),
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        });

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.stderr.on('data', (chunk) => { stderr += chunk; });

        child.on('close', (code) => {
            if (code !== 0) {
                console.error(`[points-ping-worker] ciclo fallo (code=${code}): ${stderr.trim().slice(-500)}`);
                return resolve();
            }
            try {
                const summary = JSON.parse(stdout.trim());
                console.log('[points-ping-worker] ciclo ok:', summary);
            } catch {
                console.log('[points-ping-worker] ciclo ok (salida no JSON):', stdout.trim().slice(-300));
            }
            resolve();
        });

        child.on('error', (err) => {
            console.error(`[points-ping-worker] no se pudo lanzar python: ${err.message}`);
            resolve();
        });
    });
}

let running = false;

cron.schedule('* * * * *', async () => {
    if (!isWithinPointsMonitorWindow()) return;
    if (running) {
        console.log('[points-ping-worker] ciclo anterior aún en curso, se omite este minuto');
        return;
    }
    running = true;
    try {
        await runPingCycle();
    } finally {
        running = false;
    }
}, { timezone: 'America/Bogota' });

console.log(`[points-ping-worker] iniciado — ping cada minuto en horario ${process.env.POINTS_OPERATIONAL_WINDOW_START || '05:30'}-${process.env.POINTS_OPERATIONAL_WINDOW_END || '22:30'} (America/Bogota)`);
