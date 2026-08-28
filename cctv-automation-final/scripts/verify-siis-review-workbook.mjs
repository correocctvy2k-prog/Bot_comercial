import fs from 'node:fs/promises';
import path from 'node:path';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const [inputArg, previewArg] = process.argv.slice(2);
const input=path.resolve(inputArg), previewDir=path.resolve(previewArg);
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(input));
console.log((await wb.inspect({kind:'workbook,sheet,table',maxChars:8000,tableMaxRows:8,tableMaxCols:18})).ndjson);
console.log((await wb.inspect({kind:'table',sheetId:'Instrucciones',range:'A1:H23',include:'values,formulas',maxChars:10000,tableMaxRows:25,tableMaxCols:8})).ndjson);
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',options:{useRegex:true,maxResults:100},summary:'formula errors'})).ndjson);
await fs.mkdir(previewDir,{recursive:true});
for(const sheet of wb.worksheets.items){const img=await wb.render({sheetName:sheet.name,autoCrop:'all',scale:1,format:'png'});await fs.writeFile(path.join(previewDir,`${sheet.name}.png`),new Uint8Array(await img.arrayBuffer()));}
