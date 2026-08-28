'use strict';

const DEFAULT_WINDOWS = 'APERTURA@05:30-09:45,CIERRE_MEDIODIA@12:30-14:15,REAPERTURA@14:30-16:30,CIERRE_ESPECIAL@17:30-19:00,CIERRE_NOCTURNO@20:30-23:00';

function parseClock(value) {
  const match=String(value||'').trim().match(/^(\d{1,2}):(\d{2})$/);
  if(!match)throw new Error(`Hora inválida: ${value}`);
  const hour=Number(match[1]),minute=Number(match[2]);
  if(hour>23||minute>59)throw new Error(`Hora fuera de rango: ${value}`);
  return hour*60+minute;
}

function parseWindows(value=DEFAULT_WINDOWS) {
  return String(value||DEFAULT_WINDOWS).split(',').map(entry=>{
    const [labelPart,rangePart]=entry.trim().includes('@')?entry.trim().split('@'):[`VENTANA_${entry}`,entry.trim()];
    const [from,to]=rangePart.split('-');
    return {label:labelPart.trim(),from:parseClock(from),to:parseClock(to),range:`${from}-${to}`};
  }).sort((a,b)=>a.from-b.from);
}

function observerPolicy(clock,env={}) {
  const peak=Math.max(2,Number(env.SIIS_PEAK_INTERVAL_MINUTES||5)),normal=Math.max(5,Number(env.SIIS_NORMAL_INTERVAL_MINUTES||5));
  const windows=parseWindows(env.SIIS_PEAK_WINDOWS||DEFAULT_WINDOWS),activeWindow=windows.find(window=>clock>=window.from&&clock<window.to);
  const start=Math.min(...windows.map(window=>window.from)),end=Math.max(...windows.map(window=>window.to));
  if(clock<start||clock>=end)return{mode:'OUTSIDE_WINDOW',intervalMinutes:null,window:null,windows};
  return activeWindow?{mode:'PEAK',intervalMinutes:peak,window:activeWindow,windows}:{mode:'NORMAL',intervalMinutes:normal,window:null,windows};
}

module.exports={DEFAULT_WINDOWS,parseClock,parseWindows,observerPolicy};
