import { encodeBytes, decodeBytes } from './codec/base64.js';
import { variants, getVariant } from './codec/variants.js';
import { textToBytes, bytesToText, hexToBytes, bytesToHex } from './codec/bytes.js';
import { CodecError } from './codec/errors.js';
import {
  resolveLanguage, loadLanguagePreference, saveLanguagePreference, translate,
  translateDocument, translateVariant, translateError, formatCount,
} from './i18n/index.js';

const $ = (id) => document.getElementById(id);
const state = {
  mode: 'encode', variant: variants[0], result: '', valid: false, timer: null,
  counts: { input: [0, 'byte'], output: [0, 'character'] },
  error: null, status: null, copied: false, copyTimer: null, preserveCarriageReturns: false,
};
const browserLanguages = () => navigator.languages?.length ? navigator.languages : [navigator.language];
let languagePreference = loadLanguagePreference();
let language = resolveLanguage(languagePreference, browserLanguages());
const t = (key, params) => translate(language, key, params);
const variantSubtitles = new Map();
const MAX_INPUT_LENGTH = 2_000_000;
const byteFormat = () => $('byte-format').value;
const options = () => ({
  ...(state.variant.padding === 'optional' ? { padding: $('include-padding').checked } : {}),
  armor: $('include-armor').checked,
  label: $('pem-label').value,
});

for (const variant of variants) {
  const label = document.createElement('label');
  label.className = 'variant-option';
  const radio = document.createElement('input');
  Object.assign(radio, { type: 'radio', name: 'variant', value: variant.id, checked: variant === variants[0] });
  const card = document.createElement('span');
  card.className = 'variant-card';
  const name = document.createElement('strong');
  name.textContent = variant.name;
  const marker = document.createElement('span');
  marker.className = 'radio-mark';
  marker.setAttribute('aria-hidden', 'true');
  const subtitle = document.createElement('small');
  subtitle.textContent = translateVariant(language, variant, 'subtitle');
  variantSubtitles.set(variant, subtitle);
  card.append(name, marker, subtitle);
  label.append(radio, card);
  $('variant-options').append(label);
  radio.addEventListener('change', () => {
    state.variant = getVariant(radio.value);
    $('include-padding').checked = state.variant.paddingDefault;
    scheduleConversion();
  });
}

function updateLabels() {
  const encode = state.mode === 'encode';
  const variant = state.variant;
  const format = t(byteFormat() === 'text' ? 'textFormat' : 'hexFormat');
  $('encode-mode').setAttribute('aria-pressed', String(encode));
  $('decode-mode').setAttribute('aria-pressed', String(!encode));
  $('input-kind').textContent = encode ? format : variant.name;
  $('output-kind').textContent = encode ? variant.name : format;
  $('input').placeholder = encode ? (byteFormat() === 'text' ? t('placeholder.text') : '48 65 6c 6c 6f 2c 20 77 6f 72 6c 64 21') : t('placeholder.encoded');
  updateOutputPlaceholder();
  $('convert-label').textContent = t(state.mode);
  $('padding-control').hidden = !encode || variant.padding !== 'optional';
  $('pem-controls').hidden = !encode || variant.container !== 'pem';
  $('label-control').hidden = !$('include-armor').checked;
  $('input-help').textContent = t(state.preserveCarriageReturns ? 'help.carriageReturns' : `help.${state.mode}.${byteFormat()}`);
  $('reference-title').textContent = variant.name;
  $('variant-description').textContent = translateVariant(language, variant, 'description');
  $('spec-link').textContent = `${variant.reference ?? t('specification')} ↗`;
  $('spec-link').href = variant.referenceUrl ?? '#';
  $('spec-link').hidden = !variant.referenceUrl;
  $('alphabet-detail').textContent = variant.alphabet.startsWith('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')
    ? `A–Z a–z 0–9 ${variant.alphabet[62]} ${variant.alphabet[63]}` : variant.alphabet;
  $('padding-detail').textContent = t(variant.padding === 'required' ? 'requiredPadding' : 'optionalPadding');
  $('wrapping-detail').textContent = variant.lineLength
    ? t('wrapping', { length: variant.lineLength, ending: variant.lineEnding === '\r\n' ? 'CRLF' : 'LF' }) : t('noWrapping');
  $('decode-note').textContent = translateVariant(language, variant, 'decodeNote');
}

function updateOutputPlaceholder() {
  $('output').placeholder = $('auto-convert').checked
    ? t(`placeholder.${state.mode}`) : t('placeholder.manual', { operation: t(state.mode) });
}

function setCount(side, value, unit) {
  state.counts[side] = [value, unit];
  $(`${side}-count`).textContent = formatCount(language, value, unit);
}

function renderFeedback() {
  for (const [side, [value, unit]] of Object.entries(state.counts)) {
    $(`${side}-count`).textContent = formatCount(language, value, unit);
  }
  $('error').textContent = state.error ? translateError(language, state.error) : '';
  $('error').hidden = !state.error;
  $('copy').textContent = t(state.copied ? 'copied' : 'copy');
  $('status').textContent = state.status
    ? t(state.status.key, { bytes: formatCount(language, state.status.bytes ?? 0, 'byte') }) : '';
}

function applyLanguage() {
  language = resolveLanguage(languagePreference, browserLanguages());
  $('language').value = languagePreference;
  translateDocument(language);
  for (const [variant, subtitle] of variantSubtitles) {
    subtitle.textContent = translateVariant(language, variant, 'subtitle');
  }
  updateLabels();
  renderFeedback();
}

function resetResult() {
  state.valid = false;
  state.result = '';
  $('output').value = '';
  updateOutputPlaceholder();
  $('copy').disabled = true;
  $('use-output').disabled = true;
  setCount('output', 0, state.mode === 'encode' ? 'character' : 'byte');
  state.error = null;
  state.status = null;
  state.copied = false;
  clearTimeout(state.copyTimer);
  $('input').removeAttribute('aria-invalid');
  renderFeedback();
}

function showError(error) {
  state.error = error;
  renderFeedback();
  $('input').setAttribute('aria-invalid', 'true');
}

function convert(announce = false) {
  clearTimeout(state.timer);
  resetResult();
  const input = $('input').value;
  try {
    if (input.length > MAX_INPUT_LENGTH) throw new CodecError('inputTooLarge', 'Input is too large.', { limit: MAX_INPUT_LENGTH.toLocaleString(language) });
    let bytes;
    if (state.mode === 'encode') {
      bytes = byteFormat() === 'text' ? textToBytes(input) : hexToBytes(input);
      state.result = encodeBytes(bytes, state.variant, options());
      setCount('input', bytes.length, 'byte');
      setCount('output', state.result.length, 'character');
    } else {
      bytes = decodeBytes(input, state.variant);
      state.result = byteFormat() === 'text' ? bytesToText(bytes) : bytesToHex(bytes);
      setCount('input', input.length, 'character');
      setCount('output', bytes.length, 'byte');
    }
    // Keep the original string for copying: textareas normalize CRLF to LF.
    $('output').value = state.result;
    state.valid = true;
    $('copy').disabled = state.result.length === 0;
    $('use-output').disabled = state.result.length === 0;
    if (announce) state.status = { key: `status.${state.mode}`, bytes: bytes.length };
    renderFeedback();
  } catch (error) {
    setCount('input', input.length, 'character');
    showError(error);
  }
}

function scheduleConversion() {
  state.preserveCarriageReturns = false;
  updateLabels();
  clearTimeout(state.timer);
  resetResult();
  setCount('input', $('input').value.length, 'character');
  if ($('auto-convert').checked) state.timer = setTimeout(() => convert(), 120);
}

function setMode(mode) {
  state.mode = mode;
  scheduleConversion();
}

$('encode-mode').addEventListener('click', () => setMode('encode'));
$('decode-mode').addEventListener('click', () => setMode('decode'));
$('input').addEventListener('input', scheduleConversion);
for (const id of ['byte-format', 'include-padding', 'include-armor', 'auto-convert']) {
  $(id).addEventListener('change', scheduleConversion);
}
$('pem-label').addEventListener('input', scheduleConversion);
$('codec-form').addEventListener('submit', (event) => { event.preventDefault(); convert(true); });
$('codec-form').addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); convert(true); }
});
$('clear').addEventListener('click', () => {
  $('input').value = '';
  clearTimeout(state.timer);
  resetResult();
  setCount('input', 0, state.mode === 'encode' ? 'byte' : 'character');
  state.preserveCarriageReturns = false;
  updateLabels();
  $('input').focus();
});
$('sample').addEventListener('click', () => {
  state.preserveCarriageReturns = false;
  updateLabels();
  try {
    const sample = byteFormat() === 'text' ? textToBytes('Hello, world! 你好 👋') : new Uint8Array([0, 1, 2, 127, 128, 253, 254, 255]);
    $('input').value = state.mode === 'encode'
      ? (byteFormat() === 'text' ? bytesToText(sample) : bytesToHex(sample))
      : encodeBytes(sample, state.variant);
    convert(true);
    $('input').focus();
  } catch (error) {
    clearTimeout(state.timer);
    resetResult();
    showError(error);
  }
});
$('use-output').addEventListener('click', () => {
  if (!state.valid) return;
  // HTML textareas normalize CR/CRLF. Switch to hex before reinserting decoded
  // text with carriage returns so the reverse conversion stays byte-exact.
  const needsHex = state.mode === 'decode' && byteFormat() === 'text' && state.result.includes('\r');
  $('input').value = needsHex ? bytesToHex(textToBytes(state.result)) : state.result;
  if (needsHex) $('byte-format').value = 'hex';
  state.mode = state.mode === 'encode' ? 'decode' : 'encode';
  updateLabels();
  convert(true);
  state.preserveCarriageReturns = needsHex;
  updateLabels();
  $('input').focus();
});
$('copy').addEventListener('click', async () => {
  if (!state.valid) return;
  try {
    await navigator.clipboard.writeText(state.result);
    state.status = { key: 'status.copied' };
    state.copied = true;
    renderFeedback();
    clearTimeout(state.copyTimer);
    state.copyTimer = setTimeout(() => { state.copied = false; renderFeedback(); }, 1500);
  } catch {
    $('output').focus();
    $('output').select();
    state.error = { code: 'clipboard' };
    renderFeedback();
  }
});

$('language').addEventListener('change', () => {
  languagePreference = $('language').value;
  saveLanguagePreference(languagePreference);
  applyLanguage();
});
window.addEventListener('languagechange', () => {
  if (languagePreference === 'auto') applyLanguage();
});

applyLanguage();
convert();
