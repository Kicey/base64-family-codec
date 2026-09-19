// RFC 7468 label grammar: printable ASCII, with single spaces/hyphens as separators.
const LABEL = /^[\x21-\x2c\x2e-\x7e](?:[ -]?[\x21-\x2c\x2e-\x7e])*$/;

export function validatePemLabel(label) {
  if (typeof label !== 'string' || !LABEL.test(label)) {
    throw new Error('Use a nonempty PEM label with printable ASCII characters and single spaces or hyphens.');
  }
  return label;
}

export function wrapPem(body, { armor = false, label = 'DATA' } = {}) {
  if (!armor) return body;
  validatePemLabel(label);
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
}

/** Accept a raw payload or exactly one block. Never silently concatenate keys/certificates. */
export function unwrapPem(input) {
  if (!input.includes('-----')) return input;
  const lines = input.trim().split(/\r\n|\r|\n/);
  const begin = /^-----BEGIN (.*?)-----[\t ]*$/.exec(lines[0]);
  const end = /^-----END (.*?)-----[\t ]*$/.exec(lines.at(-1));
  if (!begin || !end || lines.length < 3) {
    throw new Error('Invalid PEM boundaries. Paste one complete BEGIN/END block or only its Base64 payload.');
  }
  validatePemLabel(begin[1]);
  if (begin[1] !== end[1]) throw new Error('PEM BEGIN and END labels must match.');
  const body = lines.slice(1, -1).join('\n');
  if (body.includes('-----')) throw new Error('Decode one PEM block at a time.');
  if (/^[^\r\n]*:/m.test(body)) throw new Error('Legacy PEM headers are not supported. Paste only the Base64 payload.');
  return body;
}
