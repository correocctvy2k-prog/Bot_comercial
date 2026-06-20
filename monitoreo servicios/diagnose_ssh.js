const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');

const targetsPath = path.join(__dirname, 'data', 'targets.json');
if (!fs.existsSync(targetsPath)) {
  console.error("No se encontró targets.json en data/");
  process.exit(1);
}

const targets = JSON.parse(fs.readFileSync(targetsPath, 'utf8'));

async function testSSH(target) {
  return new Promise((resolve) => {
    console.log(`\n=== Probando ${target.name} (${target.host}:${target.port}) ===`);
    const conn = new Client();
    let completed = false;

    const timer = setTimeout(() => {
      if (completed) return;
      completed = true;
      console.log(`[-] ${target.name}: TIMEOUT después de 10s`);
      conn.end();
      resolve();
    }, 10000);

    conn
      .on('keyboard-interactive', (name, instr, lang, prompts, finish) => {
        console.log(`[*] keyboard-interactive solicitado. Prompts:`, prompts.map(p => p.prompt));
        finish(prompts.map(() => target.password));
      })
      .on('ready', () => {
        console.log(`[+] ${target.name}: CONEXION EXITOSA (Ready)`);
        conn.exec('uptime', (err, stream) => {
          if (err) {
            console.error(`[-] Error en exec:`, err.message);
          } else {
            stream.on('data', (data) => {
              console.log(`[+] Output: ${data.toString().trim()}`);
            });
          }
          setTimeout(() => {
            completed = true;
            clearTimeout(timer);
            conn.end();
            resolve();
          }, 1000);
        });
      })
      .on('error', (err) => {
        if (completed) return;
        completed = true;
        clearTimeout(timer);
        console.log(`[-] ${target.name}: ERROR - ${err.message}`);
        resolve();
      })
      .connect({
        host: target.host,
        port: target.port,
        username: target.username,
        password: target.password,
        readyTimeout: 10000,
        tryKeyboard: true,
        debug: (msg) => {
          if (msg.includes('Authentication') || msg.includes('error') || msg.includes('Uncaught') || msg.includes('kex')) {
            console.log(`  [SSH Debug] ${msg}`);
          }
        }
      });
  });
}

async function run() {
  for (const target of targets) {
    if (target.enabled !== false && target.type === 'linux') {
      await testSSH(target);
    }
  }
  console.log('\n=== Diagnóstico Finalizado ===');
}

run();
