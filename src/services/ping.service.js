const ping = require('ping');
const net = require('net');
const { getIO } = require('./socket.service');

const nodesToMonitor = [
    { id: 'ANFIGANE', ip: '192.168.8.43', name: 'ANFIGANE (Host 1)' },
    { id: 'AD',       ip: '192.168.8.44', name: 'AD01 Master' },
    { id: 'AD-DC02',  ip: '192.168.8.45', name: 'AD02 Secundario' },
    { id: 'AD-DC03',  ip: '192.168.8.46', name: 'AD03 Secundario' },
    { id: 'ANFI-SEG', ip: '192.168.8.41', name: 'ANFI-SEG13798 (Host 2)' },
    { id: 'KSC',      ip: '192.168.8.42', name: 'Kaspersky Security Center' },
    { id: 'PROXMOX-ZK', ip: '192.168.8.50', name: 'Proxmox Host ZK' },
    { id: 'SERV-ZK',  ip: '192.168.8.112', name: 'ZKBio CVSecurity VM' }
];

const tcpPortsToMonitor = [
    { id: 'BABYWARE', ip: '192.168.8.112', port: 16001, name: 'BabyWare Alarm Server' }
];

let pingInterval = null;

function checkTcpPort(target) {
    return new Promise((resolve) => {
        const startedAt = Date.now();
        const socket = new net.Socket();
        let settled = false;

        const finish = (status, error) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve({
                status,
                time: status === 'UP' ? Date.now() - startedAt : null,
                ip: target.ip,
                port: target.port,
                checkedAt: Date.now(),
                error: error || null
            });
        };

        socket.setTimeout(2000);
        socket.once('connect', () => finish('UP'));
        socket.once('timeout', () => finish('DOWN', 'timeout'));
        socket.once('error', (err) => finish('DOWN', err && err.message ? err.message : 'error'));
        socket.connect(target.port, target.ip);
    });
}

async function checkNodes() {
    try {
        const io = getIO();
        const results = {};

        for (const node of nodesToMonitor) {
            try {
                // DEBUG: indicar inicio de intento por nodo
                console.log(`📡 [PING_SVC] pinging ${node.id} @ ${node.ip}`);
                const res = await ping.promise.probe(node.ip, {
                    timeout: 2,
                    extra: ['-c', '1'] // En Windows se ignora extra o se mapea, pero probe es multi-os
                });

                results[node.id] = {
                    status: res.alive ? 'UP' : 'DOWN',
                    time: res.time, // Latencia en ms
                    ip: node.ip
                };
                // Marcar cuándo fue verificado en el servidor (timestamp ms)
                results[node.id].checkedAt = Date.now();
                // DEBUG: log del resultado por nodo
                try { console.log(`📡 [PING_SVC] result ${node.id}: alive=${res.alive} time=${res.time}`); } catch(e) {}
            } catch (err) {
                console.error(`📡 [PING_SVC] error pinging ${node.id} (${node.ip}):`, err && err.message ? err.message : err);
                results[node.id] = { status: 'DOWN', time: null, ip: node.ip };
            }
        }

        for (const target of tcpPortsToMonitor) {
            try {
                console.log(`📡 [PING_SVC] tcp ${target.id} @ ${target.ip}:${target.port}`);
                results[target.id] = await checkTcpPort(target);
                try { console.log(`📡 [PING_SVC] result ${target.id}: status=${results[target.id].status} time=${results[target.id].time}`); } catch(e) {}
            } catch (err) {
                console.error(`📡 [PING_SVC] error tcp ${target.id} (${target.ip}:${target.port}):`, err && err.message ? err.message : err);
                results[target.id] = { status: 'DOWN', time: null, ip: target.ip, port: target.port, checkedAt: Date.now() };
            }
        }

        // Agregar alias útiles para la UI
        if (results['AD-DC02']) {
            results['AD02'] = results['AD-DC02'];
            results['192.168.8.45'] = results['AD-DC02'];
        }
        if (results['AD-DC03']) {
            results['AD03'] = results['AD-DC03'];
            results['DA03'] = results['AD-DC03'];
            results['192.168.8.46'] = results['AD-DC03'];
        }
        if (results['KSC']) {
            results['SERV-KSC'] = results['KSC'];
            results['192.168.8.42'] = results['KSC'];
        }
        if (results['PROXMOX-ZK']) {
            results['PROXMOX'] = results['PROXMOX-ZK'];
            results['192.168.8.50'] = results['PROXMOX-ZK'];
        }
        if (results['SERV-ZK']) {
            results['ZK'] = results['SERV-ZK'];
            results['192.168.8.112'] = results['SERV-ZK'];
        }
        if (results['BABYWARE']) {
            results['BABYWARE-16001'] = results['BABYWARE'];
            results['SERV-ZK:16001'] = results['BABYWARE'];
            results['192.168.8.112:16001'] = results['BABYWARE'];
        }

        // Emitir estado global a todos los clientes conectados
        // Incluimos un timestamp por nodo (`checkedAt`) para que el cliente pueda
        // confiar en la marca de tiempo del servidor al calcular frescura.
        // DEBUG: imprimir resultados para diagnóstico en logs del servidor
        try {
            console.log('📡 [PING_SVC] hasil ping results:', Object.keys(results).join(', '));
            console.log('📡 [PING_SVC] AD-DC03 result:', results['AD-DC03'] || results['AD03'] || results['192.168.8.46'] || null);
        } catch (e) {
            // no bloquear emisión por fallo de logging
        }
        io.emit('monitoring:heartbeat', results);

    } catch (e) {
        // Silenciar si socket.io aún no está listo
    }
}

function startPingService() {
    console.log("📡 [PING_SVC] Iniciando servicio de latidos (Heartbeat) cada 10s...");
    
    // Check inicial a los 2 segundos
    setTimeout(checkNodes, 2000);

    // Bucle continuo cada 10 segundos
    pingInterval = setInterval(checkNodes, 10000);
}

function stopPingService() {
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
    }
}

module.exports = { startPingService, stopPingService };
