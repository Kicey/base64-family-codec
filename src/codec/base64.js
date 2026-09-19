import { CodecError } from './errors.js';

/**
 * A variant describes representation and validation, never byte conversion.
 * Hooks handle containers such as PEM independently of the Base64 algorithm.
 *
 * @typedef {Object} Variant
 * @property {string} id
 * @property {string} name
 * @property {string} alphabet Exactly 64 distinct printable ASCII characters, excluding '='.
 * @property {'required'|'optional'} padding
 * @property {boolean} paddingDefault
 * @property {number} lineLength Zero disables wrapping; otherwise a multiple of four.
 * @property {'\n'|'\r\n'} lineEnding
 * @property {'none'|'whitespace'|'non-alphabet'} ignore
 * @property {boolean} canonical Reject nonzero unused bits on decode.
 * @property {(text: string) => string} [unwrap]
 * @property {(text: string, options: Object) => string} [wrap]
 */

/** Validate and freeze a profile. @param {Partial<Variant> & {id: string, name: string, alphabet: string} & Object} definition */
export function defineVariant(definition) {
  const variant = {
    padding: 'required', paddingDefault: true, lineLength: 0,
    lineEnding: '\n', ignore: 'none', canonical: true, ...definition,
  };
  const { alphabet } = variant;
  if (typeof variant.id !== 'string' || !variant.id || typeof variant.name !== 'string' || !variant.name) {
    throw new TypeError('A variant needs an id and a name.');
  }
  if (typeof alphabet !== 'string' || alphabet.length !== 64 ||
      new Set(alphabet).size !== 64 || /[^\x21-\x7e]|=/.test(alphabet)) {
    throw new TypeError('An alphabet must contain 64 unique printable ASCII characters, excluding "=".');
  }
  if (!['required', 'optional'].includes(variant.padding) ||
      typeof variant.paddingDefault !== 'boolean' ||
      (variant.padding === 'required' && !variant.paddingDefault)) {
    throw new TypeError('Invalid padding policy.');
  }
  if (!Number.isSafeInteger(variant.lineLength) || variant.lineLength < 0 || variant.lineLength % 4 !== 0) {
    throw new TypeError('Line length must be zero or a positive multiple of four.');
  }
  if (!['\n', '\r\n'].includes(variant.lineEnding) ||
      !['none', 'whitespace', 'non-alphabet'].includes(variant.ignore) ||
      typeof variant.canonical !== 'boolean') {
    throw new TypeError('Invalid line ending or decoding policy.');
  }
  for (const hook of ['wrap', 'unwrap']) {
    if (variant[hook] !== undefined && typeof variant[hook] !== 'function') {
      throw new TypeError(`${hook} must be a function.`);
    }
  }
  return Object.freeze(variant);
}

/**
 * @param {Uint8Array} bytes
 * @param {Variant} variant
 * @param {{padding?: boolean, armor?: boolean, label?: string}} [options]
 * @returns {string}
 */
export function encodeBytes(bytes, variant, options = {}) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Input must be a Uint8Array.');
  const padding = options.padding ?? variant.paddingDefault;
  if (typeof padding !== 'boolean' || (!padding && variant.padding === 'required')) {
    throw new TypeError(`${variant.name} requires padding.`);
  }
  const alphabet = variant.alphabet;
  // Bounded chunks avoid argument limits and one array entry per output symbol.
  const chunks = [];
  let chunk = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const remaining = bytes.length - i;
    const bits = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    chunk += alphabet[(bits >>> 18) & 63] + alphabet[(bits >>> 12) & 63];
    chunk += remaining > 1 ? alphabet[(bits >>> 6) & 63] : padding ? '=' : '';
    chunk += remaining > 2 ? alphabet[bits & 63] : padding ? '=' : '';
    if (chunk.length >= 8192) { chunks.push(chunk); chunk = ''; }
  }
  chunks.push(chunk);
  let encoded = chunks.join('');
  if (variant.lineLength) {
    const lines = [];
    for (let i = 0; i < encoded.length; i += variant.lineLength) {
      lines.push(encoded.slice(i, i + variant.lineLength));
    }
    encoded = lines.join(variant.lineEnding);
  }
  return variant.wrap ? variant.wrap(encoded, options) : encoded;
}

/** Decode to bytes without assuming any text encoding. @param {string} input @param {Variant} variant */
export function decodeBytes(input, variant) {
  if (typeof input !== 'string') throw new TypeError('Encoded input must be a string.');
  const source = variant.unwrap ? variant.unwrap(input) : input;
  const lookup = new Int16Array(128).fill(-1);
  for (let i = 0; i < 64; i++) lookup[variant.alphabet.charCodeAt(i)] = i;
  let clean = '';
  for (let i = 0; i < source.length; i++) {
    const character = source[i];
    const code = source.charCodeAt(i);
    if (character === '=' || (code < 128 && lookup[code] >= 0)) {
      clean += character;
    } else if (variant.ignore === 'non-alphabet' ||
               (variant.ignore === 'whitespace' && /[\t\n\v\f\r ]/.test(character))) {
      continue;
    } else {
      throw new CodecError('invalidCharacter', `Invalid character ${JSON.stringify(character)} at position ${i + 1} for ${variant.name}.`,
        { character: JSON.stringify(character), position: i + 1, variant: variant.name });
    }
  }

  const firstPad = clean.indexOf('=');
  const dataLength = firstPad < 0 ? clean.length : firstPad;
  const padCount = clean.length - dataLength;
  const remainder = dataLength % 4;
  if (padCount && (padCount > 2 || !/^=+$/.test(clean.slice(dataLength)) ||
      clean.length % 4 !== 0 || (padCount === 2 ? remainder !== 2 : remainder !== 3))) {
    throw new CodecError('invalidPadding', 'Invalid padding. Use one or two "=" characters only at the end of a complete four-character group.');
  }
  if (remainder === 1) throw new CodecError('invalidLength', 'Invalid Base64 length. A final group cannot contain only one character.');
  if (!padCount && remainder && variant.padding === 'required') {
    throw new CodecError('missingPadding', `Missing padding. ${variant.name} requires ${'='.repeat(4 - remainder)} at the end.`,
      { variant: variant.name, padding: '='.repeat(4 - remainder) });
  }
  if (variant.canonical && remainder) {
    const lastValue = lookup[clean.charCodeAt(dataLength - 1)];
    if (lastValue & (remainder === 2 ? 15 : 3)) {
      throw new CodecError('nonCanonical', 'Non-canonical Base64: unused bits in the final character must be zero.');
    }
  }

  const bytes = new Uint8Array(Math.floor(dataLength * 6 / 8));
  let bits = 0;
  let bitCount = 0;
  let outputIndex = 0;
  for (let i = 0; i < dataLength; i++) {
    bits = (bits << 6) | lookup[clean.charCodeAt(i)];
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes[outputIndex++] = (bits >>> bitCount) & 255;
    }
    bits &= (1 << bitCount) - 1;
  }
  return bytes;
}
