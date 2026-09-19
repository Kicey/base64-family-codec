import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeBytes, decodeBytes, defineVariant } from '../src/codec/base64.js';
import { variants, getVariant, STANDARD_ALPHABET } from '../src/codec/variants.js';
import { textToBytes, bytesToText, hexToBytes, bytesToHex } from '../src/codec/bytes.js';

const standard = getVariant('base64');
const url = getVariant('base64url');
const mime = getVariant('mime');
const pem = getVariant('pem');
const vectors = [['', ''], ['f', 'Zg=='], ['fo', 'Zm8='], ['foo', 'Zm9v'], ['foob', 'Zm9vYg=='], ['fooba', 'Zm9vYmE='], ['foobar', 'Zm9vYmFy']];

for (const variant of variants) {
  test(`${variant.name}: RFC 4648 vectors`, () => {
    for (const [text, expected] of vectors) {
      const encoded = variant.paddingDefault ? expected : expected.replace(/=+$/, '');
      assert.equal(encodeBytes(textToBytes(text), variant), encoded);
      assert.equal(bytesToText(decodeBytes(encoded, variant)), text);
    }
  });
  test(`${variant.name}: all octets and line/chunk boundaries agree with Node`, () => {
    for (const length of [0, 1, 2, 3, 47, 48, 49, 56, 57, 58, 255, 256, 257, 6143, 6144, 6145, 65537]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 73 + 19) % 256);
      const encoded = encodeBytes(bytes, variant);
      const expected = Buffer.from(bytes).toString(variant.id === 'base64url' ? 'base64url' : 'base64');
      assert.equal(encoded.replace(/[\r\n]/g, ''), expected);
      assert.deepEqual(decodeBytes(encoded, variant), bytes);
      if (variant.lineLength && encoded) {
        const lines = encoded.split(variant.lineEnding);
        assert.ok(lines.every((line) => line.length <= variant.lineLength));
        assert.ok(lines.slice(0, -1).every((line) => line.length === variant.lineLength));
      }
    }
  });
  test(`${variant.name}: rejects malformed padding and truncated groups`, () => {
    for (const input of ['A', 'AAAAA', '=', '====', 'Z=g=', 'Zg=', 'Zg===', 'Zm9v=', 'Zm9v====', 'Zg==AA', '=Zg=']) {
      assert.throws(() => decodeBytes(input, variant), /length|padding/i, input);
    }
  });
}

test('Unicode, embedded NUL, newlines, and a leading BOM survive round trips', () => {
  for (const text of ['你好 👋 café', '\u0000a\u0000', 'first\r\nsecond\nthird\r', '\ufeffBOM']) {
    for (const variant of variants) assert.equal(bytesToText(decodeBytes(encodeBytes(textToBytes(text), variant), variant)), text);
  }
});

test('URL alphabet and optional padding are explicit', () => {
  const bytes = new Uint8Array([251, 255]);
  assert.equal(encodeBytes(bytes, standard), '+/8=');
  assert.equal(encodeBytes(bytes, url), '-_8');
  assert.equal(encodeBytes(bytes, url, { padding: true }), '-_8=');
  assert.deepEqual(decodeBytes('-_8=', url), bytes);
  assert.throws(() => decodeBytes('+/8=', url), /Invalid character/);
  assert.throws(() => decodeBytes('-_8=', standard), /Invalid character/);
  assert.throws(() => encodeBytes(bytes, standard, { padding: false }), /requires padding/);
});

test('Strict variants reject whitespace, missing padding, and non-canonical unused bits', () => {
  for (const variant of [standard, url]) {
    for (const text of [' Zg==', 'Zg==\n', 'Z\tg==', 'Zg==\u00a0', 'Zg==!', 'Zg==你']) {
      assert.throws(() => decodeBytes(text, variant), /Invalid character/);
    }
    for (const text of ['Zh==', 'Zm9=']) assert.throws(() => decodeBytes(text, variant), /Non-canonical/);
  }
  for (const text of ['Zh', 'Zm9']) assert.throws(() => decodeBytes(text, url), /Non-canonical/);
  for (const variant of [standard, mime, pem]) assert.throws(() => decodeBytes('Zg', variant), /Missing padding/);
});

test('MIME uses CRLF and ignores non-alphabet noise on decode', () => {
  assert.equal(encodeBytes(new Uint8Array(58), mime), 'A'.repeat(76) + '\r\nAA==');
  assert.equal(bytesToText(decodeBytes('Z!\tm\r\n9$v你', mime)), 'foo');
  assert.equal(bytesToText(decodeBytes('Zh==', mime)), 'f');
  assert.equal(bytesToText(decodeBytes(encodeBytes(textToBytes('a\nb'), mime), mime)), 'a\nb');
});

test('PEM wraps at 64 and supports optional matching envelopes', () => {
  assert.equal(encodeBytes(new Uint8Array(49), pem), 'A'.repeat(64) + '\nAA==');
  const block = '-----BEGIN PUBLIC KEY-----\nZm9v\n-----END PUBLIC KEY-----\n';
  assert.equal(encodeBytes(textToBytes('foo'), pem, { armor: true, label: 'PUBLIC KEY' }), block);
  for (const eol of ['\n', '\r\n', '\r']) {
    assert.equal(bytesToText(decodeBytes(block.replaceAll('\n', eol), pem)), 'foo');
  }
  assert.equal(bytesToText(decodeBytes(' \tZ m\n9\rv\v\f', pem)), 'foo');
  assert.equal(bytesToText(decodeBytes('-----BEGIN DATA-----\nZg=\n=\n-----END DATA-----', pem)), 'f');
  assert.equal(decodeBytes(encodeBytes(new Uint8Array(), pem, { armor: true }), pem).length, 0);
  assert.throws(() => decodeBytes(block.replace('END PUBLIC KEY', 'END PRIVATE KEY'), pem), /must match/);
  assert.throws(() => decodeBytes(block + block, pem), /one PEM block/);
  assert.throws(() => decodeBytes(block.replace('-----END PUBLIC KEY-----', ''), pem), /boundaries/);
  assert.throws(() => decodeBytes('-----BEGIN DATA-----\nProc-Type: 4,ENCRYPTED\nZm9v\n-----END DATA-----', pem), /Legacy PEM/);
  assert.throws(() => decodeBytes('Z!m9v', pem), /Invalid character/);
});

test('PEM labels cannot inject new lines or boundaries', () => {
  for (const label of ['', ' KEY', 'KEY ', 'A  B', 'A--B', '-KEY', 'KEY-', 'KEY\n-----END KEY-----', '你好']) {
    assert.throws(() => encodeBytes(textToBytes('foo'), pem, { armor: true, label }), /PEM label/);
  }
});

test('Binary output is lossless and invalid UTF-8 is explicit', () => {
  const bytes = hexToBytes('00 7F\n80 ff');
  assert.equal(bytesToHex(bytes), '00 7f 80 ff');
  assert.throws(() => bytesToText(bytes), /not valid UTF-8/);
  for (const input of ['f', '0x00', 'gg', '-1', '00:ff']) assert.throws(() => hexToBytes(input), /Hex input/);
  for (const bytes of [[0xc0, 0x80], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xe2, 0x82]]) {
    assert.throws(() => bytesToText(new Uint8Array(bytes)), /not valid UTF-8/);
  }
});

test('New alphabets and container hooks work without codec changes', () => {
  const custom = defineVariant({
    id: 'reversed', name: 'Reversed', alphabet: [...STANDARD_ALPHABET].reverse().join(''),
    lineLength: 8, ignore: 'whitespace',
    wrap: (value) => `<${value}>`, unwrap: (value) => value.slice(1, -1),
  });
  const bytes = Uint8Array.from({ length: 100 }, (_, i) => i);
  const encoded = encodeBytes(bytes, custom);
  assert.ok(encoded.startsWith('<//79/Pv6\n'));
  assert.deepEqual(decodeBytes(encoded, custom), bytes);
  assert.ok(Object.isFrozen(custom));
  assert.throws(() => defineVariant({ id: 'bad', name: 'Bad', alphabet: 'A'.repeat(64) }), /alphabet/);
  assert.throws(() => defineVariant({ ...standard, lineLength: 5 }), /Line length/);
  assert.throws(() => getVariant('missing'), /Unknown/);
});

test('Codec validates input types', () => {
  assert.throws(() => encodeBytes('foo', standard), /Uint8Array/);
  assert.throws(() => decodeBytes(new Uint8Array(), standard), /string/);
});
