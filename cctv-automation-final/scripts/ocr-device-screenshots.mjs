import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createWorker } = require("C:/Users/johnathan.beltran/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/tesseract.js");

const inputDir = path.resolve(process.argv[2] || "Capturas Device Info");
const outputDir = path.resolve(process.argv[3] || "data/device-captures-ocr");
await fs.mkdir(outputDir, { recursive: true });
const worker = await createWorker("eng");
try {
  const files = (await fs.readdir(inputDir)).filter((f) => /\.png$/i.test(f)).sort();
  for (const file of files) {
    const result = await worker.recognize(path.join(inputDir, file));
    await fs.writeFile(path.join(outputDir, file.replace(/\.png$/i, ".txt")), result.data.text, "utf8");
    console.log(`${file}: ${Math.round(result.data.confidence)}%`);
  }
} finally {
  await worker.terminate();
}
