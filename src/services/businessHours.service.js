// spec 0015 — ventana de horario de operación para el worker de monitoreo de puntos en
// tiempo real (src/worker.js). Copia independiente y sin dependencias de
// cctv-automation-final/platform/business-hours.js: son proyectos Node separados
// (package.json y despliegues propios), así que se duplica esta lógica chica en vez de
// importar entre uno y otro.

function parseClock(value) {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) throw new Error(`Hora inválida: ${value}`);
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) throw new Error(`Hora fuera de rango: ${value}`);
    return hour * 60 + minute;
}

function isWithinPointsMonitorWindow(date = new Date(), env = process.env) {
    const start = parseClock(env.POINTS_OPERATIONAL_WINDOW_START || '05:30');
    const end = parseClock(env.POINTS_OPERATIONAL_WINDOW_END || '22:30');
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
            .formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]),
    );
    const clock = parts.hour * 60 + parts.minute;
    return clock >= start && clock < end;
}

module.exports = { parseClock, isWithinPointsMonitorWindow };
