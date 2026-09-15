// HydraSkript - DOMMatrix / Path2D polyfill
// MUST be imported BEFORE any pdf-parse/pdfjs-dist imports.
// pdfjs-dist (pulled in by pdf-parse 2.x) touches both constructors while
// extracting text on serverless Node, which has neither.

class DOMMatrixPolyfill {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
  m11 = 1; m12 = 0; m13 = 0; m14 = 0
  m21 = 0; m22 = 1; m23 = 0; m24 = 0
  m31 = 0; m32 = 0; m33 = 1; m34 = 0
  m41 = 0; m42 = 0; m43 = 0; m44 = 1
  is2D = true; isIdentity = true
  constructor(_init?: string | number[]) {}
  multiply() { return new DOMMatrixPolyfill() }
  translate() { return new DOMMatrixPolyfill() }
  scale() { return new DOMMatrixPolyfill() }
  rotate() { return new DOMMatrixPolyfill() }
  invertSelf() { return this }
  inverse() { return new DOMMatrixPolyfill() }
  flipX() { return new DOMMatrixPolyfill() }
  flipY() { return new DOMMatrixPolyfill() }
  skewX() { return new DOMMatrixPolyfill() }
  skewY() { return new DOMMatrixPolyfill() }
  transformPoint(p?: { x?: number; y?: number }) { return { x: p?.x ?? 0, y: p?.y ?? 0, z: 0, w: 1 } }
  toFloat32Array() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) }
  toFloat64Array() { return new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) }
  toString() { return 'matrix(1, 0, 0, 1, 0, 0)' }
}

class Path2DPolyfill {
  constructor(_path?: string | Path2DPolyfill) {}
  addPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
  arc() {}
  arcTo() {}
  ellipse() {}
  rect() {}
  roundRect() {}
}

const g = globalThis as Record<string, unknown>

if (typeof g.DOMMatrix === 'undefined') {
  g.DOMMatrix = DOMMatrixPolyfill
  g.DOMMatrixReadOnly = DOMMatrixPolyfill
}

const DOMMatrixCtor = g.DOMMatrix as { fromMatrix?: unknown; fromFloat32Array?: unknown; fromFloat64Array?: unknown }
if (typeof DOMMatrixCtor.fromMatrix !== 'function') {
  DOMMatrixCtor.fromMatrix = () => new DOMMatrixPolyfill()
}
if (typeof DOMMatrixCtor.fromFloat32Array !== 'function') {
  DOMMatrixCtor.fromFloat32Array = () => new DOMMatrixPolyfill()
}
if (typeof DOMMatrixCtor.fromFloat64Array !== 'function') {
  DOMMatrixCtor.fromFloat64Array = () => new DOMMatrixPolyfill()
}

if (typeof g.Path2D === 'undefined') {
  g.Path2D = Path2DPolyfill
}

export {}
