/** Stable codes allow callers to translate errors without coupling the codec to a UI. */
export class CodecError extends Error {
  constructor(code, message, params = {}) {
    super(message);
    this.name = 'CodecError';
    this.code = code;
    this.params = params;
  }
}
