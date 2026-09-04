function ipv4ToNumber(value) {
  const parts = String(value || '').trim().split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts.reduce((result, part) => ((result << 8) | part) >>> 0, 0);
}

function numberToIpv4(value) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
}

function networkFacts(address, prefixLength, gateway = null) {
  const ip = ipv4ToNumber(address); const prefix = Number(prefixLength);
  if (ip === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new Error('INVALID_NETWORK_CIDR');
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (ip & mask) >>> 0; const size = 2 ** (32 - prefix); const broadcast = (network + size - 1) >>> 0;
  const usableHosts = prefix === 32 ? 1 : prefix === 31 ? 2 : Math.max(0, size - 2);
  if (gateway) {
    const gatewayNumber = ipv4ToNumber(gateway);
    const lower = prefix <= 30 ? network + 1 : network;
    const upper = prefix <= 30 ? broadcast - 1 : broadcast;
    if (gatewayNumber === null || gatewayNumber < lower || gatewayNumber > upper) throw new Error('INVALID_GATEWAY');
  }
  return { networkAddress: numberToIpv4(network), prefixLength: prefix, netmask: numberToIpv4(mask), broadcast: numberToIpv4(broadcast), totalAddresses: size, usableHosts };
}

module.exports = { ipv4ToNumber, networkFacts, numberToIpv4 };
