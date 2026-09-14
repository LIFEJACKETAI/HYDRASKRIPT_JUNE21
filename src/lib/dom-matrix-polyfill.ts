// HydraSkript - DOMMatrix Polyfill
// MUST be imported BEFORE any pdf-parse/pdfjs-dist imports
// Place this at the very top of any file that uses pdf-parse

// Minimal DOMMatrix polyfill for pdfjs-dist compatibility in Node.js
class DOMMatrixPolyfill {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  m11 = 1; m12 = 0; m13 = 0; m14 = 0;
  m21 = 0; m22 = 1; m23 = 0; m24 = 0;
  m31 = 0; m32 = 0; m33 = 1; m34 = 0;
  m41 = 0; m42 = 0; m43 = 0; m44 = 1;
  is2D = true; isIdentity = true;
  constructor(init?: string | number[]) {}
  multiply() { return new DOMMatrixPolyfill(); }
  translate() { return new DOMMatrixPolyfill(); }
  scale() { return new DOMMatrixPolyfill(); }
  rotate() { return new DOMMatrixPolyfill(); }
  flipX() { return new DOMMatrixPolyfill(); }
  flipY() { return new DOMMatrixPolyfill(); }
  skewX() { return new DOMMatrixPolyfill(); }
  skewY() { return new DOMMatrixPolyfill(); }
  toFloat32Array() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }
  toFloat64Array() { return new Float64Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }
  toString() { return 'matrix(1, 0, 0, 1, 0, 0)'; }
}

// Install polyfill BEFORE any other imports
if (typeof globalThis.DOMMatrix === 'undefined') {
  // @ts-ignore
  globalThis.DOMMatrix = DOMMatrixPolyfill;
  // @ts-ignore
  globalThis.DOMMatrixReadOnly = DOMMatrixPolyfill;
}

// Also provide a no-op for DOMMatrix.fromMatrix / fromFloat32Array / fromFloat64Array
// @ts-ignore
if (!globalThis.DOMMatrix.fromMatrix) {
  // @ts-ignore
  globalThis.DOMMatrix.fromMatrix = () => new DOMMatrixPolyfill();
}
// @ts-ignore
if (!globalThis.DOMMatrix.fromFloat32Array) {
  // @ts-ignore
  globalThis.DOMMatrix.fromFloat32Array = () => new DOMMatrixPolyfill();
}
// @ts-ignore
if (!globalThis.DOMMatrix.fromFloat64Array) {
  // @ts-ignore
  globalThis.DOMMatrix.fromFloat64Array = () => new DOMMatrixPolyfill();
}

export {};