import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

for (const file of [process.argv[2] || 'DATOS CCTV.xlsx']) {
  const workbook=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
  const sheets=await workbook.inspect({kind:'sheet',include:'id,name',maxChars:2000});
  const alarm=await workbook.inspect({kind:'region',sheetId:'Alarmas OSZFORD',range:'A1:N10',maxChars:5000,tableMaxRows:10,tableMaxCols:14,tableMaxCellChars:80});
  console.log(`FILE ${file}\nSHEETS\n${sheets.ndjson}\nALARMAS\n${alarm.ndjson}`);
}
