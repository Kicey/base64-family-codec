import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  LANGUAGE_KEY, resolveLanguage, loadLanguagePreference, saveLanguagePreference,
  translate, translateError, translateVariant, formatCount,
} from '../src/i18n/index.js';
import { messages } from '../src/i18n/messages.js';
import { decodeBytes } from '../src/codec/base64.js';
import { bytesToText, hexToBytes } from '../src/codec/bytes.js';
import { getVariant, variants } from '../src/codec/variants.js';

test('Automatic detection respects browser preference order and regional Chinese/English tags', () => {
  for (const tag of ['zh', 'zh-CN', 'zh-Hans', 'zh-Hant-TW', 'zh-HK', 'ZH-sg']) {
    assert.equal(resolveLanguage('auto', [tag, 'en']), 'zh-CN');
  }
  assert.equal(resolveLanguage('auto', ['en-GB', 'zh-CN']), 'en');
  assert.equal(resolveLanguage('auto', ['de-DE', 'zh-CN', 'en']), 'zh-CN');
  assert.equal(resolveLanguage('auto', ['fr', 'en-US', 'zh']), 'en');
  assert.equal(resolveLanguage('auto', ['ja-JP']), 'en');
  assert.equal(resolveLanguage('auto', []), 'en');
  assert.equal(resolveLanguage('auto', [null, 'zh']), 'zh-CN');
  assert.equal(resolveLanguage('auto', ['zho', 'english']), 'en');
});

test('A manual preference wins over browser detection, including on reload', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const getStorage = () => storage;
  assert.equal(loadLanguagePreference(getStorage), 'auto');
  saveLanguagePreference('en', getStorage);
  assert.equal(values.get(LANGUAGE_KEY), 'en');
  assert.equal(resolveLanguage(loadLanguagePreference(getStorage), ['zh-CN']), 'en');
  saveLanguagePreference('zh-CN', getStorage);
  assert.equal(resolveLanguage(loadLanguagePreference(getStorage), ['en-US']), 'zh-CN');
  saveLanguagePreference('auto', getStorage);
  assert.equal(values.has(LANGUAGE_KEY), false);
  assert.equal(resolveLanguage(loadLanguagePreference(getStorage), ['zh-CN']), 'zh-CN');
  values.set(LANGUAGE_KEY, 'invalid');
  assert.equal(loadLanguagePreference(getStorage), 'auto');
  assert.equal(resolveLanguage('invalid', ['zh-CN']), 'zh-CN');
});

test('Blocked storage does not prevent automatic detection or in-page switching', () => {
  const denied = () => { throw new Error('Storage blocked'); };
  const failingStorage = () => ({ getItem: denied, setItem: denied, removeItem: denied });
  for (const getStorage of [denied, failingStorage, () => undefined]) {
    assert.equal(loadLanguagePreference(getStorage), 'auto');
    assert.doesNotThrow(() => saveLanguagePreference('zh-CN', getStorage));
    assert.doesNotThrow(() => saveLanguagePreference('auto', getStorage));
  }
  assert.equal(resolveLanguage('zh-CN', ['en']), 'zh-CN');
});

test('Both dictionaries cover the UI, dynamic messages, and parameter names', async () => {
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const [key, english] of Object.entries(messages.en)) {
    assert.ok(messages['zh-CN'][key], `Missing Chinese translation: ${key}`);
    assert.deepEqual(placeholders(messages['zh-CN'][key]), placeholders(english), key);
  }
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const [, key] of html.matchAll(/data-i18n(?:-aria-label)?="([^"]+)"/g)) {
    for (const language of ['en', 'zh-CN']) assert.ok(messages[language][key], `${language}: ${key}`);
  }
  for (const variant of variants) {
    for (const field of ['subtitle', 'description', 'decodeNote']) {
      assert.match(translateVariant('zh-CN', variant, field), /[\u4e00-\u9fff]/);
      assert.equal(translateVariant('en', variant, field), variant[field]);
    }
  }
});

test('Counts use the selected language and English singular/plural forms', () => {
  assert.equal(formatCount('en', 1, 'byte'), '1 byte');
  assert.equal(formatCount('en', 0, 'byte'), '0 bytes');
  assert.equal(formatCount('en', 1200, 'character'), '1,200 characters');
  assert.equal(formatCount('zh-CN', 1, 'byte'), '1 字节');
  assert.equal(formatCount('zh-CN', 1200, 'character'), '1,200 字符');
});

test('Codec errors translate by stable codes while retaining original English messages', () => {
  const cases = [
    [() => decodeBytes('Z?==', getVariant('base64')), 'invalidCharacter', /第 2 个字符 "\?"/],
    [() => decodeBytes('Zg', getVariant('base64')), 'missingPadding', /==/],
    [() => decodeBytes('Zh==', getVariant('base64')), 'nonCanonical', /未使用的位/],
    [() => decodeBytes('Zg===', getVariant('base64')), 'invalidPadding', /填充格式/],
    [() => decodeBytes('A', getVariant('base64')), 'invalidLength', /长度无效/],
    [() => hexToBytes('xx'), 'invalidHex', /十六进制/],
    [() => hexToBytes('f'), 'incompleteHex', /补全/],
    [() => bytesToText(new Uint8Array([255])), 'invalidUtf8', /UTF-8/],
    [() => decodeBytes('-----BEGIN A-----\nZg==\n-----END B-----', getVariant('pem')), 'pemMismatch', /必须一致/],
  ];
  for (const [run, code, chinese] of cases) {
    assert.throws(run, (error) => {
      assert.equal(error.code, code);
      assert.equal(translateError('en', error), error.message);
      assert.match(translateError('zh-CN', error), chinese);
      return true;
    });
  }
  assert.equal(translateError('zh-CN', new Error('Custom error')), 'Custom error');
});

test('New variants retain their metadata and interpolation treats data as literal text', () => {
  assert.equal(translateVariant('zh-CN', { id: 'custom', description: 'New format' }, 'description'), 'New format');
  assert.equal(translate('unknown', 'encode'), 'Encode');
  assert.equal(translate('zh-CN', 'error.invalidCharacter', { character: '$&', position: 1, variant: 'Base64' }), 'Base64 输入的第 1 个字符 $& 无效。');
});
