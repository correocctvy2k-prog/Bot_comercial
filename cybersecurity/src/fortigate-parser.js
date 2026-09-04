const COMMAND_LINE = /^.*?\s\$\s+(.+?)\s*$/;
const MAC_HEADER = /^\s{2}([0-9a-f]{2}(?::[0-9a-f]{2}){5})\s+/i;

function splitCommandSections(text) {
  const sections = new Map();
  let current = null;

  for (const line of String(text).replaceAll('\r\n', '\n').split('\n')) {
    const command = line.match(COMMAND_LINE);
    if (command) {
      current = command[1];
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (current) sections.get(current).push(line);
  }

  return sections;
}

function parseConnectedRoutes(lines = []) {
  const routes = [];
  for (const line of lines) {
    const match = line.match(/^C\s+(\S+)\s+is directly connected,\s+(.+?)\s*$/);
    if (!match) continue;
    routes.push({
      cidr: match[1],
      interfaceName: match[2].trim(),
      routeType: 'CONNECTED',
    });
  }
  return routes;
}

function parseFortiGateSystemTime(lines = []) {
  const months = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  for (const line of lines) {
    const match = line.match(/^System time:\s+\w{3}\s+(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})\s*$/);
    if (!match || months[match[1]] === undefined) continue;
    const [, month, day, hour, minute, second, year] = match;
    // FortiGate capture is in America/Bogota (UTC-05:00), without DST.
    return new Date(Date.UTC(
      Number(year), months[month], Number(day), Number(hour) + 5,
      Number(minute), Number(second),
    )).toISOString();
  }
  return null;
}

function normalizeMac(value) {
  return String(value).trim().toLowerCase().replaceAll('-', ':');
}

function isLocallyAdministeredMac(value) {
  const firstOctet = Number.parseInt(normalizeMac(value).slice(0, 2), 16);
  return Number.isFinite(firstOctet) && (firstOctet & 2) === 2;
}

function parseQuotedAttribute(line, name) {
  const pattern = new RegExp(`^\\s{4}${name}\\s+'([^']*)'\\s+src\\s+(\\S+)(?:\\s+id\\s+(\\d+)\\s+weight\\s+(\\d+))?`, 'i');
  const match = line.match(pattern);
  if (!match) return null;
  return {
    value: match[1].trim(),
    source: match[2],
    sourceId: match[3] ? Number(match[3]) : null,
    weight: match[4] ? Number(match[4]) : null,
  };
}

function pushAttribute(device, name, attribute) {
  if (!attribute) return;
  if (!device.attributes[name]) device.attributes[name] = [];
  device.attributes[name].push(attribute);
}

function parseDeviceList(lines = []) {
  const devices = [];
  let current = null;

  for (const line of lines) {
    const header = line.match(MAC_HEADER);
    if (header) {
      const mac = normalizeMac(header[1]);
      current = {
        mac,
        isLocallyAdministered: isLocallyAdministeredMac(mac),
        createdSeconds: null,
        seenSeconds: null,
        interfaceName: null,
        ipObservations: [],
        attributes: {},
        qualityFlags: [],
      };
      if (current.isLocallyAdministered) current.qualityFlags.push('LOCALLY_ADMINISTERED_MAC');
      devices.push(current);
      continue;
    }
    if (!current) continue;

    const timing = line.match(/^\s{4}created\s+(\d+)s\b.*?\sseen\s+(\d+)s\s+(.+?)\s+gen\s+\d+\s*$/);
    if (timing) {
      current.createdSeconds = Number(timing[1]);
      current.seenSeconds = Number(timing[2]);
      current.interfaceName = timing[3].trim();
      continue;
    }

    const ip = line.match(/^\s{4}ip\s+(\S+)\s+src\s+(\S+)\s*$/i);
    if (ip) {
      current.ipObservations.push({ value: ip[1], source: ip[2] });
      continue;
    }

    for (const [key, label] of [
      ['manufacturer', 'hardware vendor'],
      ['deviceType', 'type'],
      ['family', 'family'],
      ['osFamily', 'os'],
      ['hardwareVersion', 'hardware version'],
      ['softwareVersion', 'software version'],
      ['hostname', 'host'],
    ]) {
      pushAttribute(current, key, parseQuotedAttribute(line, label));
    }

    if (parseQuotedAttribute(line, 'user')) {
      current.qualityFlags.push('USER_ATTRIBUTE_REDACTED');
      current.hasUserObservation = true;
    }
  }

  return devices;
}

function selectBestAttribute(device, name) {
  const values = device.attributes[name] || [];
  if (values.length === 0) return null;
  return [...values].sort((left, right) => (right.weight || 0) - (left.weight || 0))[0];
}

function summarizeFortiGateInventory(text) {
  const sections = splitCommandSections(text);
  const connectedRoutes = parseConnectedRoutes(sections.get('get router info routing-table all'));
  const devices = parseDeviceList(sections.get('diagnose user device list'));

  return {
    capturedAt: parseFortiGateSystemTime(sections.get('get system status')),
    commandsFound: [...sections.keys()],
    connectedRoutes,
    devices,
    counts: {
      commands: sections.size,
      connectedRoutes: connectedRoutes.length,
      devices: devices.length,
      devicesWithIp: devices.filter((device) => device.ipObservations.length > 0).length,
      devicesWithHostname: devices.filter((device) => selectBestAttribute(device, 'hostname')).length,
      locallyAdministeredMacs: devices.filter((device) => device.isLocallyAdministered).length,
      userAttributesRedacted: devices.filter((device) => device.hasUserObservation).length,
    },
  };
}

module.exports = {
  isLocallyAdministeredMac,
  normalizeMac,
  parseConnectedRoutes,
  parseFortiGateSystemTime,
  parseDeviceList,
  selectBestAttribute,
  splitCommandSections,
  summarizeFortiGateInventory,
};
