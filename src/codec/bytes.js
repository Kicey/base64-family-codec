export function textToBytes(text) {
  return new TextEncoder().encode(text);
}

export function bytesToText(bytes) {
  try {
    // Retain a leading BOM as data so decode → encode preserves every byte.
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error('The decoded bytes are not valid UTF-8. Select Hex bytes to inspect binary data.');
  }
}

export function hexToBytes(hex) {
  if (/[^\da-f\t\n\v\f\r ]/i.test(hex)) throw new Error('Hex input accepts only 0–9, A–F, and whitespace.');
  const clean = hex.replace(/[\t\n\v\f\r ]/g, '');
  if (clean.length % 2) throw new Error('Hex input needs two digits per byte. Complete the final pair.');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
}
