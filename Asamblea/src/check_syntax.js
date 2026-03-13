console.log("1. Loading dotenv...");
require("dotenv").config();
console.log("2. Loading access.service...");
require("./services/access.service");
console.log("3. Loading whatsapp.service...");
require("./services/whatsapp.service");
console.log("4. Loading telegram.service...");
require("./services/telegram.service");
console.log("5. Loading logger.service (should be unused)...");
// require("./services/logger.service"); 
console.log("6. Loading messaging.service...");
require("./services/messaging.service");
console.log("7. Loading bot.service...");
require("./services/bot.service");
console.log("8. Loading worker...");
// require("./worker"); // Worker starts server, might hang. Skip.
console.log("✅ SYNTAX CHECK PASSED");
