const { WPP_TOKEN, PHONE_NUMBER_ID, WPP_VERSION } = require("./Asamblea/src/config/env");

const recipient = "573177317342"; // Cambiar por el número del usuario para probar
const incoming_msg_id = "wamid.HBjNTczMTc3MzE3MzQyAhIAERgSRjAzOUMwNzE5RDNCNUE0MkY3AA=="; // ID real de un mensaje entrante si lo tienes

async function testTyping() {
    const url = `https://graph.facebook.com/${WPP_VERSION}/${PHONE_NUMBER_ID}/messages`;

    const payloads = [
        {
            name: "Status typing_on (Current)",
            body: {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: recipient,
                status: "typing_on"
            }
        },
        {
            name: "Status typing_on with message_id",
            body: {
                messaging_product: "whatsapp",
                status: "typing_on",
                message_id: incoming_msg_id
            }
        },
        {
            name: "Typing Indicator object",
            body: {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: recipient,
                typing_indicator: {
                    "type": "text"
                }
            }
        }
    ];

    for (const p of payloads) {
        console.log(`\nTesting: ${p.name}...`);
        try {
            const resp = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${WPP_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(p.body),
            });
            const data = await resp.json();
            console.log(`Status: ${resp.status}`);
            console.log(`Response: ${JSON.stringify(data, null, 2)}`);
        } catch (e) {
            console.error(`Error: ${e.message}`);
        }
    }
}

testTyping();
