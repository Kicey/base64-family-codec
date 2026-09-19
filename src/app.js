import { encodeBytes, decodeBytes } from './codec/base64.js';
import { variants, getVariant } from './codec/variants.js';
import { textToBytes, bytesToText, hexToBytes, bytesToHex } from './codec/bytes.js';

const $ = (id) => document.getElementById(id);
const state = { mode: 'encode', variant: variants[0], result: '', valid: false, timer: null };
const MAX_INPUT_LENGTH = 2_000_000;
const byteFormat = () => $('byte-format').value;
const count = (value, unit) => `${value.toLocaleString()} ${unit}${value === 1 ? '' : 's'}`;
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
  subtitle.textContent = variant.subtitle ?? 'Custom variant';
  card.append(name, marker, subtitle);
  label.append(radio, card);
  $('variant-options').append(label);
  radio.addEventListener('change', () => {
    state.variant = getVariant(radio.value);
    $('include-padding').checked = state.variant.paddingDefault;
    updateLabels();
    scheduleConversion();
  });
}

function updateLabels() {
  const encode = state.mode === 'encode';
  const variant = state.variant;
  const format = byteFormat() === 'text' ? 'UTF-8 text' : 'Hex bytes';
  $('encode-mode').setAttribute('aria-pressed', String(encode));
  $('decode-mode').setAttribute('aria-pressed', String(!encode));
  $('input-kind').textContent = encode ? format : variant.name;
  $('output-kind').textContent = encode ? variant.name : format;
  $('input').placeholder = encode ? (byteFormat() === 'text' ? 'Type or paste something here…' : '48 65 6c 6c 6f 2c 20 77 6f 72 6c 64 21') : 'Paste your encoded data here…';
  $('output').placeholder = `Your ${encode ? 'encoded' : 'decoded'} output will appear here.`;
  $('convert').replaceChildren(document.createTextNode(`${encode ? 'Encode' : 'Decode'} `));
  const arrow = document.createElement('span');
  arrow.textContent = '→';
  arrow.setAttribute('aria-hidden', 'true');
  $('convert').append(arrow);
  $('padding-control').hidden = !encode || variant.padding !== 'optional';
  $('pem-controls').hidden = !encode || variant.container !== 'pem';
  $('label-control').hidden = !$('include-armor').checked;
  $('input-help').textContent = encode
    ? (byteFormat() === 'text' ? 'Text is encoded as UTF-8. Whitespace in your text is preserved.' : 'Enter two hex digits per byte. Spaces and line breaks are accepted.')
    : (byteFormat() === 'text' ? 'Decode to UTF-8 text. For binary data, select Hex bytes.' : 'Decoded bytes are displayed as hexadecimal pairs.');
  $('reference-title').textContent = variant.name;
  $('variant-description').textContent = variant.description ?? '';
  $('spec-link').textContent = `${variant.reference ?? 'Specification'} ↗`;
  $('spec-link').href = variant.referenceUrl ?? '#';
  $('spec-link').hidden = !variant.referenceUrl;
  $('alphabet-detail').textContent = variant.alphabet.startsWith('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')
    ? `A–Z a–z 0–9 ${variant.alphabet[62]} ${variant.alphabet[63]}` : variant.alphabet;
  $('padding-detail').textContent = variant.padding === 'required' ? 'Required (=)' : 'Optional (=)';
  $('wrapping-detail').textContent = variant.lineLength ? `${variant.lineLength} chars · ${variant.lineEnding === '\r\n' ? 'CRLF' : 'LF'}` : 'None';
  $('decode-note').textContent = variant.decodeNote ?? '';
}

function resetResult() {
  state.valid = false;
  state.result = '';
  $('output').value = '';
  $('output').placeholder = $('auto-convert').checked
    ? `Your ${state.mode === 'encode' ? 'encoded' : 'decoded'} output will appear here.`
    : `Select ${state.mode === 'encode' ? 'Encode' : 'Decode'} to convert your input.`;
  $('copy').disabled = true;
  $('use-output').disabled = true;
  $('output-count').textContent = state.mode === 'encode' ? '0 characters' : '0 bytes';
  $('error').hidden = true;
  $('error').textContent = '';
  $('input').removeAttribute('aria-invalid');
  $('status').textContent = '';
}

function showError(error) {
  $('error').textContent = error.message;
  $('error').hidden = false;
  $('input').setAttribute('aria-invalid', 'true');
}

function convert(announce = false) {
  clearTimeout(state.timer);
  resetResult();
  const input = $('input').value;
  try {
    if (input.length > MAX_INPUT_LENGTH) throw new Error('Input is too large. Use at most 2,000,000 characters per conversion.');
    let bytes;
    if (state.mode === 'encode') {
      bytes = byteFormat() === 'text' ? textToBytes(input) : hexToBytes(input);
      state.result = encodeBytes(bytes, state.variant, options());
      $('input-count').textContent = count(bytes.length, 'byte');
      $('output-count').textContent = count(state.result.length, 'character');
    } else {
      bytes = decodeBytes(input, state.variant);
      state.result = byteFormat() === 'text' ? bytesToText(bytes) : bytesToHex(bytes);
      $('input-count').textContent = count(input.length, 'character');
      $('output-count').textContent = count(bytes.length, 'byte');
    }
    // Keep the original string for copying: textareas normalize CRLF to LF.
    $('output').value = state.result;
    state.valid = true;
    $('copy').disabled = state.result.length === 0;
    $('use-output').disabled = state.result.length === 0;
    if (announce) $('status').textContent = `${state.mode === 'encode' ? 'Encoded' : 'Decoded'} ${count(bytes.length, 'byte')}.`;
  } catch (error) {
    $('input-count').textContent = count(input.length, 'character');
    showError(error);
  }
}

function scheduleConversion() {
  clearTimeout(state.timer);
  resetResult();
  $('input-count').textContent = count($('input').value.length, 'character');
  if ($('auto-convert').checked) state.timer = setTimeout(() => convert(), 120);
}

function setMode(mode) {
  state.mode = mode;
  updateLabels();
  scheduleConversion();
}

$('encode-mode').addEventListener('click', () => setMode('encode'));
$('decode-mode').addEventListener('click', () => setMode('decode'));
$('input').addEventListener('input', scheduleConversion);
for (const id of ['byte-format', 'include-padding', 'include-armor', 'auto-convert']) {
  $(id).addEventListener('change', () => { updateLabels(); scheduleConversion(); });
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
  $('input-count').textContent = state.mode === 'encode' ? '0 bytes' : '0 characters';
  $('input').focus();
});
$('sample').addEventListener('click', () => {
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
  if (needsHex) $('input-help').textContent = 'Switched to Hex bytes to preserve carriage returns exactly.';
  $('input').focus();
});
$('copy').addEventListener('click', async () => {
  if (!state.valid) return;
  try {
    await navigator.clipboard.writeText(state.result);
    $('status').textContent = 'Output copied to clipboard.';
    $('copy').textContent = 'Copied!';
    setTimeout(() => { $('copy').textContent = 'Copy output'; }, 1500);
  } catch {
    $('output').focus();
    $('output').select();
    $('error').textContent = 'Clipboard access is unavailable. The output is selected; copy it with your keyboard. Manual copying may normalize line endings.';
    $('error').hidden = false;
  }
});

updateLabels();
convert();
