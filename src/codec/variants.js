import { defineVariant } from './base64.js';
import { unwrapPem, wrapPem } from './pem.js';

export const STANDARD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export const URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// Register another profile here; the interface builds its selector from this list.
export const variants = Object.freeze([
  defineVariant({
    id: 'base64', name: 'Base64', subtitle: 'The standard', alphabet: STANDARD_ALPHABET,
    description: 'The standard alphabet, with required padding and no line wrapping.',
    decodeNote: 'Strict decoding: whitespace, invalid padding, and nonzero unused bits are rejected.',
    reference: 'RFC 4648 §4', referenceUrl: 'https://www.rfc-editor.org/rfc/rfc4648.html#section-4',
  }),
  defineVariant({
    id: 'base64url', name: 'Base64URL', subtitle: 'URLs & filenames', alphabet: URL_ALPHABET,
    padding: 'optional', paddingDefault: false,
    description: 'A URL-safe alphabet using - and _. Padding is omitted by default; enable it when your protocol requires it.',
    decodeNote: 'Accepts padded or unpadded input. Whitespace, +, /, and nonzero unused bits are rejected.',
    reference: 'RFC 4648 §5', referenceUrl: 'https://www.rfc-editor.org/rfc/rfc4648.html#section-5',
  }),
  defineVariant({
    id: 'mime', name: 'MIME Base64', subtitle: 'Email & transport', alphabet: STANDARD_ALPHABET,
    lineLength: 76, lineEnding: '\r\n', ignore: 'non-alphabet', canonical: false,
    description: 'The standard alphabet, padded and wrapped at 76 characters with CRLF line endings.',
    decodeNote: 'Decoding ignores non-alphabet characters as MIME specifies. Input bytes are preserved; text line endings are not normalized.',
    reference: 'RFC 2045 §6.8', referenceUrl: 'https://www.rfc-editor.org/rfc/rfc2045.html#section-6.8',
  }),
  defineVariant({
    id: 'pem', name: 'PEM Base64', subtitle: 'Keys & certificates', alphabet: STANDARD_ALPHABET,
    lineLength: 64, ignore: 'whitespace', canonical: false, unwrap: unwrapPem, wrap: wrapPem, container: 'pem',
    description: 'The standard alphabet, padded and wrapped at 64 characters. Optionally add a labeled PEM envelope.',
    decodeNote: 'Accepts whitespace in a raw payload or one matching PEM block. Decodes bytes without interpreting keys or certificates.',
    reference: 'RFC 7468', referenceUrl: 'https://www.rfc-editor.org/rfc/rfc7468.html',
  }),
]);

export function getVariant(id) {
  const variant = variants.find((entry) => entry.id === id);
  if (!variant) throw new Error(`Unknown Base64 variant: ${id}`);
  return variant;
}
