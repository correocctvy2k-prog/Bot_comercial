'use strict';

function localDate(value=new Date()){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
}

function buildOperationalClosure(db,date=localDate()){
  const events=db.prepare(`SELECT COUNT(*) total,SUM(location_id IS NOT NULL) linked,SUM(event_type='OPENING') openings,SUM(event_type='CLOSING') closings,SUM(event_type IN ('ALARM','ALARMA_LOCAL','LOCAL_ALARM','CABLE_TRAP','TRIPWIRE')) alarms,SUM(severity='REVIEW') review FROM cctv_events WHERE date(COALESCE(occurred_at,received_at),'-5 hours')=? AND event_type<>'DISCARDED'`).get(date);
  const openingPoints=db.prepare(`SELECT COUNT(DISTINCT location_id) n FROM cctv_events WHERE date(COALESCE(occurred_at,received_at),'-5 hours')=? AND event_type='OPENING' AND location_id IS NOT NULL`).get(date).n;
  const closingPoints=db.prepare(`SELECT COUNT(DISTINCT location_id) n FROM cctv_events WHERE date(COALESCE(occurred_at,received_at),'-5 hours')=? AND event_type='CLOSING' AND location_id IS NOT NULL`).get(date).n;
  const siisRun=db.prepare(`SELECT id,completed_at,received_count,valid_count,invalid_count FROM siis_sync_runs WHERE status='SUCCESS' AND date(completed_at,'-5 hours')=? ORDER BY id DESC LIMIT 1`).get(date)||null;
  const siis=siisRun?db.prepare(`SELECT SUM(online=1) online,SUM(online=0) offline,SUM(online IS NULL) unknown FROM stg_siis_locations WHERE sync_run_id=?`).get(siisRun.id):{online:0,offline:0,unknown:0};
  const maintenance=db.prepare(`SELECT COUNT(*) total,SUM(status='COMPLETED') completed,SUM(status<>'COMPLETED') pending,SUM(location_id IS NULL) unlinked FROM maintenance_work_items WHERE source_system='TRELLO' AND active=1`).get();
  const support=db.prepare(`SELECT COUNT(*) total,SUM(status='COMPLETED') completed,SUM(status='PENDING') pending,SUM(location_id IS NULL) unlinked FROM support_cards WHERE source_system='TRELLO_SUPPORT' AND active=1`).get();
  const visitors=db.prepare(`SELECT COUNT(*) visits,COUNT(DISTINCT visitor_key) uniqueVisitors,SUM(exit_at IS NULL AND lower(visit_status) LIKE '%entrada%') openVisits FROM visitor_visits WHERE report_date=?`).get(date);
  const summary={events:{total:Number(events.total||0),linked:Number(events.linked||0),identityPercent:Number(events.total)?Math.round(Number(events.linked||0)/Number(events.total)*100):100,openingEvents:Number(events.openings||0),closingEvents:Number(events.closings||0),openingPoints:Number(openingPoints||0),closingPoints:Number(closingPoints||0),alarms:Number(events.alarms||0),review:Number(events.review||0)},siis:{online:Number(siis.online||0),offline:Number(siis.offline||0),unknown:Number(siis.unknown||0)},maintenance:{total:Number(maintenance.total||0),completed:Number(maintenance.completed||0),pending:Number(maintenance.pending||0),unlinked:Number(maintenance.unlinked||0)},support:{total:Number(support.total||0),completed:Number(support.completed||0),pending:Number(support.pending||0),unlinked:Number(support.unlinked||0)},visitors:{visits:Number(visitors.visits||0),uniqueVisitors:Number(visitors.uniqueVisitors||0),openVisits:Number(visitors.openVisits||0)}};
  const cutoffs={eventsAt:db.prepare(`SELECT MAX(received_at) value FROM cctv_events WHERE date(COALESCE(occurred_at,received_at),'-5 hours')=?`).get(date).value||null,siisAt:siisRun?.completed_at||null,maintenanceAt:db.prepare("SELECT MAX(completed_at) value FROM maintenance_source_runs WHERE source_system='TRELLO' AND status='SUCCESS'").get().value||null,supportAt:db.prepare("SELECT MAX(completed_at) value FROM support_source_runs WHERE source_system='TRELLO_SUPPORT' AND status='SUCCESS'").get().value||null};
  const status=summary.events.review||summary.maintenance.unlinked||summary.support.unlinked||summary.visitors.openVisits?'ATTENTION':'CLOSED';
  return{date,timeZone:'America/Bogota',status,generatedAt:new Date().toISOString(),summary,cutoffs};
}

module.exports={localDate,buildOperationalClosure};
