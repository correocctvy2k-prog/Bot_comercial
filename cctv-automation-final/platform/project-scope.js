'use strict';

const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
function isInstallableTransfer(value=''){
  const text=normalize(value);
  return !!text&&!/^(NVR QUEDA|SOLO SE CAMBIA|SE DESMONTA)/.test(text)&&!text.includes('TECNOLOGIA OBSOLETA');
}
function scopeAudit(rows,declaredScope=80){
  const financed=rows.filter(row=>row.investment!=null),sportbook=financed.filter(row=>row.project_stream==='HIGH_VALUE_AI_SPORTBOOK'),singleCamera=financed.filter(row=>row.project_stream==='HIGH_VALUE_AI'),reuseDestinations=sportbook.filter(row=>isInstallableTransfer(row.transferScope));
  const enumerated=financed.length+reuseDestinations.length;
  return{financedTargets:financed.length,modernizationTargets:sportbook.length,singleCameraTargets:singleCamera.length,reuseDestinations:reuseDestinations.length,enumeratedInterventions:enumerated,declaredScope,scopeVariance:enumerated-declaredScope,reuseRows:reuseDestinations};
}
module.exports={normalize,isInstallableTransfer,scopeAudit};
