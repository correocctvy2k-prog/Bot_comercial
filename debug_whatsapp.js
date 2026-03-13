const fs = require('fs');
const path = require('path');

// Extract vars from .env manually to avoid complex loaders
const envPath = path.join(__dirname, 'Asamblea', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');

function getEnv(key) {
    const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return match ? match[1].trim() : null;
}

const token = getEnv('WPP_TOKEN');
const phoneId = getEnv('PHONE_NUMBER_ID');
const version = getEnv('WPP_VERSION') || 'v22.0';
const recipient = "573177317342"; // El número del usuario
const msg_id = "wamid.HBjNTczMTc3MzE3MzQyAhIAERgSRjAzOUMwNzE5RDNCNUE0MkY3AA=="; // Un ID real si existe

console.log("Config:", { phoneId, version, HasToken: !!token });

async function runTest() {
    const url = `https://graph.facebook.com/${version}/${phoneId}/messages`;

    const tests = [
        {
            name: "1. Read Confirmation (Control)",
            body: {
                messaging_product: "whatsapp",
                status: "read",
                message_id: msg_id
            }
        },
        {
            name: "2. Typing Indicator (Official 2025)",
            body: {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: recipient,
                typing_indicator: {
                    type: "text"
                }
            }
        },
        {
            name: "3. Typing Indicator + Message ID",
            body: {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: recipient,
                message_id: msg_id,
                typing_indicator: {
                    type: "text"
                }
            }
        },
        {
            name: "4. Legacy Sender Action",
            body: {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: recipient,
                sender_action: "typing_on"
            }
        }
    ];

    let log = "";

    for (const t of tests) {
        console.log(`Testing ${t.name}...`);
        log += `\n--- ${t.name} ---\n`;
        log += `Payload: ${JSON.stringify(t.body, null, 2)}\n`;

        try {
            const resp = await fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(t.body)
            });
            const data = await resp.json();
            log += `Status: ${resp.status}\n`;
            log += `Response: ${JSON.stringify(data, null, 2)}\n`;
        } catch (e) {
            log += `Error: ${e.message}\n`;
        }
    }

    fs.writeFileSync('whatsapp_diag_results.txt', log);
    console.log("Results saved to whatsapp_diag_results.txt");
}

runTest();
