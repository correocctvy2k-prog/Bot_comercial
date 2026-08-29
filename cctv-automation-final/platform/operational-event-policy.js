'use strict';

const DERIVED_OPENING_TYPES = new Set(['TRIPWIRE', 'CABLE_TRAMPA']);

function isOperationalOpeningSignal(event) {
  if (event?.eventType === 'OPENING') return true;
  return DERIVED_OPENING_TYPES.has(event?.eventType) && event?.phase !== 'FIN';
}

function asOperationalOpeningEvidence(event) {
  if (!isOperationalOpeningSignal(event)) return event;
  return {
    ...event,
    evidenceType: 'OPENING',
    operationalInterpretation: 'FIRST_OPENING',
    operationalSourceType: event.eventType,
  };
}

module.exports = { isOperationalOpeningSignal, asOperationalOpeningEvidence };
