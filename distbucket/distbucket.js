"use strict";
(function() {

Error.stackTraceLimit = Infinity;

var $global, $module;
if (typeof window !== "undefined") { /* web page */
  $global = window;
} else if (typeof self !== "undefined") { /* web worker */
  $global = self;
} else if (typeof global !== "undefined") { /* Node.js */
  $global = global;
  $global.require = require;
} else { /* others (e.g. Nashorn) */
  $global = this;
}

if ($global === undefined || $global.Array === undefined) {
  throw new Error("no global object found");
}
if (typeof module !== "undefined") {
  $module = module;
}
var $linknames = {} // Collection of functions referenced by a go:linkname directive.
var $packages = {}, $idCounter = 0;
var $keys = function(m) { return m ? Object.keys(m) : []; };
var $flushConsole = function() {};
var $throwRuntimeError; /* set by package "runtime" */
var $throwNilPointerError = function() { $throwRuntimeError("invalid memory address or nil pointer dereference"); };
var $call = function(fn, rcvr, args) { return fn.apply(rcvr, args); };
var $makeFunc = function(fn) { return function() { return $externalize(fn(this, new ($sliceType($jsObjectPtr))($global.Array.prototype.slice.call(arguments, []))), $emptyInterface); }; };
var $unused = function(v) {};
var $print = console.log;
// Under Node we can emulate print() more closely by avoiding a newline.
if (($global.process !== undefined) && $global.require) {
  try {
    var util = $global.require('util');
    $print = function() { $global.process.stderr.write(util.format.apply(this, arguments)); };
  } catch (e) {
    // Failed to require util module, keep using console.log().
  }
}
var $println = console.log

var $initAllLinknames = function() {
  var names = $keys($packages);
  for (var i = 0; i < names.length; i++) {
    var f = $packages[names[i]]["$initLinknames"];
    if (typeof f == 'function') {
      f();
    }
  }
}

var $mapArray = function(array, f) {
  var newArray = new array.constructor(array.length);
  for (var i = 0; i < array.length; i++) {
    newArray[i] = f(array[i]);
  }
  return newArray;
};

var $methodVal = function(recv, name) {
  var vals = recv.$methodVals || {};
  recv.$methodVals = vals; /* noop for primitives */
  var f = vals[name];
  if (f !== undefined) {
    return f;
  }
  var method = recv[name];
  f = function() {
    $stackDepthOffset--;
    try {
      return method.apply(recv, arguments);
    } finally {
      $stackDepthOffset++;
    }
  };
  vals[name] = f;
  return f;
};

var $methodExpr = function(typ, name) {
  var method = typ.prototype[name];
  if (method.$expr === undefined) {
    method.$expr = function() {
      $stackDepthOffset--;
      try {
        if (typ.wrapped) {
          arguments[0] = new typ(arguments[0]);
        }
        return Function.call.apply(method, arguments);
      } finally {
        $stackDepthOffset++;
      }
    };
  }
  return method.$expr;
};

var $ifaceMethodExprs = {};
var $ifaceMethodExpr = function(name) {
  var expr = $ifaceMethodExprs["$" + name];
  if (expr === undefined) {
    expr = $ifaceMethodExprs["$" + name] = function() {
      $stackDepthOffset--;
      try {
        return Function.call.apply(arguments[0][name], arguments);
      } finally {
        $stackDepthOffset++;
      }
    };
  }
  return expr;
};

var $subslice = function(slice, low, high, max) {
  if (high === undefined) {
    high = slice.$length;
  }
  if (max === undefined) {
    max = slice.$capacity;
  }
  if (low < 0 || high < low || max < high || high > slice.$capacity || max > slice.$capacity) {
    $throwRuntimeError("slice bounds out of range");
  }
  if (slice === slice.constructor.nil) {
    return slice;
  }
  var s = new slice.constructor(slice.$array);
  s.$offset = slice.$offset + low;
  s.$length = high - low;
  s.$capacity = max - low;
  return s;
};

var $substring = function(str, low, high) {
  if (low < 0 || high < low || high > str.length) {
    $throwRuntimeError("slice bounds out of range");
  }
  return str.substring(low, high);
};

var $sliceToArray = function(slice) {
  if (slice.$array.constructor !== Array) {
    return slice.$array.subarray(slice.$offset, slice.$offset + slice.$length);
  }
  return slice.$array.slice(slice.$offset, slice.$offset + slice.$length);
};

var $decodeRune = function(str, pos) {
  var c0 = str.charCodeAt(pos);

  if (c0 < 0x80) {
    return [c0, 1];
  }

  if (c0 !== c0 || c0 < 0xC0) {
    return [0xFFFD, 1];
  }

  var c1 = str.charCodeAt(pos + 1);
  if (c1 !== c1 || c1 < 0x80 || 0xC0 <= c1) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xE0) {
    var r = (c0 & 0x1F) << 6 | (c1 & 0x3F);
    if (r <= 0x7F) {
      return [0xFFFD, 1];
    }
    return [r, 2];
  }

  var c2 = str.charCodeAt(pos + 2);
  if (c2 !== c2 || c2 < 0x80 || 0xC0 <= c2) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xF0) {
    var r = (c0 & 0x0F) << 12 | (c1 & 0x3F) << 6 | (c2 & 0x3F);
    if (r <= 0x7FF) {
      return [0xFFFD, 1];
    }
    if (0xD800 <= r && r <= 0xDFFF) {
      return [0xFFFD, 1];
    }
    return [r, 3];
  }

  var c3 = str.charCodeAt(pos + 3);
  if (c3 !== c3 || c3 < 0x80 || 0xC0 <= c3) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xF8) {
    var r = (c0 & 0x07) << 18 | (c1 & 0x3F) << 12 | (c2 & 0x3F) << 6 | (c3 & 0x3F);
    if (r <= 0xFFFF || 0x10FFFF < r) {
      return [0xFFFD, 1];
    }
    return [r, 4];
  }

  return [0xFFFD, 1];
};

var $encodeRune = function(r) {
  if (r < 0 || r > 0x10FFFF || (0xD800 <= r && r <= 0xDFFF)) {
    r = 0xFFFD;
  }
  if (r <= 0x7F) {
    return String.fromCharCode(r);
  }
  if (r <= 0x7FF) {
    return String.fromCharCode(0xC0 | r >> 6, 0x80 | (r & 0x3F));
  }
  if (r <= 0xFFFF) {
    return String.fromCharCode(0xE0 | r >> 12, 0x80 | (r >> 6 & 0x3F), 0x80 | (r & 0x3F));
  }
  return String.fromCharCode(0xF0 | r >> 18, 0x80 | (r >> 12 & 0x3F), 0x80 | (r >> 6 & 0x3F), 0x80 | (r & 0x3F));
};

var $stringToBytes = function(str) {
  var array = new Uint8Array(str.length);
  for (var i = 0; i < str.length; i++) {
    array[i] = str.charCodeAt(i);
  }
  return array;
};

var $bytesToString = function(slice) {
  if (slice.$length === 0) {
    return "";
  }
  var str = "";
  for (var i = 0; i < slice.$length; i += 10000) {
    str += String.fromCharCode.apply(undefined, slice.$array.subarray(slice.$offset + i, slice.$offset + Math.min(slice.$length, i + 10000)));
  }
  return str;
};

var $stringToRunes = function(str) {
  var array = new Int32Array(str.length);
  var rune, j = 0;
  for (var i = 0; i < str.length; i += rune[1], j++) {
    rune = $decodeRune(str, i);
    array[j] = rune[0];
  }
  return array.subarray(0, j);
};

var $runesToString = function(slice) {
  if (slice.$length === 0) {
    return "";
  }
  var str = "";
  for (var i = 0; i < slice.$length; i++) {
    str += $encodeRune(slice.$array[slice.$offset + i]);
  }
  return str;
};

var $copyString = function(dst, src) {
  var n = Math.min(src.length, dst.$length);
  for (var i = 0; i < n; i++) {
    dst.$array[dst.$offset + i] = src.charCodeAt(i);
  }
  return n;
};

var $copySlice = function(dst, src) {
  var n = Math.min(src.$length, dst.$length);
  $copyArray(dst.$array, src.$array, dst.$offset, src.$offset, n, dst.constructor.elem);
  return n;
};

var $copyArray = function(dst, src, dstOffset, srcOffset, n, elem) {
  if (n === 0 || (dst === src && dstOffset === srcOffset)) {
    return;
  }

  if (src.subarray) {
    dst.set(src.subarray(srcOffset, srcOffset + n), dstOffset);
    return;
  }

  switch (elem.kind) {
  case $kindArray:
  case $kindStruct:
    if (dst === src && dstOffset > srcOffset) {
      for (var i = n - 1; i >= 0; i--) {
        elem.copy(dst[dstOffset + i], src[srcOffset + i]);
      }
      return;
    }
    for (var i = 0; i < n; i++) {
      elem.copy(dst[dstOffset + i], src[srcOffset + i]);
    }
    return;
  }

  if (dst === src && dstOffset > srcOffset) {
    for (var i = n - 1; i >= 0; i--) {
      dst[dstOffset + i] = src[srcOffset + i];
    }
    return;
  }
  for (var i = 0; i < n; i++) {
    dst[dstOffset + i] = src[srcOffset + i];
  }
};

var $clone = function(src, type) {
  var clone = type.zero();
  type.copy(clone, src);
  return clone;
};

var $pointerOfStructConversion = function(obj, type) {
  if(obj.$proxies === undefined) {
    obj.$proxies = {};
    obj.$proxies[obj.constructor.string] = obj;
  }
  var proxy = obj.$proxies[type.string];
  if (proxy === undefined) {
    var properties = {};
    for (var i = 0; i < type.elem.fields.length; i++) {
      (function(fieldProp) {
        properties[fieldProp] = {
          get: function() { return obj[fieldProp]; },
          set: function(value) { obj[fieldProp] = value; }
        };
      })(type.elem.fields[i].prop);
    }
    proxy = Object.create(type.prototype, properties);
    proxy.$val = proxy;
    obj.$proxies[type.string] = proxy;
    proxy.$proxies = obj.$proxies;
  }
  return proxy;
};

var $append = function(slice) {
  return $internalAppend(slice, arguments, 1, arguments.length - 1);
};

var $appendSlice = function(slice, toAppend) {
  if (toAppend.constructor === String) {
    var bytes = $stringToBytes(toAppend);
    return $internalAppend(slice, bytes, 0, bytes.length);
  }
  return $internalAppend(slice, toAppend.$array, toAppend.$offset, toAppend.$length);
};

var $internalAppend = function(slice, array, offset, length) {
  if (length === 0) {
    return slice;
  }

  var newArray = slice.$array;
  var newOffset = slice.$offset;
  var newLength = slice.$length + length;
  var newCapacity = slice.$capacity;

  if (newLength > newCapacity) {
    newOffset = 0;
    newCapacity = Math.max(newLength, slice.$capacity < 1024 ? slice.$capacity * 2 : Math.floor(slice.$capacity * 5 / 4));

    if (slice.$array.constructor === Array) {
      newArray = slice.$array.slice(slice.$offset, slice.$offset + slice.$length);
      newArray.length = newCapacity;
      var zero = slice.constructor.elem.zero;
      for (var i = slice.$length; i < newCapacity; i++) {
        newArray[i] = zero();
      }
    } else {
      newArray = new slice.$array.constructor(newCapacity);
      newArray.set(slice.$array.subarray(slice.$offset, slice.$offset + slice.$length));
    }
  }

  $copyArray(newArray, array, newOffset + slice.$length, offset, length, slice.constructor.elem);

  var newSlice = new slice.constructor(newArray);
  newSlice.$offset = newOffset;
  newSlice.$length = newLength;
  newSlice.$capacity = newCapacity;
  return newSlice;
};

var $equal = function(a, b, type) {
  if (type === $jsObjectPtr) {
    return a === b;
  }
  switch (type.kind) {
  case $kindComplex64:
  case $kindComplex128:
    return a.$real === b.$real && a.$imag === b.$imag;
  case $kindInt64:
  case $kindUint64:
    return a.$high === b.$high && a.$low === b.$low;
  case $kindArray:
    if (a.length !== b.length) {
      return false;
    }
    for (var i = 0; i < a.length; i++) {
      if (!$equal(a[i], b[i], type.elem)) {
        return false;
      }
    }
    return true;
  case $kindStruct:
    for (var i = 0; i < type.fields.length; i++) {
      var f = type.fields[i];
      if (!$equal(a[f.prop], b[f.prop], f.typ)) {
        return false;
      }
    }
    return true;
  case $kindInterface:
    return $interfaceIsEqual(a, b);
  default:
    return a === b;
  }
};

var $interfaceIsEqual = function(a, b) {
  if (a === $ifaceNil || b === $ifaceNil) {
    return a === b;
  }
  if (a.constructor !== b.constructor) {
    return false;
  }
  if (a.constructor === $jsObjectPtr) {
    return a.object === b.object;
  }
  if (!a.constructor.comparable) {
    $throwRuntimeError("comparing uncomparable type " + a.constructor.string);
  }
  return $equal(a.$val, b.$val, a.constructor);
};

var $min = Math.min;
var $mod = function(x, y) { return x % y; };
var $parseInt = parseInt;
var $parseFloat = function(f) {
  if (f !== undefined && f !== null && f.constructor === Number) {
    return f;
  }
  return parseFloat(f);
};

var $froundBuf = new Float32Array(1);
var $fround = Math.fround || function(f) {
  $froundBuf[0] = f;
  return $froundBuf[0];
};

var $imul = Math.imul || function(a, b) {
  var ah = (a >>> 16) & 0xffff;
  var al = a & 0xffff;
  var bh = (b >>> 16) & 0xffff;
  var bl = b & 0xffff;
  return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0) >> 0);
};

var $floatKey = function(f) {
  if (f !== f) {
    $idCounter++;
    return "NaN$" + $idCounter;
  }
  return String(f);
};

var $flatten64 = function(x) {
  return x.$high * 4294967296 + x.$low;
};

var $shiftLeft64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high << y | x.$low >>> (32 - y), (x.$low << y) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(x.$low << (y - 32), 0);
  }
  return new x.constructor(0, 0);
};

var $shiftRightInt64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high >> y, (x.$low >>> y | x.$high << (32 - y)) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(x.$high >> 31, (x.$high >> (y - 32)) >>> 0);
  }
  if (x.$high < 0) {
    return new x.constructor(-1, 4294967295);
  }
  return new x.constructor(0, 0);
};

var $shiftRightUint64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high >>> y, (x.$low >>> y | x.$high << (32 - y)) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(0, x.$high >>> (y - 32));
  }
  return new x.constructor(0, 0);
};

var $mul64 = function(x, y) {
  var high = 0, low = 0;
  if ((y.$low & 1) !== 0) {
    high = x.$high;
    low = x.$low;
  }
  for (var i = 1; i < 32; i++) {
    if ((y.$low & 1<<i) !== 0) {
      high += x.$high << i | x.$low >>> (32 - i);
      low += (x.$low << i) >>> 0;
    }
  }
  for (var i = 0; i < 32; i++) {
    if ((y.$high & 1<<i) !== 0) {
      high += x.$low << i;
    }
  }
  return new x.constructor(high, low);
};

var $div64 = function(x, y, returnRemainder) {
  if (y.$high === 0 && y.$low === 0) {
    $throwRuntimeError("integer divide by zero");
  }

  var s = 1;
  var rs = 1;

  var xHigh = x.$high;
  var xLow = x.$low;
  if (xHigh < 0) {
    s = -1;
    rs = -1;
    xHigh = -xHigh;
    if (xLow !== 0) {
      xHigh--;
      xLow = 4294967296 - xLow;
    }
  }

  var yHigh = y.$high;
  var yLow = y.$low;
  if (y.$high < 0) {
    s *= -1;
    yHigh = -yHigh;
    if (yLow !== 0) {
      yHigh--;
      yLow = 4294967296 - yLow;
    }
  }

  var high = 0, low = 0, n = 0;
  while (yHigh < 2147483648 && ((xHigh > yHigh) || (xHigh === yHigh && xLow > yLow))) {
    yHigh = (yHigh << 1 | yLow >>> 31) >>> 0;
    yLow = (yLow << 1) >>> 0;
    n++;
  }
  for (var i = 0; i <= n; i++) {
    high = high << 1 | low >>> 31;
    low = (low << 1) >>> 0;
    if ((xHigh > yHigh) || (xHigh === yHigh && xLow >= yLow)) {
      xHigh = xHigh - yHigh;
      xLow = xLow - yLow;
      if (xLow < 0) {
        xHigh--;
        xLow += 4294967296;
      }
      low++;
      if (low === 4294967296) {
        high++;
        low = 0;
      }
    }
    yLow = (yLow >>> 1 | yHigh << (32 - 1)) >>> 0;
    yHigh = yHigh >>> 1;
  }

  if (returnRemainder) {
    return new x.constructor(xHigh * rs, xLow * rs);
  }
  return new x.constructor(high * s, low * s);
};

var $divComplex = function(n, d) {
  var ninf = n.$real === Infinity || n.$real === -Infinity || n.$imag === Infinity || n.$imag === -Infinity;
  var dinf = d.$real === Infinity || d.$real === -Infinity || d.$imag === Infinity || d.$imag === -Infinity;
  var nnan = !ninf && (n.$real !== n.$real || n.$imag !== n.$imag);
  var dnan = !dinf && (d.$real !== d.$real || d.$imag !== d.$imag);
  if(nnan || dnan) {
    return new n.constructor(NaN, NaN);
  }
  if (ninf && !dinf) {
    return new n.constructor(Infinity, Infinity);
  }
  if (!ninf && dinf) {
    return new n.constructor(0, 0);
  }
  if (d.$real === 0 && d.$imag === 0) {
    if (n.$real === 0 && n.$imag === 0) {
      return new n.constructor(NaN, NaN);
    }
    return new n.constructor(Infinity, Infinity);
  }
  var a = Math.abs(d.$real);
  var b = Math.abs(d.$imag);
  if (a <= b) {
    var ratio = d.$real / d.$imag;
    var denom = d.$real * ratio + d.$imag;
    return new n.constructor((n.$real * ratio + n.$imag) / denom, (n.$imag * ratio - n.$real) / denom);
  }
  var ratio = d.$imag / d.$real;
  var denom = d.$imag * ratio + d.$real;
  return new n.constructor((n.$imag * ratio + n.$real) / denom, (n.$imag - n.$real * ratio) / denom);
};

var $kindBool = 1;
var $kindInt = 2;
var $kindInt8 = 3;
var $kindInt16 = 4;
var $kindInt32 = 5;
var $kindInt64 = 6;
var $kindUint = 7;
var $kindUint8 = 8;
var $kindUint16 = 9;
var $kindUint32 = 10;
var $kindUint64 = 11;
var $kindUintptr = 12;
var $kindFloat32 = 13;
var $kindFloat64 = 14;
var $kindComplex64 = 15;
var $kindComplex128 = 16;
var $kindArray = 17;
var $kindChan = 18;
var $kindFunc = 19;
var $kindInterface = 20;
var $kindMap = 21;
var $kindPtr = 22;
var $kindSlice = 23;
var $kindString = 24;
var $kindStruct = 25;
var $kindUnsafePointer = 26;

var $methodSynthesizers = [];
var $addMethodSynthesizer = function(f) {
  if ($methodSynthesizers === null) {
    f();
    return;
  }
  $methodSynthesizers.push(f);
};
var $synthesizeMethods = function() {
  $methodSynthesizers.forEach(function(f) { f(); });
  $methodSynthesizers = null;
};

var $ifaceKeyFor = function(x) {
  if (x === $ifaceNil) {
    return 'nil';
  }
  var c = x.constructor;
  return c.string + '$' + c.keyFor(x.$val);
};

var $identity = function(x) { return x; };

var $typeIDCounter = 0;

var $idKey = function(x) {
  if (x.$id === undefined) {
    $idCounter++;
    x.$id = $idCounter;
  }
  return String(x.$id);
};

var $newType = function(size, kind, string, named, pkg, exported, constructor) {
  var typ;
  switch(kind) {
  case $kindBool:
  case $kindInt:
  case $kindInt8:
  case $kindInt16:
  case $kindInt32:
  case $kindUint:
  case $kindUint8:
  case $kindUint16:
  case $kindUint32:
  case $kindUintptr:
  case $kindUnsafePointer:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.keyFor = $identity;
    break;

  case $kindString:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.keyFor = function(x) { return "$" + x; };
    break;

  case $kindFloat32:
  case $kindFloat64:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.keyFor = function(x) { return $floatKey(x); };
    break;

  case $kindInt64:
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.keyFor = function(x) { return x.$high + "$" + x.$low; };
    break;

  case $kindUint64:
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >>> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.keyFor = function(x) { return x.$high + "$" + x.$low; };
    break;

  case $kindComplex64:
    typ = function(real, imag) {
      this.$real = $fround(real);
      this.$imag = $fround(imag);
      this.$val = this;
    };
    typ.keyFor = function(x) { return x.$real + "$" + x.$imag; };
    break;

  case $kindComplex128:
    typ = function(real, imag) {
      this.$real = real;
      this.$imag = imag;
      this.$val = this;
    };
    typ.keyFor = function(x) { return x.$real + "$" + x.$imag; };
    break;

  case $kindArray:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.ptr = $newType(4, $kindPtr, "*" + string, false, "", false, function(array) {
      this.$get = function() { return array; };
      this.$set = function(v) { typ.copy(this, v); };
      this.$val = array;
    });
    typ.init = function(elem, len) {
      typ.elem = elem;
      typ.len = len;
      typ.comparable = elem.comparable;
      typ.keyFor = function(x) {
        return Array.prototype.join.call($mapArray(x, function(e) {
          return String(elem.keyFor(e)).replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
        }), "$");
      };
      typ.copy = function(dst, src) {
        $copyArray(dst, src, 0, 0, src.length, elem);
      };
      typ.ptr.init(typ);
      Object.defineProperty(typ.ptr.nil, "nilCheck", { get: $throwNilPointerError });
    };
    break;

  case $kindChan:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.keyFor = $idKey;
    typ.init = function(elem, sendOnly, recvOnly) {
      typ.elem = elem;
      typ.sendOnly = sendOnly;
      typ.recvOnly = recvOnly;
    };
    break;

  case $kindFunc:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.init = function(params, results, variadic) {
      typ.params = params;
      typ.results = results;
      typ.variadic = variadic;
      typ.comparable = false;
    };
    break;

  case $kindInterface:
    typ = { implementedBy: {}, missingMethodFor: {} };
    typ.keyFor = $ifaceKeyFor;
    typ.init = function(methods) {
      typ.methods = methods;
      methods.forEach(function(m) {
        $ifaceNil[m.prop] = $throwNilPointerError;
      });
    };
    break;

  case $kindMap:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.init = function(key, elem) {
      typ.key = key;
      typ.elem = elem;
      typ.comparable = false;
    };
    break;

  case $kindPtr:
    typ = constructor || function(getter, setter, target) {
      this.$get = getter;
      this.$set = setter;
      this.$target = target;
      this.$val = this;
    };
    typ.keyFor = $idKey;
    typ.init = function(elem) {
      typ.elem = elem;
      typ.wrapped = (elem.kind === $kindArray);
      typ.nil = new typ($throwNilPointerError, $throwNilPointerError);
    };
    break;

  case $kindSlice:
    typ = function(array) {
      if (array.constructor !== typ.nativeArray) {
        array = new typ.nativeArray(array);
      }
      this.$array = array;
      this.$offset = 0;
      this.$length = array.length;
      this.$capacity = array.length;
      this.$val = this;
    };
    typ.init = function(elem) {
      typ.elem = elem;
      typ.comparable = false;
      typ.nativeArray = $nativeArray(elem.kind);
      typ.nil = new typ([]);
    };
    break;

  case $kindStruct:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.ptr = $newType(4, $kindPtr, "*" + string, false, pkg, exported, constructor);
    typ.ptr.elem = typ;
    typ.ptr.prototype.$get = function() { return this; };
    typ.ptr.prototype.$set = function(v) { typ.copy(this, v); };
    typ.init = function(pkgPath, fields) {
      typ.pkgPath = pkgPath;
      typ.fields = fields;
      fields.forEach(function(f) {
        if (!f.typ.comparable) {
          typ.comparable = false;
        }
      });
      typ.keyFor = function(x) {
        var val = x.$val;
        return $mapArray(fields, function(f) {
          return String(f.typ.keyFor(val[f.prop])).replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
        }).join("$");
      };
      typ.copy = function(dst, src) {
        for (var i = 0; i < fields.length; i++) {
          var f = fields[i];
          switch (f.typ.kind) {
          case $kindArray:
          case $kindStruct:
            f.typ.copy(dst[f.prop], src[f.prop]);
            continue;
          default:
            dst[f.prop] = src[f.prop];
            continue;
          }
        }
      };
      /* nil value */
      var properties = {};
      fields.forEach(function(f) {
        properties[f.prop] = { get: $throwNilPointerError, set: $throwNilPointerError };
      });
      typ.ptr.nil = Object.create(constructor.prototype, properties);
      typ.ptr.nil.$val = typ.ptr.nil;
      /* methods for embedded fields */
      $addMethodSynthesizer(function() {
        var synthesizeMethod = function(target, m, f) {
          if (target.prototype[m.prop] !== undefined) { return; }
          target.prototype[m.prop] = function() {
            var v = this.$val[f.prop];
            if (f.typ === $jsObjectPtr) {
              v = new $jsObjectPtr(v);
            }
            if (v.$val === undefined) {
              v = new f.typ(v);
            }
            return v[m.prop].apply(v, arguments);
          };
        };
        fields.forEach(function(f) {
          if (f.embedded) {
            $methodSet(f.typ).forEach(function(m) {
              synthesizeMethod(typ, m, f);
              synthesizeMethod(typ.ptr, m, f);
            });
            $methodSet($ptrType(f.typ)).forEach(function(m) {
              synthesizeMethod(typ.ptr, m, f);
            });
          }
        });
      });
    };
    break;

  default:
    $panic(new $String("invalid kind: " + kind));
  }

  switch (kind) {
  case $kindBool:
  case $kindMap:
    typ.zero = function() { return false; };
    break;

  case $kindInt:
  case $kindInt8:
  case $kindInt16:
  case $kindInt32:
  case $kindUint:
  case $kindUint8 :
  case $kindUint16:
  case $kindUint32:
  case $kindUintptr:
  case $kindUnsafePointer:
  case $kindFloat32:
  case $kindFloat64:
    typ.zero = function() { return 0; };
    break;

  case $kindString:
    typ.zero = function() { return ""; };
    break;

  case $kindInt64:
  case $kindUint64:
  case $kindComplex64:
  case $kindComplex128:
    var zero = new typ(0, 0);
    typ.zero = function() { return zero; };
    break;

  case $kindPtr:
  case $kindSlice:
    typ.zero = function() { return typ.nil; };
    break;

  case $kindChan:
    typ.zero = function() { return $chanNil; };
    break;

  case $kindFunc:
    typ.zero = function() { return $throwNilPointerError; };
    break;

  case $kindInterface:
    typ.zero = function() { return $ifaceNil; };
    break;

  case $kindArray:
    typ.zero = function() {
      var arrayClass = $nativeArray(typ.elem.kind);
      if (arrayClass !== Array) {
        return new arrayClass(typ.len);
      }
      var array = new Array(typ.len);
      for (var i = 0; i < typ.len; i++) {
        array[i] = typ.elem.zero();
      }
      return array;
    };
    break;

  case $kindStruct:
    typ.zero = function() { return new typ.ptr(); };
    break;

  default:
    $panic(new $String("invalid kind: " + kind));
  }

  typ.id = $typeIDCounter;
  $typeIDCounter++;
  typ.size = size;
  typ.kind = kind;
  typ.string = string;
  typ.named = named;
  typ.pkg = pkg;
  typ.exported = exported;
  typ.methods = [];
  typ.methodSetCache = null;
  typ.comparable = true;
  return typ;
};

var $methodSet = function(typ) {
  if (typ.methodSetCache !== null) {
    return typ.methodSetCache;
  }
  var base = {};

  var isPtr = (typ.kind === $kindPtr);
  if (isPtr && typ.elem.kind === $kindInterface) {
    typ.methodSetCache = [];
    return [];
  }

  var current = [{typ: isPtr ? typ.elem : typ, indirect: isPtr}];

  var seen = {};

  while (current.length > 0) {
    var next = [];
    var mset = [];

    current.forEach(function(e) {
      if (seen[e.typ.string]) {
        return;
      }
      seen[e.typ.string] = true;

      if (e.typ.named) {
        mset = mset.concat(e.typ.methods);
        if (e.indirect) {
          mset = mset.concat($ptrType(e.typ).methods);
        }
      }

      switch (e.typ.kind) {
      case $kindStruct:
        e.typ.fields.forEach(function(f) {
          if (f.embedded) {
            var fTyp = f.typ;
            var fIsPtr = (fTyp.kind === $kindPtr);
            next.push({typ: fIsPtr ? fTyp.elem : fTyp, indirect: e.indirect || fIsPtr});
          }
        });
        break;

      case $kindInterface:
        mset = mset.concat(e.typ.methods);
        break;
      }
    });

    mset.forEach(function(m) {
      if (base[m.name] === undefined) {
        base[m.name] = m;
      }
    });

    current = next;
  }

  typ.methodSetCache = [];
  Object.keys(base).sort().forEach(function(name) {
    typ.methodSetCache.push(base[name]);
  });
  return typ.methodSetCache;
};

var $Bool          = $newType( 1, $kindBool,          "bool",           true, "", false, null);
var $Int           = $newType( 4, $kindInt,           "int",            true, "", false, null);
var $Int8          = $newType( 1, $kindInt8,          "int8",           true, "", false, null);
var $Int16         = $newType( 2, $kindInt16,         "int16",          true, "", false, null);
var $Int32         = $newType( 4, $kindInt32,         "int32",          true, "", false, null);
var $Int64         = $newType( 8, $kindInt64,         "int64",          true, "", false, null);
var $Uint          = $newType( 4, $kindUint,          "uint",           true, "", false, null);
var $Uint8         = $newType( 1, $kindUint8,         "uint8",          true, "", false, null);
var $Uint16        = $newType( 2, $kindUint16,        "uint16",         true, "", false, null);
var $Uint32        = $newType( 4, $kindUint32,        "uint32",         true, "", false, null);
var $Uint64        = $newType( 8, $kindUint64,        "uint64",         true, "", false, null);
var $Uintptr       = $newType( 4, $kindUintptr,       "uintptr",        true, "", false, null);
var $Float32       = $newType( 4, $kindFloat32,       "float32",        true, "", false, null);
var $Float64       = $newType( 8, $kindFloat64,       "float64",        true, "", false, null);
var $Complex64     = $newType( 8, $kindComplex64,     "complex64",      true, "", false, null);
var $Complex128    = $newType(16, $kindComplex128,    "complex128",     true, "", false, null);
var $String        = $newType( 8, $kindString,        "string",         true, "", false, null);
var $UnsafePointer = $newType( 4, $kindUnsafePointer, "unsafe.Pointer", true, "", false, null);

var $nativeArray = function(elemKind) {
  switch (elemKind) {
  case $kindInt:
    return Int32Array;
  case $kindInt8:
    return Int8Array;
  case $kindInt16:
    return Int16Array;
  case $kindInt32:
    return Int32Array;
  case $kindUint:
    return Uint32Array;
  case $kindUint8:
    return Uint8Array;
  case $kindUint16:
    return Uint16Array;
  case $kindUint32:
    return Uint32Array;
  case $kindUintptr:
    return Uint32Array;
  case $kindFloat32:
    return Float32Array;
  case $kindFloat64:
    return Float64Array;
  default:
    return Array;
  }
};
var $toNativeArray = function(elemKind, array) {
  var nativeArray = $nativeArray(elemKind);
  if (nativeArray === Array) {
    return array;
  }
  return new nativeArray(array);
};
var $arrayTypes = {};
var $arrayType = function(elem, len) {
  var typeKey = elem.id + "$" + len;
  var typ = $arrayTypes[typeKey];
  if (typ === undefined) {
    typ = $newType(12, $kindArray, "[" + len + "]" + elem.string, false, "", false, null);
    $arrayTypes[typeKey] = typ;
    typ.init(elem, len);
  }
  return typ;
};

var $chanType = function(elem, sendOnly, recvOnly) {
  var string = (recvOnly ? "<-" : "") + "chan" + (sendOnly ? "<- " : " ");
  if (!sendOnly && !recvOnly && (elem.string[0] == "<")) {
    string += "(" + elem.string + ")";
  } else {
    string += elem.string;
  }
  var field = sendOnly ? "SendChan" : (recvOnly ? "RecvChan" : "Chan");
  var typ = elem[field];
  if (typ === undefined) {
    typ = $newType(4, $kindChan, string, false, "", false, null);
    elem[field] = typ;
    typ.init(elem, sendOnly, recvOnly);
  }
  return typ;
};
var $Chan = function(elem, capacity) {
  if (capacity < 0 || capacity > 2147483647) {
    $throwRuntimeError("makechan: size out of range");
  }
  this.$elem = elem;
  this.$capacity = capacity;
  this.$buffer = [];
  this.$sendQueue = [];
  this.$recvQueue = [];
  this.$closed = false;
};
var $chanNil = new $Chan(null, 0);
$chanNil.$sendQueue = $chanNil.$recvQueue = { length: 0, push: function() {}, shift: function() { return undefined; }, indexOf: function() { return -1; } };

var $funcTypes = {};
var $funcType = function(params, results, variadic) {
  var typeKey = $mapArray(params, function(p) { return p.id; }).join(",") + "$" + $mapArray(results, function(r) { return r.id; }).join(",") + "$" + variadic;
  var typ = $funcTypes[typeKey];
  if (typ === undefined) {
    var paramTypes = $mapArray(params, function(p) { return p.string; });
    if (variadic) {
      paramTypes[paramTypes.length - 1] = "..." + paramTypes[paramTypes.length - 1].substr(2);
    }
    var string = "func(" + paramTypes.join(", ") + ")";
    if (results.length === 1) {
      string += " " + results[0].string;
    } else if (results.length > 1) {
      string += " (" + $mapArray(results, function(r) { return r.string; }).join(", ") + ")";
    }
    typ = $newType(4, $kindFunc, string, false, "", false, null);
    $funcTypes[typeKey] = typ;
    typ.init(params, results, variadic);
  }
  return typ;
};

var $interfaceTypes = {};
var $interfaceType = function(methods) {
  var typeKey = $mapArray(methods, function(m) { return m.pkg + "," + m.name + "," + m.typ.id; }).join("$");
  var typ = $interfaceTypes[typeKey];
  if (typ === undefined) {
    var string = "interface {}";
    if (methods.length !== 0) {
      string = "interface { " + $mapArray(methods, function(m) {
        return (m.pkg !== "" ? m.pkg + "." : "") + m.name + m.typ.string.substr(4);
      }).join("; ") + " }";
    }
    typ = $newType(8, $kindInterface, string, false, "", false, null);
    $interfaceTypes[typeKey] = typ;
    typ.init(methods);
  }
  return typ;
};
var $emptyInterface = $interfaceType([]);
var $ifaceNil = {};
var $error = $newType(8, $kindInterface, "error", true, "", false, null);
$error.init([{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}]);

var $mapTypes = {};
var $mapType = function(key, elem) {
  var typeKey = key.id + "$" + elem.id;
  var typ = $mapTypes[typeKey];
  if (typ === undefined) {
    typ = $newType(4, $kindMap, "map[" + key.string + "]" + elem.string, false, "", false, null);
    $mapTypes[typeKey] = typ;
    typ.init(key, elem);
  }
  return typ;
};
var $makeMap = function(keyForFunc, entries) {
  var m = {};
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    m[keyForFunc(e.k)] = e;
  }
  return m;
};

var $ptrType = function(elem) {
  var typ = elem.ptr;
  if (typ === undefined) {
    typ = $newType(4, $kindPtr, "*" + elem.string, false, "", elem.exported, null);
    elem.ptr = typ;
    typ.init(elem);
  }
  return typ;
};

var $newDataPointer = function(data, constructor) {
  if (constructor.elem.kind === $kindStruct) {
    return data;
  }
  return new constructor(function() { return data; }, function(v) { data = v; });
};

var $indexPtr = function(array, index, constructor) {
  array.$ptr = array.$ptr || {};
  return array.$ptr[index] || (array.$ptr[index] = new constructor(function() { return array[index]; }, function(v) { array[index] = v; }));
};

var $sliceType = function(elem) {
  var typ = elem.slice;
  if (typ === undefined) {
    typ = $newType(12, $kindSlice, "[]" + elem.string, false, "", false, null);
    elem.slice = typ;
    typ.init(elem);
  }
  return typ;
};
var $makeSlice = function(typ, length, capacity) {
  capacity = capacity || length;
  if (length < 0 || length > 2147483647) {
    $throwRuntimeError("makeslice: len out of range");
  }
  if (capacity < 0 || capacity < length || capacity > 2147483647) {
    $throwRuntimeError("makeslice: cap out of range");
  }
  var array = new typ.nativeArray(capacity);
  if (typ.nativeArray === Array) {
    for (var i = 0; i < capacity; i++) {
      array[i] = typ.elem.zero();
    }
  }
  var slice = new typ(array);
  slice.$length = length;
  return slice;
};

var $structTypes = {};
var $structType = function(pkgPath, fields) {
  var typeKey = $mapArray(fields, function(f) { return f.name + "," + f.typ.id + "," + f.tag; }).join("$");
  var typ = $structTypes[typeKey];
  if (typ === undefined) {
    var string = "struct { " + $mapArray(fields, function(f) {
      var str = f.typ.string + (f.tag !== "" ? (" \"" + f.tag.replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"") : "");
      if (f.embedded) {
        return str;
      }
      return f.name + " " + str;
    }).join("; ") + " }";
    if (fields.length === 0) {
      string = "struct {}";
    }
    typ = $newType(0, $kindStruct, string, false, "", false, function() {
      this.$val = this;
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if (f.name == '_') {
          continue;
        }
        var arg = arguments[i];
        this[f.prop] = arg !== undefined ? arg : f.typ.zero();
      }
    });
    $structTypes[typeKey] = typ;
    typ.init(pkgPath, fields);
  }
  return typ;
};

var $assertType = function(value, type, returnTuple) {
  var isInterface = (type.kind === $kindInterface), ok, missingMethod = "";
  if (value === $ifaceNil) {
    ok = false;
  } else if (!isInterface) {
    ok = value.constructor === type;
  } else {
    var valueTypeString = value.constructor.string;
    ok = type.implementedBy[valueTypeString];
    if (ok === undefined) {
      ok = true;
      var valueMethodSet = $methodSet(value.constructor);
      var interfaceMethods = type.methods;
      for (var i = 0; i < interfaceMethods.length; i++) {
        var tm = interfaceMethods[i];
        var found = false;
        for (var j = 0; j < valueMethodSet.length; j++) {
          var vm = valueMethodSet[j];
          if (vm.name === tm.name && vm.pkg === tm.pkg && vm.typ === tm.typ) {
            found = true;
            break;
          }
        }
        if (!found) {
          ok = false;
          type.missingMethodFor[valueTypeString] = tm.name;
          break;
        }
      }
      type.implementedBy[valueTypeString] = ok;
    }
    if (!ok) {
      missingMethod = type.missingMethodFor[valueTypeString];
    }
  }

  if (!ok) {
    if (returnTuple) {
      return [type.zero(), false];
    }
    $panic(new $packages["runtime"].TypeAssertionError.ptr(
      $packages["runtime"]._type.ptr.nil,
      (value === $ifaceNil ? $packages["runtime"]._type.ptr.nil : new $packages["runtime"]._type.ptr(value.constructor.string)),
      new $packages["runtime"]._type.ptr(type.string),
      missingMethod));
  }

  if (!isInterface) {
    value = value.$val;
  }
  if (type === $jsObjectPtr) {
    value = value.object;
  }
  return returnTuple ? [value, true] : value;
};

var $stackDepthOffset = 0;
var $getStackDepth = function() {
  var err = new Error();
  if (err.stack === undefined) {
    return undefined;
  }
  return $stackDepthOffset + err.stack.split("\n").length;
};

var $panicStackDepth = null, $panicValue;
var $callDeferred = function(deferred, jsErr, fromPanic) {
  if (!fromPanic && deferred !== null && deferred.index >= $curGoroutine.deferStack.length) {
    throw jsErr;
  }
  if (jsErr !== null) {
    var newErr = null;
    try {
      $curGoroutine.deferStack.push(deferred);
      $panic(new $jsErrorPtr(jsErr));
    } catch (err) {
      newErr = err;
    }
    $curGoroutine.deferStack.pop();
    $callDeferred(deferred, newErr);
    return;
  }
  if ($curGoroutine.asleep) {
    return;
  }

  $stackDepthOffset--;
  var outerPanicStackDepth = $panicStackDepth;
  var outerPanicValue = $panicValue;

  var localPanicValue = $curGoroutine.panicStack.pop();
  if (localPanicValue !== undefined) {
    $panicStackDepth = $getStackDepth();
    $panicValue = localPanicValue;
  }

  try {
    while (true) {
      if (deferred === null) {
        deferred = $curGoroutine.deferStack[$curGoroutine.deferStack.length - 1];
        if (deferred === undefined) {
          /* The panic reached the top of the stack. Clear it and throw it as a JavaScript error. */
          $panicStackDepth = null;
          if (localPanicValue.Object instanceof Error) {
            throw localPanicValue.Object;
          }
          var msg;
          if (localPanicValue.constructor === $String) {
            msg = localPanicValue.$val;
          } else if (localPanicValue.Error !== undefined) {
            msg = localPanicValue.Error();
          } else if (localPanicValue.String !== undefined) {
            msg = localPanicValue.String();
          } else {
            msg = localPanicValue;
          }
          throw new Error(msg);
        }
      }
      var call = deferred.pop();
      if (call === undefined) {
        $curGoroutine.deferStack.pop();
        if (localPanicValue !== undefined) {
          deferred = null;
          continue;
        }
        return;
      }
      var r = call[0].apply(call[2], call[1]);
      if (r && r.$blk !== undefined) {
        deferred.push([r.$blk, [], r]);
        if (fromPanic) {
          throw null;
        }
        return;
      }

      if (localPanicValue !== undefined && $panicStackDepth === null) {
        /* error was recovered */
        if (fromPanic) {
          throw null;
        }
        return;
      }
    }
  } finally {
    if (localPanicValue !== undefined) {
      if ($panicStackDepth !== null) {
        $curGoroutine.panicStack.push(localPanicValue);
      }
      $panicStackDepth = outerPanicStackDepth;
      $panicValue = outerPanicValue;
    }
    $stackDepthOffset++;
  }
};

var $panic = function(value) {
  $curGoroutine.panicStack.push(value);
  $callDeferred(null, null, true);
};
var $recover = function() {
  if ($panicStackDepth === null || ($panicStackDepth !== undefined && $panicStackDepth !== $getStackDepth() - 2)) {
    return $ifaceNil;
  }
  $panicStackDepth = null;
  return $panicValue;
};
var $throw = function(err) { throw err; };

var $noGoroutine = { asleep: false, exit: false, deferStack: [], panicStack: [] };
var $curGoroutine = $noGoroutine, $totalGoroutines = 0, $awakeGoroutines = 0, $checkForDeadlock = true;
var $mainFinished = false;
var $go = function(fun, args) {
  $totalGoroutines++;
  $awakeGoroutines++;
  var $goroutine = function() {
    try {
      $curGoroutine = $goroutine;
      var r = fun.apply(undefined, args);
      if (r && r.$blk !== undefined) {
        fun = function() { return r.$blk(); };
        args = [];
        return;
      }
      $goroutine.exit = true;
    } catch (err) {
      if (!$goroutine.exit) {
        throw err;
      }
    } finally {
      $curGoroutine = $noGoroutine;
      if ($goroutine.exit) { /* also set by runtime.Goexit() */
        $totalGoroutines--;
        $goroutine.asleep = true;
      }
      if ($goroutine.asleep) {
        $awakeGoroutines--;
        if (!$mainFinished && $awakeGoroutines === 0 && $checkForDeadlock) {
          console.error("fatal error: all goroutines are asleep - deadlock!");
          if ($global.process !== undefined) {
            $global.process.exit(2);
          }
        }
      }
    }
  };
  $goroutine.asleep = false;
  $goroutine.exit = false;
  $goroutine.deferStack = [];
  $goroutine.panicStack = [];
  $schedule($goroutine);
};

var $scheduled = [];
var $runScheduled = function() {
  try {
    var r;
    while ((r = $scheduled.shift()) !== undefined) {
      r();
    }
  } finally {
    if ($scheduled.length > 0) {
      setTimeout($runScheduled, 0);
    }
  }
};

var $schedule = function(goroutine) {
  if (goroutine.asleep) {
    goroutine.asleep = false;
    $awakeGoroutines++;
  }
  $scheduled.push(goroutine);
  if ($curGoroutine === $noGoroutine) {
    $runScheduled();
  }
};

var $setTimeout = function(f, t) {
  $awakeGoroutines++;
  return setTimeout(function() {
    $awakeGoroutines--;
    f();
  }, t);
};

var $block = function() {
  if ($curGoroutine === $noGoroutine) {
    $throwRuntimeError("cannot block in JavaScript callback, fix by wrapping code in goroutine");
  }
  $curGoroutine.asleep = true;
};

var $send = function(chan, value) {
  if (chan.$closed) {
    $throwRuntimeError("send on closed channel");
  }
  var queuedRecv = chan.$recvQueue.shift();
  if (queuedRecv !== undefined) {
    queuedRecv([value, true]);
    return;
  }
  if (chan.$buffer.length < chan.$capacity) {
    chan.$buffer.push(value);
    return;
  }

  var thisGoroutine = $curGoroutine;
  var closedDuringSend;
  chan.$sendQueue.push(function(closed) {
    closedDuringSend = closed;
    $schedule(thisGoroutine);
    return value;
  });
  $block();
  return {
    $blk: function() {
      if (closedDuringSend) {
        $throwRuntimeError("send on closed channel");
      }
    }
  };
};
var $recv = function(chan) {
  var queuedSend = chan.$sendQueue.shift();
  if (queuedSend !== undefined) {
    chan.$buffer.push(queuedSend(false));
  }
  var bufferedValue = chan.$buffer.shift();
  if (bufferedValue !== undefined) {
    return [bufferedValue, true];
  }
  if (chan.$closed) {
    return [chan.$elem.zero(), false];
  }

  var thisGoroutine = $curGoroutine;
  var f = { $blk: function() { return this.value; } };
  var queueEntry = function(v) {
    f.value = v;
    $schedule(thisGoroutine);
  };
  chan.$recvQueue.push(queueEntry);
  $block();
  return f;
};
var $close = function(chan) {
  if (chan.$closed) {
    $throwRuntimeError("close of closed channel");
  }
  chan.$closed = true;
  while (true) {
    var queuedSend = chan.$sendQueue.shift();
    if (queuedSend === undefined) {
      break;
    }
    queuedSend(true); /* will panic */
  }
  while (true) {
    var queuedRecv = chan.$recvQueue.shift();
    if (queuedRecv === undefined) {
      break;
    }
    queuedRecv([chan.$elem.zero(), false]);
  }
};
var $select = function(comms) {
  var ready = [];
  var selection = -1;
  for (var i = 0; i < comms.length; i++) {
    var comm = comms[i];
    var chan = comm[0];
    switch (comm.length) {
    case 0: /* default */
      selection = i;
      break;
    case 1: /* recv */
      if (chan.$sendQueue.length !== 0 || chan.$buffer.length !== 0 || chan.$closed) {
        ready.push(i);
      }
      break;
    case 2: /* send */
      if (chan.$closed) {
        $throwRuntimeError("send on closed channel");
      }
      if (chan.$recvQueue.length !== 0 || chan.$buffer.length < chan.$capacity) {
        ready.push(i);
      }
      break;
    }
  }

  if (ready.length !== 0) {
    selection = ready[Math.floor(Math.random() * ready.length)];
  }
  if (selection !== -1) {
    var comm = comms[selection];
    switch (comm.length) {
    case 0: /* default */
      return [selection];
    case 1: /* recv */
      return [selection, $recv(comm[0])];
    case 2: /* send */
      $send(comm[0], comm[1]);
      return [selection];
    }
  }

  var entries = [];
  var thisGoroutine = $curGoroutine;
  var f = { $blk: function() { return this.selection; } };
  var removeFromQueues = function() {
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var queue = entry[0];
      var index = queue.indexOf(entry[1]);
      if (index !== -1) {
        queue.splice(index, 1);
      }
    }
  };
  for (var i = 0; i < comms.length; i++) {
    (function(i) {
      var comm = comms[i];
      switch (comm.length) {
      case 1: /* recv */
        var queueEntry = function(value) {
          f.selection = [i, value];
          removeFromQueues();
          $schedule(thisGoroutine);
        };
        entries.push([comm[0].$recvQueue, queueEntry]);
        comm[0].$recvQueue.push(queueEntry);
        break;
      case 2: /* send */
        var queueEntry = function() {
          if (comm[0].$closed) {
            $throwRuntimeError("send on closed channel");
          }
          f.selection = [i];
          removeFromQueues();
          $schedule(thisGoroutine);
          return comm[1];
        };
        entries.push([comm[0].$sendQueue, queueEntry]);
        comm[0].$sendQueue.push(queueEntry);
        break;
      }
    })(i);
  }
  $block();
  return f;
};

var $jsObjectPtr, $jsErrorPtr;

var $needsExternalization = function(t) {
  switch (t.kind) {
    case $kindBool:
    case $kindInt:
    case $kindInt8:
    case $kindInt16:
    case $kindInt32:
    case $kindUint:
    case $kindUint8:
    case $kindUint16:
    case $kindUint32:
    case $kindUintptr:
    case $kindFloat32:
    case $kindFloat64:
      return false;
    default:
      return t !== $jsObjectPtr;
  }
};

var $externalize = function(v, t) {
  if (t === $jsObjectPtr) {
    return v;
  }
  switch (t.kind) {
  case $kindBool:
  case $kindInt:
  case $kindInt8:
  case $kindInt16:
  case $kindInt32:
  case $kindUint:
  case $kindUint8:
  case $kindUint16:
  case $kindUint32:
  case $kindUintptr:
  case $kindFloat32:
  case $kindFloat64:
    return v;
  case $kindInt64:
  case $kindUint64:
    return $flatten64(v);
  case $kindArray:
    if ($needsExternalization(t.elem)) {
      return $mapArray(v, function(e) { return $externalize(e, t.elem); });
    }
    return v;
  case $kindFunc:
    return $externalizeFunction(v, t, false);
  case $kindInterface:
    if (v === $ifaceNil) {
      return null;
    }
    if (v.constructor === $jsObjectPtr) {
      return v.$val.object;
    }
    return $externalize(v.$val, v.constructor);
  case $kindMap:
    var m = {};
    var keys = $keys(v);
    for (var i = 0; i < keys.length; i++) {
      var entry = v[keys[i]];
      m[$externalize(entry.k, t.key)] = $externalize(entry.v, t.elem);
    }
    return m;
  case $kindPtr:
    if (v === t.nil) {
      return null;
    }
    return $externalize(v.$get(), t.elem);
  case $kindSlice:
    if ($needsExternalization(t.elem)) {
      return $mapArray($sliceToArray(v), function(e) { return $externalize(e, t.elem); });
    }
    return $sliceToArray(v);
  case $kindString:
    if ($isASCII(v)) {
      return v;
    }
    var s = "", r;
    for (var i = 0; i < v.length; i += r[1]) {
      r = $decodeRune(v, i);
      var c = r[0];
      if (c > 0xFFFF) {
        var h = Math.floor((c - 0x10000) / 0x400) + 0xD800;
        var l = (c - 0x10000) % 0x400 + 0xDC00;
        s += String.fromCharCode(h, l);
        continue;
      }
      s += String.fromCharCode(c);
    }
    return s;
  case $kindStruct:
    var timePkg = $packages["time"];
    if (timePkg !== undefined && v.constructor === timePkg.Time.ptr) {
      var milli = $div64(v.UnixNano(), new $Int64(0, 1000000));
      return new Date($flatten64(milli));
    }

    var noJsObject = {};
    var searchJsObject = function(v, t) {
      if (t === $jsObjectPtr) {
        return v;
      }
      switch (t.kind) {
      case $kindPtr:
        if (v === t.nil) {
          return noJsObject;
        }
        return searchJsObject(v.$get(), t.elem);
      case $kindStruct:
        var f = t.fields[0];
        return searchJsObject(v[f.prop], f.typ);
      case $kindInterface:
        return searchJsObject(v.$val, v.constructor);
      default:
        return noJsObject;
      }
    };
    var o = searchJsObject(v, t);
    if (o !== noJsObject) {
      return o;
    }

    o = {};
    for (var i = 0; i < t.fields.length; i++) {
      var f = t.fields[i];
      if (!f.exported) {
        continue;
      }
      o[f.name] = $externalize(v[f.prop], f.typ);
    }
    return o;
  }
  $throwRuntimeError("cannot externalize " + t.string);
};

var $externalizeFunction = function(v, t, passThis) {
  if (v === $throwNilPointerError) {
    return null;
  }
  if (v.$externalizeWrapper === undefined) {
    $checkForDeadlock = false;
    v.$externalizeWrapper = function() {
      var args = [];
      for (var i = 0; i < t.params.length; i++) {
        if (t.variadic && i === t.params.length - 1) {
          var vt = t.params[i].elem, varargs = [];
          for (var j = i; j < arguments.length; j++) {
            varargs.push($internalize(arguments[j], vt));
          }
          args.push(new (t.params[i])(varargs));
          break;
        }
        args.push($internalize(arguments[i], t.params[i]));
      }
      var result = v.apply(passThis ? this : undefined, args);
      switch (t.results.length) {
      case 0:
        return;
      case 1:
        return $externalize(result, t.results[0]);
      default:
        for (var i = 0; i < t.results.length; i++) {
          result[i] = $externalize(result[i], t.results[i]);
        }
        return result;
      }
    };
  }
  return v.$externalizeWrapper;
};

var $internalize = function(v, t, recv) {
  if (t === $jsObjectPtr) {
    return v;
  }
  if (t === $jsObjectPtr.elem) {
    $throwRuntimeError("cannot internalize js.Object, use *js.Object instead");
  }
  if (v && v.__internal_object__ !== undefined) {
    return $assertType(v.__internal_object__, t, false);
  }
  var timePkg = $packages["time"];
  if (timePkg !== undefined && t === timePkg.Time) {
    if (!(v !== null && v !== undefined && v.constructor === Date)) {
      $throwRuntimeError("cannot internalize time.Time from " + typeof v + ", must be Date");
    }
    return timePkg.Unix(new $Int64(0, 0), new $Int64(0, v.getTime() * 1000000));
  }
  switch (t.kind) {
  case $kindBool:
    return !!v;
  case $kindInt:
    return parseInt(v);
  case $kindInt8:
    return parseInt(v) << 24 >> 24;
  case $kindInt16:
    return parseInt(v) << 16 >> 16;
  case $kindInt32:
    return parseInt(v) >> 0;
  case $kindUint:
    return parseInt(v);
  case $kindUint8:
    return parseInt(v) << 24 >>> 24;
  case $kindUint16:
    return parseInt(v) << 16 >>> 16;
  case $kindUint32:
  case $kindUintptr:
    return parseInt(v) >>> 0;
  case $kindInt64:
  case $kindUint64:
    return new t(0, v);
  case $kindFloat32:
  case $kindFloat64:
    return parseFloat(v);
  case $kindArray:
    if (v.length !== t.len) {
      $throwRuntimeError("got array with wrong size from JavaScript native");
    }
    return $mapArray(v, function(e) { return $internalize(e, t.elem); });
  case $kindFunc:
    return function() {
      var args = [];
      for (var i = 0; i < t.params.length; i++) {
        if (t.variadic && i === t.params.length - 1) {
          var vt = t.params[i].elem, varargs = arguments[i];
          for (var j = 0; j < varargs.$length; j++) {
            args.push($externalize(varargs.$array[varargs.$offset + j], vt));
          }
          break;
        }
        args.push($externalize(arguments[i], t.params[i]));
      }
      var result = v.apply(recv, args);
      switch (t.results.length) {
      case 0:
        return;
      case 1:
        return $internalize(result, t.results[0]);
      default:
        for (var i = 0; i < t.results.length; i++) {
          result[i] = $internalize(result[i], t.results[i]);
        }
        return result;
      }
    };
  case $kindInterface:
    if (t.methods.length !== 0) {
      $throwRuntimeError("cannot internalize " + t.string);
    }
    if (v === null) {
      return $ifaceNil;
    }
    if (v === undefined) {
      return new $jsObjectPtr(undefined);
    }
    switch (v.constructor) {
    case Int8Array:
      return new ($sliceType($Int8))(v);
    case Int16Array:
      return new ($sliceType($Int16))(v);
    case Int32Array:
      return new ($sliceType($Int))(v);
    case Uint8Array:
      return new ($sliceType($Uint8))(v);
    case Uint16Array:
      return new ($sliceType($Uint16))(v);
    case Uint32Array:
      return new ($sliceType($Uint))(v);
    case Float32Array:
      return new ($sliceType($Float32))(v);
    case Float64Array:
      return new ($sliceType($Float64))(v);
    case Array:
      return $internalize(v, $sliceType($emptyInterface));
    case Boolean:
      return new $Bool(!!v);
    case Date:
      if (timePkg === undefined) {
        /* time package is not present, internalize as &js.Object{Date} so it can be externalized into original Date. */
        return new $jsObjectPtr(v);
      }
      return new timePkg.Time($internalize(v, timePkg.Time));
    case Function:
      var funcType = $funcType([$sliceType($emptyInterface)], [$jsObjectPtr], true);
      return new funcType($internalize(v, funcType));
    case Number:
      return new $Float64(parseFloat(v));
    case String:
      return new $String($internalize(v, $String));
    default:
      if ($global.Node && v instanceof $global.Node) {
        return new $jsObjectPtr(v);
      }
      var mapType = $mapType($String, $emptyInterface);
      return new mapType($internalize(v, mapType));
    }
  case $kindMap:
    var m = {};
    var keys = $keys(v);
    for (var i = 0; i < keys.length; i++) {
      var k = $internalize(keys[i], t.key);
      m[t.key.keyFor(k)] = { k: k, v: $internalize(v[keys[i]], t.elem) };
    }
    return m;
  case $kindPtr:
    if (t.elem.kind === $kindStruct) {
      return $internalize(v, t.elem);
    }
  case $kindSlice:
    return new t($mapArray(v, function(e) { return $internalize(e, t.elem); }));
  case $kindString:
    v = String(v);
    if ($isASCII(v)) {
      return v;
    }
    var s = "";
    var i = 0;
    while (i < v.length) {
      var h = v.charCodeAt(i);
      if (0xD800 <= h && h <= 0xDBFF) {
        var l = v.charCodeAt(i + 1);
        var c = (h - 0xD800) * 0x400 + l - 0xDC00 + 0x10000;
        s += $encodeRune(c);
        i += 2;
        continue;
      }
      s += $encodeRune(h);
      i++;
    }
    return s;
  case $kindStruct:
    var noJsObject = {};
    var searchJsObject = function(t) {
      if (t === $jsObjectPtr) {
        return v;
      }
      if (t === $jsObjectPtr.elem) {
        $throwRuntimeError("cannot internalize js.Object, use *js.Object instead");
      }
      switch (t.kind) {
      case $kindPtr:
        return searchJsObject(t.elem);
      case $kindStruct:
        var f = t.fields[0];
        var o = searchJsObject(f.typ);
        if (o !== noJsObject) {
          var n = new t.ptr();
          n[f.prop] = o;
          return n;
        }
        return noJsObject;
      default:
        return noJsObject;
      }
    };
    var o = searchJsObject(t);
    if (o !== noJsObject) {
      return o;
    }
  }
  $throwRuntimeError("cannot internalize " + t.string);
};

/* $isASCII reports whether string s contains only ASCII characters. */
var $isASCII = function(s) {
  for (var i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) >= 128) {
      return false;
    }
  }
  return true;
};

$packages["github.com/gopherjs/gopherjs/js"] = (function() {
	var $pkg = {}, $init, Object, Error, sliceType, ptrType, ptrType$1, MakeFunc, init;
	Object = $pkg.Object = $newType(0, $kindStruct, "js.Object", true, "github.com/gopherjs/gopherjs/js", true, function(object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.object = null;
			return;
		}
		this.object = object_;
	});
	Error = $pkg.Error = $newType(0, $kindStruct, "js.Error", true, "github.com/gopherjs/gopherjs/js", true, function(Object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Object = null;
			return;
		}
		this.Object = Object_;
	});
	sliceType = $sliceType($emptyInterface);
	ptrType = $ptrType(Object);
	ptrType$1 = $ptrType(Error);
	Object.ptr.prototype.Get = function(key) {
		var key, o;
		o = this;
		return o.object[$externalize(key, $String)];
	};
	Object.prototype.Get = function(key) { return this.$val.Get(key); };
	Object.ptr.prototype.Set = function(key, value) {
		var key, o, value;
		o = this;
		o.object[$externalize(key, $String)] = $externalize(value, $emptyInterface);
	};
	Object.prototype.Set = function(key, value) { return this.$val.Set(key, value); };
	Object.ptr.prototype.Delete = function(key) {
		var key, o;
		o = this;
		delete o.object[$externalize(key, $String)];
	};
	Object.prototype.Delete = function(key) { return this.$val.Delete(key); };
	Object.ptr.prototype.Length = function() {
		var o;
		o = this;
		return $parseInt(o.object.length);
	};
	Object.prototype.Length = function() { return this.$val.Length(); };
	Object.ptr.prototype.Index = function(i) {
		var i, o;
		o = this;
		return o.object[i];
	};
	Object.prototype.Index = function(i) { return this.$val.Index(i); };
	Object.ptr.prototype.SetIndex = function(i, value) {
		var i, o, value;
		o = this;
		o.object[i] = $externalize(value, $emptyInterface);
	};
	Object.prototype.SetIndex = function(i, value) { return this.$val.SetIndex(i, value); };
	Object.ptr.prototype.Call = function(name, args) {
		var args, name, o, obj;
		o = this;
		return (obj = o.object, obj[$externalize(name, $String)].apply(obj, $externalize(args, sliceType)));
	};
	Object.prototype.Call = function(name, args) { return this.$val.Call(name, args); };
	Object.ptr.prototype.Invoke = function(args) {
		var args, o;
		o = this;
		return o.object.apply(undefined, $externalize(args, sliceType));
	};
	Object.prototype.Invoke = function(args) { return this.$val.Invoke(args); };
	Object.ptr.prototype.New = function(args) {
		var args, o;
		o = this;
		return new ($global.Function.prototype.bind.apply(o.object, [undefined].concat($externalize(args, sliceType))));
	};
	Object.prototype.New = function(args) { return this.$val.New(args); };
	Object.ptr.prototype.Bool = function() {
		var o;
		o = this;
		return !!(o.object);
	};
	Object.prototype.Bool = function() { return this.$val.Bool(); };
	Object.ptr.prototype.String = function() {
		var o;
		o = this;
		return $internalize(o.object, $String);
	};
	Object.prototype.String = function() { return this.$val.String(); };
	Object.ptr.prototype.Int = function() {
		var o;
		o = this;
		return $parseInt(o.object) >> 0;
	};
	Object.prototype.Int = function() { return this.$val.Int(); };
	Object.ptr.prototype.Int64 = function() {
		var o;
		o = this;
		return $internalize(o.object, $Int64);
	};
	Object.prototype.Int64 = function() { return this.$val.Int64(); };
	Object.ptr.prototype.Uint64 = function() {
		var o;
		o = this;
		return $internalize(o.object, $Uint64);
	};
	Object.prototype.Uint64 = function() { return this.$val.Uint64(); };
	Object.ptr.prototype.Float = function() {
		var o;
		o = this;
		return $parseFloat(o.object);
	};
	Object.prototype.Float = function() { return this.$val.Float(); };
	Object.ptr.prototype.Interface = function() {
		var o;
		o = this;
		return $internalize(o.object, $emptyInterface);
	};
	Object.prototype.Interface = function() { return this.$val.Interface(); };
	Object.ptr.prototype.Unsafe = function() {
		var o;
		o = this;
		return o.object;
	};
	Object.prototype.Unsafe = function() { return this.$val.Unsafe(); };
	Error.ptr.prototype.Error = function() {
		var err;
		err = this;
		return "JavaScript error: " + $internalize(err.Object.message, $String);
	};
	Error.prototype.Error = function() { return this.$val.Error(); };
	Error.ptr.prototype.Stack = function() {
		var err;
		err = this;
		return $internalize(err.Object.stack, $String);
	};
	Error.prototype.Stack = function() { return this.$val.Stack(); };
	MakeFunc = function(fn) {
		var fn;
		return $makeFunc(fn);
	};
	$pkg.MakeFunc = MakeFunc;
	init = function() {
		var e;
		e = new Error.ptr(null);
		$unused(e);
	};
	ptrType.methods = [{prop: "Get", name: "Get", pkg: "", typ: $funcType([$String], [ptrType], false)}, {prop: "Set", name: "Set", pkg: "", typ: $funcType([$String, $emptyInterface], [], false)}, {prop: "Delete", name: "Delete", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Length", name: "Length", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Index", name: "Index", pkg: "", typ: $funcType([$Int], [ptrType], false)}, {prop: "SetIndex", name: "SetIndex", pkg: "", typ: $funcType([$Int, $emptyInterface], [], false)}, {prop: "Call", name: "Call", pkg: "", typ: $funcType([$String, sliceType], [ptrType], true)}, {prop: "Invoke", name: "Invoke", pkg: "", typ: $funcType([sliceType], [ptrType], true)}, {prop: "New", name: "New", pkg: "", typ: $funcType([sliceType], [ptrType], true)}, {prop: "Bool", name: "Bool", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Int", name: "Int", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Int64", name: "Int64", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "Uint64", name: "Uint64", pkg: "", typ: $funcType([], [$Uint64], false)}, {prop: "Float", name: "Float", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Interface", name: "Interface", pkg: "", typ: $funcType([], [$emptyInterface], false)}, {prop: "Unsafe", name: "Unsafe", pkg: "", typ: $funcType([], [$Uintptr], false)}];
	ptrType$1.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Stack", name: "Stack", pkg: "", typ: $funcType([], [$String], false)}];
	Object.init("github.com/gopherjs/gopherjs/js", [{prop: "object", name: "object", embedded: false, exported: false, typ: ptrType, tag: ""}]);
	Error.init("", [{prop: "Object", name: "Object", embedded: true, exported: true, typ: ptrType, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["runtime/internal/sys"] = (function() {
	var $pkg = {}, $init;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["runtime"] = (function() {
	var $pkg = {}, $init, js, sys, _type, TypeAssertionError, basicFrame, Func, errorString, ptrType, sliceType, ptrType$1, structType, sliceType$1, ptrType$2, knownPositions, positionCounters, fastrand, init, GOROOT, registerPosition, itoa, callstack, Caller, Goexit, SetFinalizer, FuncForPC, KeepAlive, throw$1, nanotime;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	sys = $packages["runtime/internal/sys"];
	_type = $pkg._type = $newType(0, $kindStruct, "runtime._type", true, "runtime", false, function(str_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.str = "";
			return;
		}
		this.str = str_;
	});
	TypeAssertionError = $pkg.TypeAssertionError = $newType(0, $kindStruct, "runtime.TypeAssertionError", true, "runtime", true, function(_interface_, concrete_, asserted_, missingMethod_) {
		this.$val = this;
		if (arguments.length === 0) {
			this._interface = ptrType$1.nil;
			this.concrete = ptrType$1.nil;
			this.asserted = ptrType$1.nil;
			this.missingMethod = "";
			return;
		}
		this._interface = _interface_;
		this.concrete = concrete_;
		this.asserted = asserted_;
		this.missingMethod = missingMethod_;
	});
	basicFrame = $pkg.basicFrame = $newType(0, $kindStruct, "runtime.basicFrame", true, "runtime", false, function(FuncName_, File_, Line_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.FuncName = "";
			this.File = "";
			this.Line = 0;
			return;
		}
		this.FuncName = FuncName_;
		this.File = File_;
		this.Line = Line_;
	});
	Func = $pkg.Func = $newType(0, $kindStruct, "runtime.Func", true, "runtime", true, function(name_, file_, line_, opaque_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.name = "";
			this.file = "";
			this.line = 0;
			this.opaque = new structType.ptr();
			return;
		}
		this.name = name_;
		this.file = file_;
		this.line = line_;
		this.opaque = opaque_;
	});
	errorString = $pkg.errorString = $newType(8, $kindString, "runtime.errorString", true, "runtime", false, null);
	ptrType = $ptrType(Func);
	sliceType = $sliceType(ptrType);
	ptrType$1 = $ptrType(_type);
	structType = $structType("", []);
	sliceType$1 = $sliceType(basicFrame);
	ptrType$2 = $ptrType(TypeAssertionError);
	fastrand = function() {
		return (($parseFloat($global.Math.random()) * 4.294967295e+09 >> 0));
	};
	$linknames["runtime.fastrand"] = fastrand;
	_type.ptr.prototype.string = function() {
		var t;
		t = this;
		return t.str;
	};
	_type.prototype.string = function() { return this.$val.string(); };
	_type.ptr.prototype.pkgpath = function() {
		var t;
		t = this;
		return "";
	};
	_type.prototype.pkgpath = function() { return this.$val.pkgpath(); };
	TypeAssertionError.ptr.prototype.RuntimeError = function() {
	};
	TypeAssertionError.prototype.RuntimeError = function() { return this.$val.RuntimeError(); };
	TypeAssertionError.ptr.prototype.Error = function() {
		var as, cs, e, inter, msg;
		e = this;
		inter = "interface";
		if (!(e._interface === ptrType$1.nil)) {
			inter = e._interface.string();
		}
		as = e.asserted.string();
		if (e.concrete === ptrType$1.nil) {
			return "interface conversion: " + inter + " is nil, not " + as;
		}
		cs = e.concrete.string();
		if (e.missingMethod === "") {
			msg = "interface conversion: " + inter + " is " + cs + ", not " + as;
			if (cs === as) {
				if (!(e.concrete.pkgpath() === e.asserted.pkgpath())) {
					msg = msg + (" (types from different packages)");
				} else {
					msg = msg + (" (types from different scopes)");
				}
			}
			return msg;
		}
		return "interface conversion: " + cs + " is not " + as + ": missing method " + e.missingMethod;
	};
	TypeAssertionError.prototype.Error = function() { return this.$val.Error(); };
	init = function() {
		var e, jsPkg;
		jsPkg = $packages[$externalize("github.com/gopherjs/gopherjs/js", $String)];
		$jsObjectPtr = jsPkg.Object.ptr;
		$jsErrorPtr = jsPkg.Error.ptr;
		$throwRuntimeError = throw$1;
		e = $ifaceNil;
		e = new TypeAssertionError.ptr(ptrType$1.nil, ptrType$1.nil, ptrType$1.nil, "");
		$unused(e);
	};
	GOROOT = function() {
		var process, v, v$1;
		process = $global.process;
		if (process === undefined) {
			return "/";
		}
		v = process.env.GOPHERJS_GOROOT;
		if (!(v === undefined) && !($internalize(v, $String) === "")) {
			return $internalize(v, $String);
		} else {
			v$1 = process.env.GOROOT;
			if (!(v$1 === undefined) && !($internalize(v$1, $String) === "")) {
				return $internalize(v$1, $String);
			}
		}
		return "/usr/local/go";
	};
	$pkg.GOROOT = GOROOT;
	registerPosition = function(funcName, file, line) {
		var _entry, _key, _tuple, f, file, found, funcName, key, line, pc, pc$1;
		key = file + ":" + itoa(line);
		_tuple = (_entry = knownPositions[$String.keyFor(key)], _entry !== undefined ? [_entry.v, true] : [0, false]);
		pc = _tuple[0];
		found = _tuple[1];
		if (found) {
			return pc;
		}
		f = new Func.ptr(funcName, file, line, new structType.ptr());
		pc$1 = ((positionCounters.$length >>> 0));
		positionCounters = $append(positionCounters, f);
		_key = key; (knownPositions || $throwRuntimeError("assignment to entry in nil map"))[$String.keyFor(_key)] = { k: _key, v: pc$1 };
		return pc$1;
	};
	itoa = function(i) {
		var i;
		return $internalize(new ($global.String)(i), $String);
	};
	callstack = function(skip, limit) {
		var frames, i, info, l, limit, lines, parts, pos, skip;
		skip = (skip + 1 >> 0) + 1 >> 0;
		lines = new ($global.Error)().stack.split($externalize("\n", $String)).slice(skip);
		frames = new sliceType$1([]);
		l = $parseInt(lines.length) >> 0;
		i = 0;
		while (true) {
			if (!(i < l && i < limit)) { break; }
			info = lines[i];
			pos = info.substring(($parseInt(info.indexOf($externalize("(", $String))) >> 0) + 1 >> 0, $parseInt(info.indexOf($externalize(")", $String))) >> 0);
			parts = pos.split($externalize(":", $String));
			frames = $append(frames, new basicFrame.ptr($internalize(info.substring(($parseInt(info.indexOf($externalize("at ", $String))) >> 0) + 3 >> 0, $parseInt(info.indexOf($externalize(" (", $String))) >> 0), $String), $internalize(parts[0], $String), $parseInt(parts[1]) >> 0));
			i = i + (1) >> 0;
		}
		return frames;
	};
	Caller = function(skip) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, file, frames, line, ok, pc, skip;
		pc = 0;
		file = "";
		line = 0;
		ok = false;
		skip = skip + 1 >> 0;
		frames = callstack(skip, 1);
		if (!((frames.$length === 1))) {
			_tmp = 0;
			_tmp$1 = "";
			_tmp$2 = 0;
			_tmp$3 = false;
			pc = _tmp;
			file = _tmp$1;
			line = _tmp$2;
			ok = _tmp$3;
			return [pc, file, line, ok];
		}
		pc = registerPosition((0 >= frames.$length ? ($throwRuntimeError("index out of range"), undefined) : frames.$array[frames.$offset + 0]).FuncName, (0 >= frames.$length ? ($throwRuntimeError("index out of range"), undefined) : frames.$array[frames.$offset + 0]).File, (0 >= frames.$length ? ($throwRuntimeError("index out of range"), undefined) : frames.$array[frames.$offset + 0]).Line);
		_tmp$4 = pc;
		_tmp$5 = (0 >= frames.$length ? ($throwRuntimeError("index out of range"), undefined) : frames.$array[frames.$offset + 0]).File;
		_tmp$6 = (0 >= frames.$length ? ($throwRuntimeError("index out of range"), undefined) : frames.$array[frames.$offset + 0]).Line;
		_tmp$7 = true;
		pc = _tmp$4;
		file = _tmp$5;
		line = _tmp$6;
		ok = _tmp$7;
		return [pc, file, line, ok];
	};
	$pkg.Caller = Caller;
	Goexit = function() {
		$curGoroutine.exit = $externalize(true, $Bool);
		$throw(null);
	};
	$pkg.Goexit = Goexit;
	SetFinalizer = function(x, f) {
		var f, x;
	};
	$pkg.SetFinalizer = SetFinalizer;
	Func.ptr.prototype.Entry = function() {
		return 0;
	};
	Func.prototype.Entry = function() { return this.$val.Entry(); };
	Func.ptr.prototype.FileLine = function(pc) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, f, file, line, pc;
		file = "";
		line = 0;
		f = this;
		if (f === ptrType.nil) {
			_tmp = "";
			_tmp$1 = 0;
			file = _tmp;
			line = _tmp$1;
			return [file, line];
		}
		_tmp$2 = f.file;
		_tmp$3 = f.line;
		file = _tmp$2;
		line = _tmp$3;
		return [file, line];
	};
	Func.prototype.FileLine = function(pc) { return this.$val.FileLine(pc); };
	Func.ptr.prototype.Name = function() {
		var f;
		f = this;
		if (f === ptrType.nil || f.name === "") {
			return "<unknown>";
		}
		return f.name;
	};
	Func.prototype.Name = function() { return this.$val.Name(); };
	FuncForPC = function(pc) {
		var ipc, pc;
		ipc = ((pc >> 0));
		if (ipc >= positionCounters.$length) {
			$panic(new $String("GopherJS: pc=" + itoa(ipc) + " is out of range of known position counters"));
		}
		return ((ipc < 0 || ipc >= positionCounters.$length) ? ($throwRuntimeError("index out of range"), undefined) : positionCounters.$array[positionCounters.$offset + ipc]);
	};
	$pkg.FuncForPC = FuncForPC;
	KeepAlive = function(param) {
		var param;
	};
	$pkg.KeepAlive = KeepAlive;
	errorString.prototype.RuntimeError = function() {
		var e;
		e = this.$val;
	};
	$ptrType(errorString).prototype.RuntimeError = function() { return new errorString(this.$get()).RuntimeError(); };
	errorString.prototype.Error = function() {
		var e;
		e = this.$val;
		return "runtime error: " + (e);
	};
	$ptrType(errorString).prototype.Error = function() { return new errorString(this.$get()).Error(); };
	throw$1 = function(s) {
		var s;
		$panic(new errorString((s)));
	};
	nanotime = function() {
		return $mul64($internalize(new ($global.Date)().getTime(), $Int64), new $Int64(0, 1000000));
	};
	$linknames["runtime.nanotime"] = nanotime;
	ptrType$1.methods = [{prop: "string", name: "string", pkg: "runtime", typ: $funcType([], [$String], false)}, {prop: "pkgpath", name: "pkgpath", pkg: "runtime", typ: $funcType([], [$String], false)}];
	ptrType$2.methods = [{prop: "RuntimeError", name: "RuntimeError", pkg: "", typ: $funcType([], [], false)}, {prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	ptrType.methods = [{prop: "Entry", name: "Entry", pkg: "", typ: $funcType([], [$Uintptr], false)}, {prop: "FileLine", name: "FileLine", pkg: "", typ: $funcType([$Uintptr], [$String, $Int], false)}, {prop: "Name", name: "Name", pkg: "", typ: $funcType([], [$String], false)}];
	errorString.methods = [{prop: "RuntimeError", name: "RuntimeError", pkg: "", typ: $funcType([], [], false)}, {prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	_type.init("runtime", [{prop: "str", name: "str", embedded: false, exported: false, typ: $String, tag: ""}]);
	TypeAssertionError.init("runtime", [{prop: "_interface", name: "_interface", embedded: false, exported: false, typ: ptrType$1, tag: ""}, {prop: "concrete", name: "concrete", embedded: false, exported: false, typ: ptrType$1, tag: ""}, {prop: "asserted", name: "asserted", embedded: false, exported: false, typ: ptrType$1, tag: ""}, {prop: "missingMethod", name: "missingMethod", embedded: false, exported: false, typ: $String, tag: ""}]);
	basicFrame.init("", [{prop: "FuncName", name: "FuncName", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "File", name: "File", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "Line", name: "Line", embedded: false, exported: true, typ: $Int, tag: ""}]);
	Func.init("runtime", [{prop: "name", name: "name", embedded: false, exported: false, typ: $String, tag: ""}, {prop: "file", name: "file", embedded: false, exported: false, typ: $String, tag: ""}, {prop: "line", name: "line", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "opaque", name: "opaque", embedded: false, exported: false, typ: structType, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = sys.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		knownPositions = $makeMap($String.keyFor, []);
		positionCounters = new sliceType([]);
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["internal/unsafeheader"] = (function() {
	var $pkg = {}, $init, Slice;
	Slice = $pkg.Slice = $newType(0, $kindStruct, "unsafeheader.Slice", true, "internal/unsafeheader", true, function(Data_, Len_, Cap_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Data = 0;
			this.Len = 0;
			this.Cap = 0;
			return;
		}
		this.Data = Data_;
		this.Len = Len_;
		this.Cap = Cap_;
	});
	Slice.init("", [{prop: "Data", name: "Data", embedded: false, exported: true, typ: $UnsafePointer, tag: ""}, {prop: "Len", name: "Len", embedded: false, exported: true, typ: $Int, tag: ""}, {prop: "Cap", name: "Cap", embedded: false, exported: true, typ: $Int, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["internal/reflectlite"] = (function() {
	var $pkg = {}, $init, js, unsafeheader, runtime, uncommonType, funcType, name, nameData, mapIter, TypeEx, errorString, Method, Type, Kind, tflag, rtype, method, chanDir, arrayType, chanType, imethod, interfaceType, mapType, ptrType, sliceType, structField, structType, nameOff, typeOff, textOff, Value, flag, ValueError, ptrType$1, sliceType$1, sliceType$2, sliceType$3, ptrType$2, funcType$1, sliceType$4, ptrType$3, sliceType$5, sliceType$6, sliceType$7, ptrType$4, ptrType$5, structType$2, sliceType$8, sliceType$9, ptrType$6, ptrType$7, sliceType$12, ptrType$8, ptrType$10, funcType$2, ptrType$11, funcType$3, ptrType$12, arrayType$2, sliceType$13, ptrType$13, initialized, uint8Type, idJsType, idReflectType, idKindType, idRtype, uncommonTypeMap, nameMap, nameOffList, typeOffList, jsObjectPtr, selectHelper, callHelper, kindNames, init, jsType, reflectType, setKindType, newName, newNameOff, newTypeOff, internalStr, isWrapped, copyStruct, makeValue, TypeOf, ValueOf, FuncOf, SliceOf, unsafe_New, typedmemmove, keyFor, mapaccess, mapiterinit, mapiterkey, mapiternext, maplen, methodReceiver, valueInterface, ifaceE2I, methodName, makeMethodValue, wrapJsObject, unwrapJsObject, getJsTag, PtrTo, copyVal, unquote, implements$1, directlyAssignable, haveIdenticalType, haveIdenticalUnderlyingType, toType, ifaceIndir;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	unsafeheader = $packages["internal/unsafeheader"];
	runtime = $packages["runtime"];
	uncommonType = $pkg.uncommonType = $newType(0, $kindStruct, "reflectlite.uncommonType", true, "internal/reflectlite", false, function(pkgPath_, mcount_, xcount_, moff_, _methods_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.pkgPath = 0;
			this.mcount = 0;
			this.xcount = 0;
			this.moff = 0;
			this._methods = sliceType$5.nil;
			return;
		}
		this.pkgPath = pkgPath_;
		this.mcount = mcount_;
		this.xcount = xcount_;
		this.moff = moff_;
		this._methods = _methods_;
	});
	funcType = $pkg.funcType = $newType(0, $kindStruct, "reflectlite.funcType", true, "internal/reflectlite", false, function(rtype_, inCount_, outCount_, _in_, _out_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.rtype = new rtype.ptr(0, 0, 0, 0, 0, 0, 0, $throwNilPointerError, ptrType$3.nil, 0, 0);
			this.inCount = 0;
			this.outCount = 0;
			this._in = sliceType$2.nil;
			this._out = sliceType$2.nil;
			return;
		}
		this.rtype = rtype_;
		this.inCount = inCount_;
		this.outCount = outCount_;
		this._in = _in_;
		this._out = _out_;
	});
	name = $pkg.name = $newType(0, $kindStruct, "reflectlite.name", true, "internal/reflectlite", false, function(bytes_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.bytes = ptrType$3.nil;
			return;
		}
		this.bytes = bytes_;
	});
	nameData = $pkg.nameData = $newType(0, $kindStruct, "reflectlite.nameData", true, "internal/reflectlite", false, function(name_, tag_, exported_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.name = "";
			this.tag = "";
			this.exported = false;
			return;
		}
		this.name = name_;
		this.tag = tag_;
		this.exported = exported_;
	});
	mapIter = $pkg.mapIter = $newType(0, $kindStruct, "reflectlite.mapIter", true, "internal/reflectlite", false, function(t_, m_, keys_, i_, last_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.t = $ifaceNil;
			this.m = null;
			this.keys = null;
			this.i = 0;
			this.last = null;
			return;
		}
		this.t = t_;
		this.m = m_;
		this.keys = keys_;
		this.i = i_;
		this.last = last_;
	});
	TypeEx = $pkg.TypeEx = $newType(8, $kindInterface, "reflectlite.TypeEx", true, "internal/reflectlite", true, null);
	errorString = $pkg.errorString = $newType(0, $kindStruct, "reflectlite.errorString", true, "internal/reflectlite", false, function(s_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.s = "";
			return;
		}
		this.s = s_;
	});
	Method = $pkg.Method = $newType(0, $kindStruct, "reflectlite.Method", true, "internal/reflectlite", true, function(Name_, PkgPath_, Type_, Func_, Index_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Name = "";
			this.PkgPath = "";
			this.Type = $ifaceNil;
			this.Func = new Value.ptr(ptrType$1.nil, 0, 0);
			this.Index = 0;
			return;
		}
		this.Name = Name_;
		this.PkgPath = PkgPath_;
		this.Type = Type_;
		this.Func = Func_;
		this.Index = Index_;
	});
	Type = $pkg.Type = $newType(8, $kindInterface, "reflectlite.Type", true, "internal/reflectlite", true, null);
	Kind = $pkg.Kind = $newType(4, $kindUint, "reflectlite.Kind", true, "internal/reflectlite", true, null);
	tflag = $pkg.tflag = $newType(1, $kindUint8, "reflectlite.tflag", true, "internal/reflectlite", false, null);
	rtype = $pkg.rtype = $newType(0, $kindStruct, "reflectlite.rtype", true, "internal/reflectlite", false, function(size_, ptrdata_, hash_, tflag_, align_, fieldAlign_, kind_, equal_, gcdata_, str_, ptrToThis_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.size = 0;
			this.ptrdata = 0;
			this.hash = 0;
			this.tflag = 0;
			this.align = 0;
			this.fieldAlign = 0;
			this.kind = 0;
			this.equal = $throwNilPointerError;
			this.gcdata = ptrType$3.nil;
			this.str = 0;
			this.ptrToThis = 0;
			return;
		}
		this.size = size_;
		this.ptrdata = ptrdata_;
		this.hash = hash_;
		this.tflag = tflag_;
		this.align = align_;
		this.fieldAlign = fieldAlign_;
		this.kind = kind_;
		this.equal = equal_;
		this.gcdata = gcdata_;
		this.str = str_;
		this.ptrToThis = ptrToThis_;
	});
	method = $pkg.method = $newType(0, $kindStruct, "reflectlite.method", true, "internal/reflectlite", false, function(name_, mtyp_, ifn_, tfn_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.name = 0;
			this.mtyp = 0;
			this.ifn = 0;
			this.tfn = 0;
			return;
		}
		this.name = name_;
		this.mtyp = mtyp_;
		this.ifn = ifn_;
		this.tfn = tfn_;
	});
	chanDir = $pkg.chanDir = $newType(4, $kindInt, "reflectlite.chanDir", true, "internal/reflectlite", false, null);
	arrayType = $pkg.arrayType = $newType(0, $kindStruct, "reflectlite.arrayType", true, "internal/reflectlite", false, function(rtype_, elem_, slice_, len_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.rtype = new rtype.ptr(0, 0, 0, 0, 0, 0, 0, $throwNilPointerError, ptrType$3.nil, 0, 0);
			this.elem = ptrType$1.nil;
			this.slice = ptrType$1.nil;
			this.len = 0;
			return;
		}
		this.rtype = rtype_;
		this.elem = elem_;
		this.slice = slice_;
		this.len = len_;
	});
	chanType = $pkg.chanType = $newType(0, $kindStruct, "reflectlite.chanType", true, "internal/reflectlite", false, function(rtype_, elem_, dir_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.rtype = new rtype.ptr(0, 0, 0, 0, 0, 0, 0, $throwNilPointerError, ptrType$3.nil, 0, 0);
			this.elem = ptrType$1.nil;
			this.dir = 0;
			return;
		}
		this.rtype = rtype_;
		this.elem = elem_;
		this.dir = dir_;
	});
	imethod = $pkg.imethod = $newType(0, $kindStruct, "reflectlite.imethod", true, "internal/reflectlite", false, function(name_, typ_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.name = 0;
			this.typ = 0;
			return;
		}
		this.name = name_;
		this.typ = typ_;
	});
	interfaceType = $pkg.interfaceType = $newType(0, $kindStruct, "reflectlite.interfaceType", true, "internal/reflectlite", false, function(rtype_, pkgPath_, methods_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.rtype = new rtype.ptr(0, 0, 0, 0, 0, 0, 0, $throwNilPointerError, ptrType$3.nil, 0, 0);
			this.pkgPath = new name.ptr(ptrType$3.nil);
			this.methods = sliceType$6.nil;
			return;
		}
		this.rtype = rtype_;
		this.pkgPath = pkgPath_;
		this.methods = methods_;
	});
	mapType = $pkg.mapType = $newType(0, $kindStruct, "reflectlite.mapType", true, "internal/reflectlite", false, function(rtype_, key_, elem_, bucket_, hasher_, keysize_, valuesize_, bucketsize_, flags_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.rtype = new rtype.ptr(0, 0, 0, 0, 0, 0, 0, $throwNilPointerError, ptrType$3.nil, 0, 0);
			this.key = ptrType$1.nil;
			this.elem = ptrType$1.nil;
			this.bucket = ptrType$1.nil;
			this.hasher = $throwNilPointerError;
			this.keysize = 0;
			this.valuesize = 0;
			this.bucketsize = 0;
			this.flags = 0;
			return;
		}
		this.rtype = rtype_;
		this.key = key_;
		this.elem = elem_;
		this.bucket = bucket_;
		this.hasher = hasher_;
		this.keysize = keysize_;
		this.valuesize = valuesize_;
		this.bucketsize = bucketsize_;
		this.flags = flags_;
	});
	ptrType = $pkg.ptrType = $newType(0, $kindStruct, "reflectlite.ptrType", true, "internal/reflectlite", false, function(rtype_, elem_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.rtype = new rtype.ptr(0, 0, 0, 0, 0, 0, 0, $throwNilPointerError, ptrType$3.nil, 0, 0);
			this.elem = ptrType$1.nil;
			return;
		}
		this.rtype = rtype_;
		this.elem = elem_;
	});
	sliceType = $pkg.sliceType = $newType(0, $kindStruct, "reflectlite.sliceType", true, "internal/reflectlite", false, function(rtype_, elem_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.rtype = new rtype.ptr(0, 0, 0, 0, 0, 0, 0, $throwNilPointerError, ptrType$3.nil, 0, 0);
			this.elem = ptrType$1.nil;
			return;
		}
		this.rtype = rtype_;
		this.elem = elem_;
	});
	structField = $pkg.structField = $newType(0, $kindStruct, "reflectlite.structField", true, "internal/reflectlite", false, function(name_, typ_, offsetEmbed_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.name = new name.ptr(ptrType$3.nil);
			this.typ = ptrType$1.nil;
			this.offsetEmbed = 0;
			return;
		}
		this.name = name_;
		this.typ = typ_;
		this.offsetEmbed = offsetEmbed_;
	});
	structType = $pkg.structType = $newType(0, $kindStruct, "reflectlite.structType", true, "internal/reflectlite", false, function(rtype_, pkgPath_, fields_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.rtype = new rtype.ptr(0, 0, 0, 0, 0, 0, 0, $throwNilPointerError, ptrType$3.nil, 0, 0);
			this.pkgPath = new name.ptr(ptrType$3.nil);
			this.fields = sliceType$7.nil;
			return;
		}
		this.rtype = rtype_;
		this.pkgPath = pkgPath_;
		this.fields = fields_;
	});
	nameOff = $pkg.nameOff = $newType(4, $kindInt32, "reflectlite.nameOff", true, "internal/reflectlite", false, null);
	typeOff = $pkg.typeOff = $newType(4, $kindInt32, "reflectlite.typeOff", true, "internal/reflectlite", false, null);
	textOff = $pkg.textOff = $newType(4, $kindInt32, "reflectlite.textOff", true, "internal/reflectlite", false, null);
	Value = $pkg.Value = $newType(0, $kindStruct, "reflectlite.Value", true, "internal/reflectlite", true, function(typ_, ptr_, flag_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.typ = ptrType$1.nil;
			this.ptr = 0;
			this.flag = 0;
			return;
		}
		this.typ = typ_;
		this.ptr = ptr_;
		this.flag = flag_;
	});
	flag = $pkg.flag = $newType(4, $kindUintptr, "reflectlite.flag", true, "internal/reflectlite", false, null);
	ValueError = $pkg.ValueError = $newType(0, $kindStruct, "reflectlite.ValueError", true, "internal/reflectlite", true, function(Method_, Kind_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Method = "";
			this.Kind = 0;
			return;
		}
		this.Method = Method_;
		this.Kind = Kind_;
	});
	ptrType$1 = $ptrType(rtype);
	sliceType$1 = $sliceType(name);
	sliceType$2 = $sliceType(ptrType$1);
	sliceType$3 = $sliceType($emptyInterface);
	ptrType$2 = $ptrType(js.Object);
	funcType$1 = $funcType([sliceType$3], [ptrType$2], true);
	sliceType$4 = $sliceType($String);
	ptrType$3 = $ptrType($Uint8);
	sliceType$5 = $sliceType(method);
	sliceType$6 = $sliceType(imethod);
	sliceType$7 = $sliceType(structField);
	ptrType$4 = $ptrType(uncommonType);
	ptrType$5 = $ptrType(nameData);
	structType$2 = $structType("internal/reflectlite", [{prop: "str", name: "str", embedded: false, exported: false, typ: $String, tag: ""}]);
	sliceType$8 = $sliceType(ptrType$2);
	sliceType$9 = $sliceType(Value);
	ptrType$6 = $ptrType(mapIter);
	ptrType$7 = $ptrType(funcType);
	sliceType$12 = $sliceType(Type);
	ptrType$8 = $ptrType($UnsafePointer);
	ptrType$10 = $ptrType(errorString);
	funcType$2 = $funcType([$UnsafePointer, $UnsafePointer], [$Bool], false);
	ptrType$11 = $ptrType(interfaceType);
	funcType$3 = $funcType([$UnsafePointer, $Uintptr], [$Uintptr], false);
	ptrType$12 = $ptrType(structField);
	arrayType$2 = $arrayType($Uintptr, 2);
	sliceType$13 = $sliceType($Uint8);
	ptrType$13 = $ptrType(ValueError);
	init = function() {
		var used, x, x$1, x$10, x$11, x$12, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; used = $f.used; x = $f.x; x$1 = $f.x$1; x$10 = $f.x$10; x$11 = $f.x$11; x$12 = $f.x$12; x$2 = $f.x$2; x$3 = $f.x$3; x$4 = $f.x$4; x$5 = $f.x$5; x$6 = $f.x$6; x$7 = $f.x$7; x$8 = $f.x$8; x$9 = $f.x$9; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		used = (function(i) {
			var i;
		});
		$r = used((x = new rtype.ptr(0, 0, 0, 0, 0, 0, 0, $throwNilPointerError, ptrType$3.nil, 0, 0), new x.constructor.elem(x))); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = used((x$1 = new uncommonType.ptr(0, 0, 0, 0, sliceType$5.nil), new x$1.constructor.elem(x$1))); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = used((x$2 = new method.ptr(0, 0, 0, 0), new x$2.constructor.elem(x$2))); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = used((x$3 = new arrayType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, $throwNilPointerError, ptrType$3.nil, 0, 0), ptrType$1.nil, ptrType$1.nil, 0), new x$3.constructor.elem(x$3))); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = used((x$4 = new chanType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, $throwNilPointerError, ptrType$3.nil, 0, 0), ptrType$1.nil, 0), new x$4.constructor.elem(x$4))); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = used((x$5 = new funcType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, $throwNilPointerError, ptrType$3.nil, 0, 0), 0, 0, sliceType$2.nil, sliceType$2.nil), new x$5.constructor.elem(x$5))); /* */ $s = 6; case 6: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = used((x$6 = new interfaceType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, $throwNilPointerError, ptrType$3.nil, 0, 0), new name.ptr(ptrType$3.nil), sliceType$6.nil), new x$6.constructor.elem(x$6))); /* */ $s = 7; case 7: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = used((x$7 = new mapType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, $throwNilPointerError, ptrType$3.nil, 0, 0), ptrType$1.nil, ptrType$1.nil, ptrType$1.nil, $throwNilPointerError, 0, 0, 0, 0), new x$7.constructor.elem(x$7))); /* */ $s = 8; case 8: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = used((x$8 = new ptrType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, $throwNilPointerError, ptrType$3.nil, 0, 0), ptrType$1.nil), new x$8.constructor.elem(x$8))); /* */ $s = 9; case 9: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = used((x$9 = new sliceType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, $throwNilPointerError, ptrType$3.nil, 0, 0), ptrType$1.nil), new x$9.constructor.elem(x$9))); /* */ $s = 10; case 10: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = used((x$10 = new structType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, $throwNilPointerError, ptrType$3.nil, 0, 0), new name.ptr(ptrType$3.nil), sliceType$7.nil), new x$10.constructor.elem(x$10))); /* */ $s = 11; case 11: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = used((x$11 = new imethod.ptr(0, 0), new x$11.constructor.elem(x$11))); /* */ $s = 12; case 12: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = used((x$12 = new structField.ptr(new name.ptr(ptrType$3.nil), ptrType$1.nil, 0), new x$12.constructor.elem(x$12))); /* */ $s = 13; case 13: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		initialized = true;
		uint8Type = $assertType(TypeOf(new $Uint8(0)), ptrType$1);
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: init }; } $f.used = used; $f.x = x; $f.x$1 = x$1; $f.x$10 = x$10; $f.x$11 = x$11; $f.x$12 = x$12; $f.x$2 = x$2; $f.x$3 = x$3; $f.x$4 = x$4; $f.x$5 = x$5; $f.x$6 = x$6; $f.x$7 = x$7; $f.x$8 = x$8; $f.x$9 = x$9; $f.$s = $s; $f.$r = $r; return $f;
	};
	jsType = function(typ) {
		var typ;
		return typ[$externalize(idJsType, $String)];
	};
	reflectType = function(typ) {
		var _1, _i, _i$1, _i$2, _i$3, _key, _ref, _ref$1, _ref$2, _ref$3, dir, exported, exported$1, f, fields, i, i$1, i$2, i$3, i$4, i$5, imethods, in$1, m, m$1, m$2, methodSet, methods, offsetEmbed, out, outCount, params, reflectFields, reflectMethods, results, rt, typ, ut, xcount;
		if (typ[$externalize(idReflectType, $String)] === undefined) {
			rt = new rtype.ptr(((($parseInt(typ.size) >> 0) >>> 0)), 0, 0, 0, 0, 0, ((($parseInt(typ.kind) >> 0) << 24 >>> 24)), $throwNilPointerError, ptrType$3.nil, newNameOff($clone(newName(internalStr(typ.string), "", !!(typ.exported)), name)), 0);
			rt[$externalize(idJsType, $String)] = typ;
			typ[$externalize(idReflectType, $String)] = rt;
			methodSet = $methodSet(typ);
			if (!(($parseInt(methodSet.length) === 0)) || !!(typ.named)) {
				rt.tflag = (rt.tflag | (1)) >>> 0;
				if (!!(typ.named)) {
					rt.tflag = (rt.tflag | (4)) >>> 0;
				}
				reflectMethods = sliceType$5.nil;
				i = 0;
				while (true) {
					if (!(i < $parseInt(methodSet.length))) { break; }
					m = methodSet[i];
					exported = internalStr(m.pkg) === "";
					if (!exported) {
						i = i + (1) >> 0;
						continue;
					}
					reflectMethods = $append(reflectMethods, new method.ptr(newNameOff($clone(newName(internalStr(m.name), "", exported), name)), newTypeOff(reflectType(m.typ)), 0, 0));
					i = i + (1) >> 0;
				}
				xcount = ((reflectMethods.$length << 16 >>> 16));
				i$1 = 0;
				while (true) {
					if (!(i$1 < $parseInt(methodSet.length))) { break; }
					m$1 = methodSet[i$1];
					exported$1 = internalStr(m$1.pkg) === "";
					if (exported$1) {
						i$1 = i$1 + (1) >> 0;
						continue;
					}
					reflectMethods = $append(reflectMethods, new method.ptr(newNameOff($clone(newName(internalStr(m$1.name), "", exported$1), name)), newTypeOff(reflectType(m$1.typ)), 0, 0));
					i$1 = i$1 + (1) >> 0;
				}
				ut = new uncommonType.ptr(newNameOff($clone(newName(internalStr(typ.pkg), "", false), name)), (($parseInt(methodSet.length) << 16 >>> 16)), xcount, 0, reflectMethods);
				_key = rt; (uncommonTypeMap || $throwRuntimeError("assignment to entry in nil map"))[ptrType$1.keyFor(_key)] = { k: _key, v: ut };
				ut[$externalize(idJsType, $String)] = typ;
			}
			_1 = rt.Kind();
			if (_1 === (17)) {
				setKindType(rt, new arrayType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, $throwNilPointerError, ptrType$3.nil, 0, 0), reflectType(typ.elem), ptrType$1.nil, ((($parseInt(typ.len) >> 0) >>> 0))));
			} else if (_1 === (18)) {
				dir = 3;
				if (!!(typ.sendOnly)) {
					dir = 2;
				}
				if (!!(typ.recvOnly)) {
					dir = 1;
				}
				setKindType(rt, new chanType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, $throwNilPointerError, ptrType$3.nil, 0, 0), reflectType(typ.elem), ((dir >>> 0))));
			} else if (_1 === (19)) {
				params = typ.params;
				in$1 = $makeSlice(sliceType$2, $parseInt(params.length));
				_ref = in$1;
				_i = 0;
				while (true) {
					if (!(_i < _ref.$length)) { break; }
					i$2 = _i;
					((i$2 < 0 || i$2 >= in$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : in$1.$array[in$1.$offset + i$2] = reflectType(params[i$2]));
					_i++;
				}
				results = typ.results;
				out = $makeSlice(sliceType$2, $parseInt(results.length));
				_ref$1 = out;
				_i$1 = 0;
				while (true) {
					if (!(_i$1 < _ref$1.$length)) { break; }
					i$3 = _i$1;
					((i$3 < 0 || i$3 >= out.$length) ? ($throwRuntimeError("index out of range"), undefined) : out.$array[out.$offset + i$3] = reflectType(results[i$3]));
					_i$1++;
				}
				outCount = (($parseInt(results.length) << 16 >>> 16));
				if (!!(typ.variadic)) {
					outCount = (outCount | (32768)) >>> 0;
				}
				setKindType(rt, new funcType.ptr($clone(rt, rtype), (($parseInt(params.length) << 16 >>> 16)), outCount, in$1, out));
			} else if (_1 === (20)) {
				methods = typ.methods;
				imethods = $makeSlice(sliceType$6, $parseInt(methods.length));
				_ref$2 = imethods;
				_i$2 = 0;
				while (true) {
					if (!(_i$2 < _ref$2.$length)) { break; }
					i$4 = _i$2;
					m$2 = methods[i$4];
					imethod.copy(((i$4 < 0 || i$4 >= imethods.$length) ? ($throwRuntimeError("index out of range"), undefined) : imethods.$array[imethods.$offset + i$4]), new imethod.ptr(newNameOff($clone(newName(internalStr(m$2.name), "", internalStr(m$2.pkg) === ""), name)), newTypeOff(reflectType(m$2.typ))));
					_i$2++;
				}
				setKindType(rt, new interfaceType.ptr($clone(rt, rtype), $clone(newName(internalStr(typ.pkg), "", false), name), imethods));
			} else if (_1 === (21)) {
				setKindType(rt, new mapType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, $throwNilPointerError, ptrType$3.nil, 0, 0), reflectType(typ.key), reflectType(typ.elem), ptrType$1.nil, $throwNilPointerError, 0, 0, 0, 0));
			} else if (_1 === (22)) {
				setKindType(rt, new ptrType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, $throwNilPointerError, ptrType$3.nil, 0, 0), reflectType(typ.elem)));
			} else if (_1 === (23)) {
				setKindType(rt, new sliceType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, $throwNilPointerError, ptrType$3.nil, 0, 0), reflectType(typ.elem)));
			} else if (_1 === (25)) {
				fields = typ.fields;
				reflectFields = $makeSlice(sliceType$7, $parseInt(fields.length));
				_ref$3 = reflectFields;
				_i$3 = 0;
				while (true) {
					if (!(_i$3 < _ref$3.$length)) { break; }
					i$5 = _i$3;
					f = fields[i$5];
					offsetEmbed = ((i$5 >>> 0)) << 1 >>> 0;
					if (!!(f.embedded)) {
						offsetEmbed = (offsetEmbed | (1)) >>> 0;
					}
					structField.copy(((i$5 < 0 || i$5 >= reflectFields.$length) ? ($throwRuntimeError("index out of range"), undefined) : reflectFields.$array[reflectFields.$offset + i$5]), new structField.ptr($clone(newName(internalStr(f.name), internalStr(f.tag), !!(f.exported)), name), reflectType(f.typ), offsetEmbed));
					_i$3++;
				}
				setKindType(rt, new structType.ptr($clone(rt, rtype), $clone(newName(internalStr(typ.pkgPath), "", false), name), reflectFields));
			}
		}
		return ((typ[$externalize(idReflectType, $String)]));
	};
	setKindType = function(rt, kindType) {
		var kindType, rt;
		rt[$externalize(idKindType, $String)] = kindType;
		kindType[$externalize(idRtype, $String)] = rt;
	};
	uncommonType.ptr.prototype.methods = function() {
		var t;
		t = this;
		return t._methods;
	};
	uncommonType.prototype.methods = function() { return this.$val.methods(); };
	uncommonType.ptr.prototype.exportedMethods = function() {
		var t;
		t = this;
		return $subslice(t._methods, 0, t.xcount, t.xcount);
	};
	uncommonType.prototype.exportedMethods = function() { return this.$val.exportedMethods(); };
	rtype.ptr.prototype.uncommon = function() {
		var _entry, t;
		t = this;
		return (_entry = uncommonTypeMap[ptrType$1.keyFor(t)], _entry !== undefined ? _entry.v : ptrType$4.nil);
	};
	rtype.prototype.uncommon = function() { return this.$val.uncommon(); };
	funcType.ptr.prototype.in$ = function() {
		var t;
		t = this;
		return t._in;
	};
	funcType.prototype.in$ = function() { return this.$val.in$(); };
	funcType.ptr.prototype.out = function() {
		var t;
		t = this;
		return t._out;
	};
	funcType.prototype.out = function() { return this.$val.out(); };
	name.ptr.prototype.name = function() {
		var _entry, n, s;
		s = "";
		n = this;
		s = (_entry = nameMap[ptrType$3.keyFor(n.bytes)], _entry !== undefined ? _entry.v : ptrType$5.nil).name;
		return s;
	};
	name.prototype.name = function() { return this.$val.name(); };
	name.ptr.prototype.tag = function() {
		var _entry, n, s;
		s = "";
		n = this;
		s = (_entry = nameMap[ptrType$3.keyFor(n.bytes)], _entry !== undefined ? _entry.v : ptrType$5.nil).tag;
		return s;
	};
	name.prototype.tag = function() { return this.$val.tag(); };
	name.ptr.prototype.pkgPath = function() {
		var n;
		n = this;
		return "";
	};
	name.prototype.pkgPath = function() { return this.$val.pkgPath(); };
	name.ptr.prototype.isExported = function() {
		var _entry, n;
		n = this;
		return (_entry = nameMap[ptrType$3.keyFor(n.bytes)], _entry !== undefined ? _entry.v : ptrType$5.nil).exported;
	};
	name.prototype.isExported = function() { return this.$val.isExported(); };
	newName = function(n, tag, exported) {
		var _key, b, exported, n, tag;
		b = $newDataPointer(0, ptrType$3);
		_key = b; (nameMap || $throwRuntimeError("assignment to entry in nil map"))[ptrType$3.keyFor(_key)] = { k: _key, v: new nameData.ptr(n, tag, exported) };
		return new name.ptr(b);
	};
	rtype.ptr.prototype.nameOff = function(off) {
		var off, t, x;
		t = this;
		return (x = ((off >> 0)), ((x < 0 || x >= nameOffList.$length) ? ($throwRuntimeError("index out of range"), undefined) : nameOffList.$array[nameOffList.$offset + x]));
	};
	rtype.prototype.nameOff = function(off) { return this.$val.nameOff(off); };
	newNameOff = function(n) {
		var i, n;
		i = nameOffList.$length;
		nameOffList = $append(nameOffList, n);
		return ((i >> 0));
	};
	rtype.ptr.prototype.typeOff = function(off) {
		var off, t, x;
		t = this;
		return (x = ((off >> 0)), ((x < 0 || x >= typeOffList.$length) ? ($throwRuntimeError("index out of range"), undefined) : typeOffList.$array[typeOffList.$offset + x]));
	};
	rtype.prototype.typeOff = function(off) { return this.$val.typeOff(off); };
	newTypeOff = function(t) {
		var i, t;
		i = typeOffList.$length;
		typeOffList = $append(typeOffList, t);
		return ((i >> 0));
	};
	internalStr = function(strObj) {
		var c, strObj;
		c = new structType$2.ptr("");
		c.str = strObj;
		return c.str;
	};
	isWrapped = function(typ) {
		var typ;
		return !!(jsType(typ).wrapped);
	};
	copyStruct = function(dst, src, typ) {
		var dst, fields, i, prop, src, typ;
		fields = jsType(typ).fields;
		i = 0;
		while (true) {
			if (!(i < $parseInt(fields.length))) { break; }
			prop = $internalize(fields[i].prop, $String);
			dst[$externalize(prop, $String)] = src[$externalize(prop, $String)];
			i = i + (1) >> 0;
		}
	};
	makeValue = function(t, v, fl) {
		var _r, _r$1, _r$2, _r$3, _r$4, _r$5, _v, _v$1, fl, rt, t, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _r$5 = $f._r$5; _v = $f._v; _v$1 = $f._v$1; fl = $f.fl; rt = $f.rt; t = $f.t; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = t.common(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		rt = _r;
		_r$1 = t.Kind(); /* */ $s = 6; case 6: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		if (_r$1 === 17) { _v$1 = true; $s = 5; continue s; }
		_r$2 = t.Kind(); /* */ $s = 7; case 7: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		_v$1 = _r$2 === 25; case 5:
		if (_v$1) { _v = true; $s = 4; continue s; }
		_r$3 = t.Kind(); /* */ $s = 8; case 8: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
		_v = _r$3 === 22; case 4:
		/* */ if (_v) { $s = 2; continue; }
		/* */ $s = 3; continue;
		/* if (_v) { */ case 2:
			_r$4 = t.Kind(); /* */ $s = 9; case 9: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
			$s = -1; return new Value.ptr(rt, (v), (fl | ((_r$4 >>> 0))) >>> 0);
		/* } */ case 3:
		_r$5 = t.Kind(); /* */ $s = 10; case 10: if($c) { $c = false; _r$5 = _r$5.$blk(); } if (_r$5 && _r$5.$blk !== undefined) { break s; }
		$s = -1; return new Value.ptr(rt, ($newDataPointer(v, jsType(rt.ptrTo()))), (((fl | ((_r$5 >>> 0))) >>> 0) | 128) >>> 0);
		/* */ } return; } if ($f === undefined) { $f = { $blk: makeValue }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._r$5 = _r$5; $f._v = _v; $f._v$1 = _v$1; $f.fl = fl; $f.rt = rt; $f.t = t; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	TypeOf = function(i) {
		var i;
		if (!initialized) {
			return new rtype.ptr(0, 0, 0, 0, 0, 0, 0, $throwNilPointerError, ptrType$3.nil, 0, 0);
		}
		if ($interfaceIsEqual(i, $ifaceNil)) {
			return $ifaceNil;
		}
		return reflectType(i.constructor);
	};
	$pkg.TypeOf = TypeOf;
	ValueOf = function(i) {
		var _r, i, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; i = $f.i; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		if ($interfaceIsEqual(i, $ifaceNil)) {
			$s = -1; return new Value.ptr(ptrType$1.nil, 0, 0);
		}
		_r = makeValue(reflectType(i.constructor), i.$val, 0); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: ValueOf }; } $f._r = _r; $f.i = i; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.ValueOf = ValueOf;
	FuncOf = function(in$1, out, variadic) {
		var _i, _i$1, _r, _ref, _ref$1, _v, _v$1, i, i$1, in$1, jsIn, jsOut, out, v, v$1, variadic, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _i = $f._i; _i$1 = $f._i$1; _r = $f._r; _ref = $f._ref; _ref$1 = $f._ref$1; _v = $f._v; _v$1 = $f._v$1; i = $f.i; i$1 = $f.i$1; in$1 = $f.in$1; jsIn = $f.jsIn; jsOut = $f.jsOut; out = $f.out; v = $f.v; v$1 = $f.v$1; variadic = $f.variadic; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		if (!(variadic)) { _v = false; $s = 3; continue s; }
		if (in$1.$length === 0) { _v$1 = true; $s = 4; continue s; }
		_r = (x = in$1.$length - 1 >> 0, ((x < 0 || x >= in$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : in$1.$array[in$1.$offset + x])).Kind(); /* */ $s = 5; case 5: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_v$1 = !((_r === 23)); case 4:
		_v = _v$1; case 3:
		/* */ if (_v) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (_v) { */ case 1:
			$panic(new $String("reflect.FuncOf: last arg of variadic func must be slice"));
		/* } */ case 2:
		jsIn = $makeSlice(sliceType$8, in$1.$length);
		_ref = in$1;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			v = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			((i < 0 || i >= jsIn.$length) ? ($throwRuntimeError("index out of range"), undefined) : jsIn.$array[jsIn.$offset + i] = jsType(v));
			_i++;
		}
		jsOut = $makeSlice(sliceType$8, out.$length);
		_ref$1 = out;
		_i$1 = 0;
		while (true) {
			if (!(_i$1 < _ref$1.$length)) { break; }
			i$1 = _i$1;
			v$1 = ((_i$1 < 0 || _i$1 >= _ref$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref$1.$array[_ref$1.$offset + _i$1]);
			((i$1 < 0 || i$1 >= jsOut.$length) ? ($throwRuntimeError("index out of range"), undefined) : jsOut.$array[jsOut.$offset + i$1] = jsType(v$1));
			_i$1++;
		}
		$s = -1; return reflectType($funcType($externalize(jsIn, sliceType$8), $externalize(jsOut, sliceType$8), $externalize(variadic, $Bool)));
		/* */ } return; } if ($f === undefined) { $f = { $blk: FuncOf }; } $f._i = _i; $f._i$1 = _i$1; $f._r = _r; $f._ref = _ref; $f._ref$1 = _ref$1; $f._v = _v; $f._v$1 = _v$1; $f.i = i; $f.i$1 = i$1; $f.in$1 = in$1; $f.jsIn = jsIn; $f.jsOut = jsOut; $f.out = out; $f.v = v; $f.v$1 = v$1; $f.variadic = variadic; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.FuncOf = FuncOf;
	rtype.ptr.prototype.ptrTo = function() {
		var t;
		t = this;
		return reflectType($ptrType(jsType(t)));
	};
	rtype.prototype.ptrTo = function() { return this.$val.ptrTo(); };
	SliceOf = function(t) {
		var t;
		return reflectType($sliceType(jsType(t)));
	};
	$pkg.SliceOf = SliceOf;
	unsafe_New = function(typ) {
		var _1, typ;
		_1 = typ.Kind();
		if (_1 === (25)) {
			return (new (jsType(typ).ptr)());
		} else if (_1 === (17)) {
			return (jsType(typ).zero());
		} else {
			return ($newDataPointer(jsType(typ).zero(), jsType(typ.ptrTo())));
		}
	};
	typedmemmove = function(t, dst, src) {
		var dst, src, t;
		dst.$set(src.$get());
	};
	keyFor = function(t, key) {
		var k, key, kv, t;
		kv = key;
		if (!(kv.$get === undefined)) {
			kv = kv.$get();
		}
		k = $internalize(jsType(t.Key()).keyFor(kv), $String);
		return [kv, k];
	};
	mapaccess = function(t, m, key) {
		var _tuple, entry, k, key, m, t;
		_tuple = keyFor(t, key);
		k = _tuple[1];
		entry = m[$externalize(k, $String)];
		if (entry === undefined) {
			return 0;
		}
		return ($newDataPointer(entry.v, jsType(PtrTo(t.Elem()))));
	};
	mapIter.ptr.prototype.skipUntilValidKey = function() {
		var iter, k;
		iter = this;
		while (true) {
			if (!(iter.i < $parseInt(iter.keys.length))) { break; }
			k = iter.keys[iter.i];
			if (!(iter.m[$externalize($internalize(k, $String), $String)] === undefined)) {
				break;
			}
			iter.i = iter.i + (1) >> 0;
		}
	};
	mapIter.prototype.skipUntilValidKey = function() { return this.$val.skipUntilValidKey(); };
	mapiterinit = function(t, m) {
		var m, t;
		return (new mapIter.ptr(t, m, $keys(m), 0, null));
	};
	mapiterkey = function(it) {
		var _r, _r$1, _r$2, it, iter, k, kv, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; it = $f.it; iter = $f.iter; k = $f.k; kv = $f.kv; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		iter = ($pointerOfStructConversion(it, ptrType$6));
		kv = null;
		if (!(iter.last === null)) {
			kv = iter.last;
		} else {
			iter.skipUntilValidKey();
			if (iter.i === $parseInt(iter.keys.length)) {
				$s = -1; return 0;
			}
			k = iter.keys[iter.i];
			kv = iter.m[$externalize($internalize(k, $String), $String)];
			iter.last = kv;
		}
		_r = $assertType(iter.t, TypeEx).Key(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_r$1 = PtrTo(_r); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_r$2 = jsType(_r$1); /* */ $s = 3; case 3: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		$s = -1; return ($newDataPointer(kv.k, _r$2));
		/* */ } return; } if ($f === undefined) { $f = { $blk: mapiterkey }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f.it = it; $f.iter = iter; $f.k = k; $f.kv = kv; $f.$s = $s; $f.$r = $r; return $f;
	};
	mapiternext = function(it) {
		var it, iter;
		iter = ($pointerOfStructConversion(it, ptrType$6));
		iter.last = null;
		iter.i = iter.i + (1) >> 0;
	};
	maplen = function(m) {
		var m;
		return $parseInt($keys(m).length);
	};
	methodReceiver = function(op, v, i) {
		var _$12, fn, i, m, m$1, ms, op, prop, rcvr, t, tt, v, x;
		_$12 = ptrType$1.nil;
		t = ptrType$7.nil;
		fn = 0;
		prop = "";
		if (v.typ.Kind() === 20) {
			tt = (v.typ.kindType);
			if (i < 0 || i >= tt.methods.$length) {
				$panic(new $String("reflect: internal error: invalid method index"));
			}
			m = (x = tt.methods, ((i < 0 || i >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + i]));
			if (!$clone(tt.rtype.nameOff(m.name), name).isExported()) {
				$panic(new $String("reflect: " + op + " of unexported method"));
			}
			t = (tt.rtype.typeOff(m.typ).kindType);
			prop = $clone(tt.rtype.nameOff(m.name), name).name();
		} else {
			ms = v.typ.exportedMethods();
			if (((i >>> 0)) >= ((ms.$length >>> 0))) {
				$panic(new $String("reflect: internal error: invalid method index"));
			}
			m$1 = $clone(((i < 0 || i >= ms.$length) ? ($throwRuntimeError("index out of range"), undefined) : ms.$array[ms.$offset + i]), method);
			if (!$clone(v.typ.nameOff(m$1.name), name).isExported()) {
				$panic(new $String("reflect: " + op + " of unexported method"));
			}
			t = (v.typ.typeOff(m$1.mtyp).kindType);
			prop = $internalize($methodSet(jsType(v.typ))[i].prop, $String);
		}
		rcvr = $clone(v, Value).object();
		if (isWrapped(v.typ)) {
			rcvr = new (jsType(v.typ))(rcvr);
		}
		fn = (rcvr[$externalize(prop, $String)]);
		return [_$12, t, fn];
	};
	valueInterface = function(v) {
		var _r, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		if (v.flag === 0) {
			$panic(new ValueError.ptr("reflect.Value.Interface", 0));
		}
		/* */ if (!((((v.flag & 512) >>> 0) === 0))) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!((((v.flag & 512) >>> 0) === 0))) { */ case 1:
			_r = makeMethodValue("Interface", $clone(v, Value)); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			Value.copy(v, _r);
		/* } */ case 2:
		if (isWrapped(v.typ)) {
			$s = -1; return ((new (jsType(v.typ))($clone(v, Value).object())));
		}
		$s = -1; return (($clone(v, Value).object()));
		/* */ } return; } if ($f === undefined) { $f = { $blk: valueInterface }; } $f._r = _r; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	ifaceE2I = function(t, src, dst) {
		var dst, src, t;
		dst.$set(src);
	};
	methodName = function() {
		return "?FIXME?";
	};
	makeMethodValue = function(op, v) {
		var _r, _tuple, fn, fv, op, rcvr, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; fn = $f.fn; fv = $f.fv; op = $f.op; rcvr = $f.rcvr; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		fn = [fn];
		rcvr = [rcvr];
		if (((v.flag & 512) >>> 0) === 0) {
			$panic(new $String("reflect: internal error: invalid use of makePartialFunc"));
		}
		_tuple = methodReceiver(op, $clone(v, Value), ((v.flag >> 0)) >> 10 >> 0);
		fn[0] = _tuple[2];
		rcvr[0] = $clone(v, Value).object();
		if (isWrapped(v.typ)) {
			rcvr[0] = new (jsType(v.typ))(rcvr[0]);
		}
		fv = js.MakeFunc((function(fn, rcvr) { return function(this$1, arguments$1) {
			var arguments$1, this$1;
			return new $jsObjectPtr(fn[0].apply(rcvr[0], $externalize(arguments$1, sliceType$8)));
		}; })(fn, rcvr));
		_r = $clone(v, Value).Type().common(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return new Value.ptr(_r, (fv), (new flag(v.flag).ro() | 19) >>> 0);
		/* */ } return; } if ($f === undefined) { $f = { $blk: makeMethodValue }; } $f._r = _r; $f._tuple = _tuple; $f.fn = fn; $f.fv = fv; $f.op = op; $f.rcvr = rcvr; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	wrapJsObject = function(typ, val) {
		var typ, val;
		if ($interfaceIsEqual(typ, jsObjectPtr)) {
			return new (jsType(jsObjectPtr))(val);
		}
		return val;
	};
	unwrapJsObject = function(typ, val) {
		var typ, val;
		if ($interfaceIsEqual(typ, jsObjectPtr)) {
			return val.object;
		}
		return val;
	};
	getJsTag = function(tag) {
		var _tuple, i, name$1, qvalue, tag, value;
		while (true) {
			if (!(!(tag === ""))) { break; }
			i = 0;
			while (true) {
				if (!(i < tag.length && (tag.charCodeAt(i) === 32))) { break; }
				i = i + (1) >> 0;
			}
			tag = $substring(tag, i);
			if (tag === "") {
				break;
			}
			i = 0;
			while (true) {
				if (!(i < tag.length && !((tag.charCodeAt(i) === 32)) && !((tag.charCodeAt(i) === 58)) && !((tag.charCodeAt(i) === 34)))) { break; }
				i = i + (1) >> 0;
			}
			if ((i + 1 >> 0) >= tag.length || !((tag.charCodeAt(i) === 58)) || !((tag.charCodeAt((i + 1 >> 0)) === 34))) {
				break;
			}
			name$1 = ($substring(tag, 0, i));
			tag = $substring(tag, (i + 1 >> 0));
			i = 1;
			while (true) {
				if (!(i < tag.length && !((tag.charCodeAt(i) === 34)))) { break; }
				if (tag.charCodeAt(i) === 92) {
					i = i + (1) >> 0;
				}
				i = i + (1) >> 0;
			}
			if (i >= tag.length) {
				break;
			}
			qvalue = ($substring(tag, 0, (i + 1 >> 0)));
			tag = $substring(tag, (i + 1 >> 0));
			if (name$1 === "js") {
				_tuple = unquote(qvalue);
				value = _tuple[0];
				return value;
			}
		}
		return "";
	};
	PtrTo = function(t) {
		var t;
		return $assertType(t, ptrType$1).ptrTo();
	};
	$pkg.PtrTo = PtrTo;
	copyVal = function(typ, fl, ptr) {
		var c, fl, ptr, typ;
		if (ifaceIndir(typ)) {
			c = unsafe_New(typ);
			typedmemmove(typ, c, ptr);
			return new Value.ptr(typ, c, (fl | 128) >>> 0);
		}
		return new Value.ptr(typ, (ptr).$get(), fl);
	};
	rtype.ptr.prototype.Comparable = function() {
		var _1, _r, _r$1, ft, i, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _1 = $f._1; _r = $f._r; _r$1 = $f._r$1; ft = $f.ft; i = $f.i; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
			_1 = t.Kind();
			/* */ if ((_1 === (19)) || (_1 === (23)) || (_1 === (21))) { $s = 2; continue; }
			/* */ if (_1 === (17)) { $s = 3; continue; }
			/* */ if (_1 === (25)) { $s = 4; continue; }
			/* */ $s = 5; continue;
			/* if ((_1 === (19)) || (_1 === (23)) || (_1 === (21))) { */ case 2:
				$s = -1; return false;
			/* } else if (_1 === (17)) { */ case 3:
				_r = t.Elem().Comparable(); /* */ $s = 6; case 6: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				$s = -1; return _r;
			/* } else if (_1 === (25)) { */ case 4:
				i = 0;
				/* while (true) { */ case 7:
					/* if (!(i < t.NumField())) { break; } */ if(!(i < t.NumField())) { $s = 8; continue; }
					ft = $clone(t.Field(i), structField);
					_r$1 = ft.typ.Comparable(); /* */ $s = 11; case 11: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
					/* */ if (!_r$1) { $s = 9; continue; }
					/* */ $s = 10; continue;
					/* if (!_r$1) { */ case 9:
						$s = -1; return false;
					/* } */ case 10:
					i = i + (1) >> 0;
				/* } */ $s = 7; continue; case 8:
			/* } */ case 5:
		case 1:
		$s = -1; return true;
		/* */ } return; } if ($f === undefined) { $f = { $blk: rtype.ptr.prototype.Comparable }; } $f._1 = _1; $f._r = _r; $f._r$1 = _r$1; $f.ft = ft; $f.i = i; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	rtype.prototype.Comparable = function() { return this.$val.Comparable(); };
	rtype.ptr.prototype.IsVariadic = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: IsVariadic of non-func type"));
		}
		tt = (t.kindType);
		return !((((tt.outCount & 32768) >>> 0) === 0));
	};
	rtype.prototype.IsVariadic = function() { return this.$val.IsVariadic(); };
	rtype.ptr.prototype.Field = function(i) {
		var i, t, tt, x;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: Field of non-struct type"));
		}
		tt = (t.kindType);
		if (i < 0 || i >= tt.fields.$length) {
			$panic(new $String("reflect: Field index out of bounds"));
		}
		return (x = tt.fields, ((i < 0 || i >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + i]));
	};
	rtype.prototype.Field = function(i) { return this.$val.Field(i); };
	rtype.ptr.prototype.Key = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 21))) {
			$panic(new $String("reflect: Key of non-map type"));
		}
		tt = (t.kindType);
		return toType(tt.key);
	};
	rtype.prototype.Key = function() { return this.$val.Key(); };
	rtype.ptr.prototype.NumField = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: NumField of non-struct type"));
		}
		tt = (t.kindType);
		return tt.fields.$length;
	};
	rtype.prototype.NumField = function() { return this.$val.NumField(); };
	rtype.ptr.prototype.Method = function(i) {
		var _i, _i$1, _r, _r$1, _ref, _ref$1, arg, fl, fn, ft, i, in$1, m, methods, mt, mtyp, out, p, pname, prop, ret, t, tt, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _i = $f._i; _i$1 = $f._i$1; _r = $f._r; _r$1 = $f._r$1; _ref = $f._ref; _ref$1 = $f._ref$1; arg = $f.arg; fl = $f.fl; fn = $f.fn; ft = $f.ft; i = $f.i; in$1 = $f.in$1; m = $f.m; methods = $f.methods; mt = $f.mt; mtyp = $f.mtyp; out = $f.out; p = $f.p; pname = $f.pname; prop = $f.prop; ret = $f.ret; t = $f.t; tt = $f.tt; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		prop = [prop];
		m = new Method.ptr("", "", $ifaceNil, new Value.ptr(ptrType$1.nil, 0, 0), 0);
		t = this;
		/* */ if (t.Kind() === 20) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (t.Kind() === 20) { */ case 1:
			tt = (t.kindType);
			_r = tt.rtype.Method(i); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			Method.copy(m, _r);
			$s = -1; return m;
		/* } */ case 2:
		methods = t.exportedMethods();
		if (i < 0 || i >= methods.$length) {
			$panic(new $String("reflect: Method index out of range"));
		}
		p = $clone(((i < 0 || i >= methods.$length) ? ($throwRuntimeError("index out of range"), undefined) : methods.$array[methods.$offset + i]), method);
		pname = $clone(t.nameOff(p.name), name);
		m.Name = $clone(pname, name).name();
		fl = 19;
		mtyp = t.typeOff(p.mtyp);
		ft = (mtyp.kindType);
		in$1 = $makeSlice(sliceType$12, 0, (1 + ft.in$().$length >> 0));
		in$1 = $append(in$1, t);
		_ref = ft.in$();
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			arg = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			in$1 = $append(in$1, arg);
			_i++;
		}
		out = $makeSlice(sliceType$12, 0, ft.out().$length);
		_ref$1 = ft.out();
		_i$1 = 0;
		while (true) {
			if (!(_i$1 < _ref$1.$length)) { break; }
			ret = ((_i$1 < 0 || _i$1 >= _ref$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref$1.$array[_ref$1.$offset + _i$1]);
			out = $append(out, ret);
			_i$1++;
		}
		_r$1 = FuncOf(in$1, out, ft.rtype.IsVariadic()); /* */ $s = 4; case 4: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		mt = _r$1;
		m.Type = mt;
		prop[0] = $internalize($methodSet(t[$externalize(idJsType, $String)])[i].prop, $String);
		fn = js.MakeFunc((function(prop) { return function(this$1, arguments$1) {
			var arguments$1, rcvr, this$1;
			rcvr = (0 >= arguments$1.$length ? ($throwRuntimeError("index out of range"), undefined) : arguments$1.$array[arguments$1.$offset + 0]);
			return new $jsObjectPtr(rcvr[$externalize(prop[0], $String)].apply(rcvr, $externalize($subslice(arguments$1, 1), sliceType$8)));
		}; })(prop));
		Value.copy(m.Func, new Value.ptr($assertType(mt, ptrType$1), (fn), fl));
		m.Index = i;
		Method.copy(m, m);
		$s = -1; return m;
		/* */ } return; } if ($f === undefined) { $f = { $blk: rtype.ptr.prototype.Method }; } $f._i = _i; $f._i$1 = _i$1; $f._r = _r; $f._r$1 = _r$1; $f._ref = _ref; $f._ref$1 = _ref$1; $f.arg = arg; $f.fl = fl; $f.fn = fn; $f.ft = ft; $f.i = i; $f.in$1 = in$1; $f.m = m; $f.methods = methods; $f.mt = mt; $f.mtyp = mtyp; $f.out = out; $f.p = p; $f.pname = pname; $f.prop = prop; $f.ret = ret; $f.t = t; $f.tt = tt; $f.$s = $s; $f.$r = $r; return $f;
	};
	rtype.prototype.Method = function(i) { return this.$val.Method(i); };
	errorString.ptr.prototype.Error = function() {
		var e;
		e = this;
		return e.s;
	};
	errorString.prototype.Error = function() { return this.$val.Error(); };
	unquote = function(s) {
		var s;
		if (s.length < 2) {
			return [s, $ifaceNil];
		}
		if ((s.charCodeAt(0) === 39) || (s.charCodeAt(0) === 34)) {
			if (s.charCodeAt((s.length - 1 >> 0)) === s.charCodeAt(0)) {
				return [$substring(s, 1, (s.length - 1 >> 0)), $ifaceNil];
			}
			return ["", $pkg.ErrSyntax];
		}
		return [s, $ifaceNil];
	};
	flag.prototype.mustBe = function(expected) {
		var expected, f;
		f = this.$val;
		if (!((((((f & 31) >>> 0) >>> 0)) === expected))) {
			$panic(new ValueError.ptr(methodName(), new flag(f).kind()));
		}
	};
	$ptrType(flag).prototype.mustBe = function(expected) { return new flag(this.$get()).mustBe(expected); };
	Value.ptr.prototype.object = function() {
		var _1, newVal, v, val;
		v = this;
		if ((v.typ.Kind() === 17) || (v.typ.Kind() === 25)) {
			return v.ptr;
		}
		if (!((((v.flag & 128) >>> 0) === 0))) {
			val = v.ptr.$get();
			if (!(val === $ifaceNil) && !(val.constructor === jsType(v.typ))) {
				switch (0) { default:
					_1 = v.typ.Kind();
					if ((_1 === (11)) || (_1 === (6))) {
						val = new (jsType(v.typ))(val.$high, val.$low);
					} else if ((_1 === (15)) || (_1 === (16))) {
						val = new (jsType(v.typ))(val.$real, val.$imag);
					} else if (_1 === (23)) {
						if (val === val.constructor.nil) {
							val = jsType(v.typ).nil;
							break;
						}
						newVal = new (jsType(v.typ))(val.$array);
						newVal.$offset = val.$offset;
						newVal.$length = val.$length;
						newVal.$capacity = val.$capacity;
						val = newVal;
					}
				}
			}
			return val;
		}
		return v.ptr;
	};
	Value.prototype.object = function() { return this.$val.object(); };
	Value.ptr.prototype.assignTo = function(context, dst, target) {
		var _r, _r$1, _r$2, context, dst, fl, target, v, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; context = $f.context; dst = $f.dst; fl = $f.fl; target = $f.target; v = $f.v; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		/* */ if (!((((v.flag & 512) >>> 0) === 0))) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!((((v.flag & 512) >>> 0) === 0))) { */ case 1:
			_r = makeMethodValue(context, $clone(v, Value)); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			Value.copy(v, _r);
		/* } */ case 2:
			_r$1 = directlyAssignable(dst, v.typ); /* */ $s = 8; case 8: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			/* */ if (_r$1) { $s = 5; continue; }
			/* */ if (implements$1(dst, v.typ)) { $s = 6; continue; }
			/* */ $s = 7; continue;
			/* if (_r$1) { */ case 5:
				fl = (((v.flag & 384) >>> 0) | new flag(v.flag).ro()) >>> 0;
				fl = (fl | (((dst.Kind() >>> 0)))) >>> 0;
				$s = -1; return new Value.ptr(dst, v.ptr, fl);
			/* } else if (implements$1(dst, v.typ)) { */ case 6:
				if (target === 0) {
					target = unsafe_New(dst);
				}
				_r$2 = valueInterface($clone(v, Value)); /* */ $s = 9; case 9: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
				x = _r$2;
				if (dst.NumMethod() === 0) {
					(target).$set(x);
				} else {
					ifaceE2I(dst, x, target);
				}
				$s = -1; return new Value.ptr(dst, target, 148);
			/* } */ case 7:
		case 4:
		$panic(new $String(context + ": value of type " + v.typ.String() + " is not assignable to type " + dst.String()));
		$s = -1; return new Value.ptr(ptrType$1.nil, 0, 0);
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.assignTo }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f.context = context; $f.dst = dst; $f.fl = fl; $f.target = target; $f.v = v; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.assignTo = function(context, dst, target) { return this.$val.assignTo(context, dst, target); };
	Value.ptr.prototype.Cap = function() {
		var _1, k, v;
		v = this;
		k = new flag(v.flag).kind();
		_1 = k;
		if (_1 === (17)) {
			return v.typ.Len();
		} else if ((_1 === (18)) || (_1 === (23))) {
			return $parseInt($clone(v, Value).object().$capacity) >> 0;
		}
		$panic(new ValueError.ptr("reflect.Value.Cap", k));
	};
	Value.prototype.Cap = function() { return this.$val.Cap(); };
	Value.ptr.prototype.Index = function(i) {
		var _1, _r, _r$1, a, a$1, c, fl, fl$1, fl$2, i, k, s, str, tt, tt$1, typ, typ$1, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _1 = $f._1; _r = $f._r; _r$1 = $f._r$1; a = $f.a; a$1 = $f.a$1; c = $f.c; fl = $f.fl; fl$1 = $f.fl$1; fl$2 = $f.fl$2; i = $f.i; k = $f.k; s = $f.s; str = $f.str; tt = $f.tt; tt$1 = $f.tt$1; typ = $f.typ; typ$1 = $f.typ$1; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		a = [a];
		a$1 = [a$1];
		c = [c];
		i = [i];
		typ = [typ];
		typ$1 = [typ$1];
		v = this;
			k = new flag(v.flag).kind();
			_1 = k;
			/* */ if (_1 === (17)) { $s = 2; continue; }
			/* */ if (_1 === (23)) { $s = 3; continue; }
			/* */ if (_1 === (24)) { $s = 4; continue; }
			/* */ $s = 5; continue;
			/* if (_1 === (17)) { */ case 2:
				tt = (v.typ.kindType);
				if (i[0] < 0 || i[0] > ((tt.len >> 0))) {
					$panic(new $String("reflect: array index out of range"));
				}
				typ[0] = tt.elem;
				fl = (((((v.flag & 384) >>> 0) | new flag(v.flag).ro()) >>> 0) | ((typ[0].Kind() >>> 0))) >>> 0;
				a[0] = v.ptr;
				/* */ if (!((((fl & 128) >>> 0) === 0)) && !((typ[0].Kind() === 17)) && !((typ[0].Kind() === 25))) { $s = 7; continue; }
				/* */ $s = 8; continue;
				/* if (!((((fl & 128) >>> 0) === 0)) && !((typ[0].Kind() === 17)) && !((typ[0].Kind() === 25))) { */ case 7:
					$s = -1; return new Value.ptr(typ[0], (new (jsType(PtrTo(typ[0])))((function(a, a$1, c, i, typ, typ$1) { return function() {
						return wrapJsObject(typ[0], a[0][i[0]]);
					}; })(a, a$1, c, i, typ, typ$1), (function(a, a$1, c, i, typ, typ$1) { return function(x) {
						var x;
						a[0][i[0]] = unwrapJsObject(typ[0], x);
					}; })(a, a$1, c, i, typ, typ$1))), fl);
				/* } */ case 8:
				_r = makeValue(typ[0], wrapJsObject(typ[0], a[0][i[0]]), fl); /* */ $s = 9; case 9: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				$s = -1; return _r;
			/* } else if (_1 === (23)) { */ case 3:
				s = $clone(v, Value).object();
				if (i[0] < 0 || i[0] >= ($parseInt(s.$length) >> 0)) {
					$panic(new $String("reflect: slice index out of range"));
				}
				tt$1 = (v.typ.kindType);
				typ$1[0] = tt$1.elem;
				fl$1 = (((384 | new flag(v.flag).ro()) >>> 0) | ((typ$1[0].Kind() >>> 0))) >>> 0;
				i[0] = i[0] + (($parseInt(s.$offset) >> 0)) >> 0;
				a$1[0] = s.$array;
				/* */ if (!((((fl$1 & 128) >>> 0) === 0)) && !((typ$1[0].Kind() === 17)) && !((typ$1[0].Kind() === 25))) { $s = 10; continue; }
				/* */ $s = 11; continue;
				/* if (!((((fl$1 & 128) >>> 0) === 0)) && !((typ$1[0].Kind() === 17)) && !((typ$1[0].Kind() === 25))) { */ case 10:
					$s = -1; return new Value.ptr(typ$1[0], (new (jsType(PtrTo(typ$1[0])))((function(a, a$1, c, i, typ, typ$1) { return function() {
						return wrapJsObject(typ$1[0], a$1[0][i[0]]);
					}; })(a, a$1, c, i, typ, typ$1), (function(a, a$1, c, i, typ, typ$1) { return function(x) {
						var x;
						a$1[0][i[0]] = unwrapJsObject(typ$1[0], x);
					}; })(a, a$1, c, i, typ, typ$1))), fl$1);
				/* } */ case 11:
				_r$1 = makeValue(typ$1[0], wrapJsObject(typ$1[0], a$1[0][i[0]]), fl$1); /* */ $s = 12; case 12: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
				$s = -1; return _r$1;
			/* } else if (_1 === (24)) { */ case 4:
				str = (v.ptr).$get();
				if (i[0] < 0 || i[0] >= str.length) {
					$panic(new $String("reflect: string index out of range"));
				}
				fl$2 = (((new flag(v.flag).ro() | 8) >>> 0) | 128) >>> 0;
				c[0] = str.charCodeAt(i[0]);
				$s = -1; return new Value.ptr(uint8Type, ((c.$ptr || (c.$ptr = new ptrType$3(function() { return this.$target[0]; }, function($v) { this.$target[0] = $v; }, c)))), fl$2);
			/* } else { */ case 5:
				$panic(new ValueError.ptr("reflect.Value.Index", k));
			/* } */ case 6:
		case 1:
		$s = -1; return new Value.ptr(ptrType$1.nil, 0, 0);
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.Index }; } $f._1 = _1; $f._r = _r; $f._r$1 = _r$1; $f.a = a; $f.a$1 = a$1; $f.c = c; $f.fl = fl; $f.fl$1 = fl$1; $f.fl$2 = fl$2; $f.i = i; $f.k = k; $f.s = s; $f.str = str; $f.tt = tt; $f.tt$1 = tt$1; $f.typ = typ; $f.typ$1 = typ$1; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.Index = function(i) { return this.$val.Index(i); };
	Value.ptr.prototype.InterfaceData = function() {
		var v;
		v = this;
		$panic(new $String("InterfaceData is not supported by GopherJS"));
	};
	Value.prototype.InterfaceData = function() { return this.$val.InterfaceData(); };
	Value.ptr.prototype.IsNil = function() {
		var _1, k, v;
		v = this;
		k = new flag(v.flag).kind();
		_1 = k;
		if ((_1 === (22)) || (_1 === (23))) {
			return $clone(v, Value).object() === jsType(v.typ).nil;
		} else if (_1 === (18)) {
			return $clone(v, Value).object() === $chanNil;
		} else if (_1 === (19)) {
			return $clone(v, Value).object() === $throwNilPointerError;
		} else if (_1 === (21)) {
			return $clone(v, Value).object() === false;
		} else if (_1 === (20)) {
			return $clone(v, Value).object() === $ifaceNil;
		} else if (_1 === (26)) {
			return $clone(v, Value).object() === 0;
		} else {
			$panic(new ValueError.ptr("reflect.Value.IsNil", k));
		}
	};
	Value.prototype.IsNil = function() { return this.$val.IsNil(); };
	Value.ptr.prototype.Len = function() {
		var _1, k, v;
		v = this;
		k = new flag(v.flag).kind();
		_1 = k;
		if ((_1 === (17)) || (_1 === (24))) {
			return $parseInt($clone(v, Value).object().length);
		} else if (_1 === (23)) {
			return $parseInt($clone(v, Value).object().$length) >> 0;
		} else if (_1 === (18)) {
			return $parseInt($clone(v, Value).object().$buffer.length) >> 0;
		} else if (_1 === (21)) {
			return $parseInt($keys($clone(v, Value).object()).length);
		} else {
			$panic(new ValueError.ptr("reflect.Value.Len", k));
		}
	};
	Value.prototype.Len = function() { return this.$val.Len(); };
	Value.ptr.prototype.Pointer = function() {
		var _1, k, v;
		v = this;
		k = new flag(v.flag).kind();
		_1 = k;
		if ((_1 === (18)) || (_1 === (21)) || (_1 === (22)) || (_1 === (26))) {
			if ($clone(v, Value).IsNil()) {
				return 0;
			}
			return $clone(v, Value).object();
		} else if (_1 === (19)) {
			if ($clone(v, Value).IsNil()) {
				return 0;
			}
			return 1;
		} else if (_1 === (23)) {
			if ($clone(v, Value).IsNil()) {
				return 0;
			}
			return $clone(v, Value).object().$array;
		} else {
			$panic(new ValueError.ptr("reflect.Value.Pointer", k));
		}
	};
	Value.prototype.Pointer = function() { return this.$val.Pointer(); };
	Value.ptr.prototype.Set = function(x) {
		var _1, _r, _r$1, v, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _1 = $f._1; _r = $f._r; _r$1 = $f._r$1; v = $f.v; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(x.flag).mustBeExported();
		_r = $clone(x, Value).assignTo("reflect.Set", v.typ, 0); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		Value.copy(x, _r);
		/* */ if (!((((v.flag & 128) >>> 0) === 0))) { $s = 2; continue; }
		/* */ $s = 3; continue;
		/* if (!((((v.flag & 128) >>> 0) === 0))) { */ case 2:
				_1 = v.typ.Kind();
				/* */ if (_1 === (17)) { $s = 5; continue; }
				/* */ if (_1 === (20)) { $s = 6; continue; }
				/* */ if (_1 === (25)) { $s = 7; continue; }
				/* */ $s = 8; continue;
				/* if (_1 === (17)) { */ case 5:
					jsType(v.typ).copy(v.ptr, x.ptr);
					$s = 9; continue;
				/* } else if (_1 === (20)) { */ case 6:
					_r$1 = valueInterface($clone(x, Value)); /* */ $s = 10; case 10: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
					v.ptr.$set(_r$1);
					$s = 9; continue;
				/* } else if (_1 === (25)) { */ case 7:
					copyStruct(v.ptr, x.ptr, v.typ);
					$s = 9; continue;
				/* } else { */ case 8:
					v.ptr.$set($clone(x, Value).object());
				/* } */ case 9:
			case 4:
			$s = -1; return;
		/* } */ case 3:
		v.ptr = x.ptr;
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.Set }; } $f._1 = _1; $f._r = _r; $f._r$1 = _r$1; $f.v = v; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.Set = function(x) { return this.$val.Set(x); };
	Value.ptr.prototype.SetBytes = function(x) {
		var _r, _r$1, _v, slice, typedSlice, v, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _v = $f._v; slice = $f.slice; typedSlice = $f.typedSlice; v = $f.v; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(v.flag).mustBe(23);
		_r = v.typ.Elem().Kind(); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		/* */ if (!((_r === 8))) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!((_r === 8))) { */ case 1:
			$panic(new $String("reflect.Value.SetBytes of non-byte slice"));
		/* } */ case 2:
		slice = x;
		if (!(v.typ.Name() === "")) { _v = true; $s = 6; continue s; }
		_r$1 = v.typ.Elem().Name(); /* */ $s = 7; case 7: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_v = !(_r$1 === ""); case 6:
		/* */ if (_v) { $s = 4; continue; }
		/* */ $s = 5; continue;
		/* if (_v) { */ case 4:
			typedSlice = new (jsType(v.typ))(slice.$array);
			typedSlice.$offset = slice.$offset;
			typedSlice.$length = slice.$length;
			typedSlice.$capacity = slice.$capacity;
			slice = typedSlice;
		/* } */ case 5:
		v.ptr.$set(slice);
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.SetBytes }; } $f._r = _r; $f._r$1 = _r$1; $f._v = _v; $f.slice = slice; $f.typedSlice = typedSlice; $f.v = v; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.SetBytes = function(x) { return this.$val.SetBytes(x); };
	Value.ptr.prototype.SetCap = function(n) {
		var n, newSlice, s, v;
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(v.flag).mustBe(23);
		s = v.ptr.$get();
		if (n < ($parseInt(s.$length) >> 0) || n > ($parseInt(s.$capacity) >> 0)) {
			$panic(new $String("reflect: slice capacity out of range in SetCap"));
		}
		newSlice = new (jsType(v.typ))(s.$array);
		newSlice.$offset = s.$offset;
		newSlice.$length = s.$length;
		newSlice.$capacity = n;
		v.ptr.$set(newSlice);
	};
	Value.prototype.SetCap = function(n) { return this.$val.SetCap(n); };
	Value.ptr.prototype.SetLen = function(n) {
		var n, newSlice, s, v;
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(v.flag).mustBe(23);
		s = v.ptr.$get();
		if (n < 0 || n > ($parseInt(s.$capacity) >> 0)) {
			$panic(new $String("reflect: slice length out of range in SetLen"));
		}
		newSlice = new (jsType(v.typ))(s.$array);
		newSlice.$offset = s.$offset;
		newSlice.$length = n;
		newSlice.$capacity = s.$capacity;
		v.ptr.$set(newSlice);
	};
	Value.prototype.SetLen = function(n) { return this.$val.SetLen(n); };
	Value.ptr.prototype.Slice = function(i, j) {
		var _1, _r, _r$1, cap, i, j, kind, s, str, tt, typ, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _1 = $f._1; _r = $f._r; _r$1 = $f._r$1; cap = $f.cap; i = $f.i; j = $f.j; kind = $f.kind; s = $f.s; str = $f.str; tt = $f.tt; typ = $f.typ; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		cap = 0;
		typ = $ifaceNil;
		s = null;
			kind = new flag(v.flag).kind();
			_1 = kind;
			/* */ if (_1 === (17)) { $s = 2; continue; }
			/* */ if (_1 === (23)) { $s = 3; continue; }
			/* */ if (_1 === (24)) { $s = 4; continue; }
			/* */ $s = 5; continue;
			/* if (_1 === (17)) { */ case 2:
				if (((v.flag & 256) >>> 0) === 0) {
					$panic(new $String("reflect.Value.Slice: slice of unaddressable array"));
				}
				tt = (v.typ.kindType);
				cap = ((tt.len >> 0));
				typ = SliceOf(tt.elem);
				s = new (jsType(typ))($clone(v, Value).object());
				$s = 6; continue;
			/* } else if (_1 === (23)) { */ case 3:
				typ = v.typ;
				s = $clone(v, Value).object();
				cap = $parseInt(s.$capacity) >> 0;
				$s = 6; continue;
			/* } else if (_1 === (24)) { */ case 4:
				str = (v.ptr).$get();
				if (i < 0 || j < i || j > str.length) {
					$panic(new $String("reflect.Value.Slice: string slice index out of bounds"));
				}
				_r = ValueOf(new $String($substring(str, i, j))); /* */ $s = 7; case 7: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				$s = -1; return _r;
			/* } else { */ case 5:
				$panic(new ValueError.ptr("reflect.Value.Slice", kind));
			/* } */ case 6:
		case 1:
		if (i < 0 || j < i || j > cap) {
			$panic(new $String("reflect.Value.Slice: slice index out of bounds"));
		}
		_r$1 = makeValue(typ, $subslice(s, i, j), new flag(v.flag).ro()); /* */ $s = 8; case 8: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		$s = -1; return _r$1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.Slice }; } $f._1 = _1; $f._r = _r; $f._r$1 = _r$1; $f.cap = cap; $f.i = i; $f.j = j; $f.kind = kind; $f.s = s; $f.str = str; $f.tt = tt; $f.typ = typ; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.Slice = function(i, j) { return this.$val.Slice(i, j); };
	Value.ptr.prototype.Slice3 = function(i, j, k) {
		var _1, _r, cap, i, j, k, kind, s, tt, typ, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _1 = $f._1; _r = $f._r; cap = $f.cap; i = $f.i; j = $f.j; k = $f.k; kind = $f.kind; s = $f.s; tt = $f.tt; typ = $f.typ; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		cap = 0;
		typ = $ifaceNil;
		s = null;
		kind = new flag(v.flag).kind();
		_1 = kind;
		if (_1 === (17)) {
			if (((v.flag & 256) >>> 0) === 0) {
				$panic(new $String("reflect.Value.Slice: slice of unaddressable array"));
			}
			tt = (v.typ.kindType);
			cap = ((tt.len >> 0));
			typ = SliceOf(tt.elem);
			s = new (jsType(typ))($clone(v, Value).object());
		} else if (_1 === (23)) {
			typ = v.typ;
			s = $clone(v, Value).object();
			cap = $parseInt(s.$capacity) >> 0;
		} else {
			$panic(new ValueError.ptr("reflect.Value.Slice3", kind));
		}
		if (i < 0 || j < i || k < j || k > cap) {
			$panic(new $String("reflect.Value.Slice3: slice index out of bounds"));
		}
		_r = makeValue(typ, $subslice(s, i, j, k), new flag(v.flag).ro()); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.Slice3 }; } $f._1 = _1; $f._r = _r; $f.cap = cap; $f.i = i; $f.j = j; $f.k = k; $f.kind = kind; $f.s = s; $f.tt = tt; $f.typ = typ; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.Slice3 = function(i, j, k) { return this.$val.Slice3(i, j, k); };
	Value.ptr.prototype.Close = function() {
		var v;
		v = this;
		new flag(v.flag).mustBe(18);
		new flag(v.flag).mustBeExported();
		$close($clone(v, Value).object());
	};
	Value.prototype.Close = function() { return this.$val.Close(); };
	Value.ptr.prototype.Elem = function() {
		var _1, _r, fl, k, tt, typ, v, val, val$1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _1 = $f._1; _r = $f._r; fl = $f.fl; k = $f.k; tt = $f.tt; typ = $f.typ; v = $f.v; val = $f.val; val$1 = $f.val$1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
			k = new flag(v.flag).kind();
			_1 = k;
			/* */ if (_1 === (20)) { $s = 2; continue; }
			/* */ if (_1 === (22)) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (_1 === (20)) { */ case 2:
				val = $clone(v, Value).object();
				if (val === $ifaceNil) {
					$s = -1; return new Value.ptr(ptrType$1.nil, 0, 0);
				}
				typ = reflectType(val.constructor);
				_r = makeValue(typ, val.$val, new flag(v.flag).ro()); /* */ $s = 6; case 6: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				$s = -1; return _r;
			/* } else if (_1 === (22)) { */ case 3:
				if ($clone(v, Value).IsNil()) {
					$s = -1; return new Value.ptr(ptrType$1.nil, 0, 0);
				}
				val$1 = $clone(v, Value).object();
				tt = (v.typ.kindType);
				fl = (((((v.flag & 96) >>> 0) | 128) >>> 0) | 256) >>> 0;
				fl = (fl | (((tt.elem.Kind() >>> 0)))) >>> 0;
				$s = -1; return new Value.ptr(tt.elem, (wrapJsObject(tt.elem, val$1)), fl);
			/* } else { */ case 4:
				$panic(new ValueError.ptr("reflect.Value.Elem", k));
			/* } */ case 5:
		case 1:
		$s = -1; return new Value.ptr(ptrType$1.nil, 0, 0);
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.Elem }; } $f._1 = _1; $f._r = _r; $f.fl = fl; $f.k = k; $f.tt = tt; $f.typ = typ; $f.v = v; $f.val = val; $f.val$1 = val$1; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.Elem = function() { return this.$val.Elem(); };
	Value.ptr.prototype.NumField = function() {
		var tt, v;
		v = this;
		new flag(v.flag).mustBe(25);
		tt = (v.typ.kindType);
		return tt.fields.$length;
	};
	Value.prototype.NumField = function() { return this.$val.NumField(); };
	Value.ptr.prototype.MapKeys = function() {
		var _r, a, fl, i, it, key, keyType, m, mlen, tt, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; a = $f.a; fl = $f.fl; i = $f.i; it = $f.it; key = $f.key; keyType = $f.keyType; m = $f.m; mlen = $f.mlen; tt = $f.tt; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		new flag(v.flag).mustBe(21);
		tt = (v.typ.kindType);
		keyType = tt.key;
		fl = (new flag(v.flag).ro() | ((keyType.Kind() >>> 0))) >>> 0;
		m = $clone(v, Value).pointer();
		mlen = 0;
		if (!(m === 0)) {
			mlen = maplen(m);
		}
		it = mapiterinit(v.typ, m);
		a = $makeSlice(sliceType$9, mlen);
		i = 0;
		i = 0;
		/* while (true) { */ case 1:
			/* if (!(i < a.$length)) { break; } */ if(!(i < a.$length)) { $s = 2; continue; }
			_r = mapiterkey(it); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			key = _r;
			if (key === 0) {
				/* break; */ $s = 2; continue;
			}
			Value.copy(((i < 0 || i >= a.$length) ? ($throwRuntimeError("index out of range"), undefined) : a.$array[a.$offset + i]), copyVal(keyType, fl, key));
			mapiternext(it);
			i = i + (1) >> 0;
		/* } */ $s = 1; continue; case 2:
		$s = -1; return $subslice(a, 0, i);
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.MapKeys }; } $f._r = _r; $f.a = a; $f.fl = fl; $f.i = i; $f.it = it; $f.key = key; $f.keyType = keyType; $f.m = m; $f.mlen = mlen; $f.tt = tt; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.MapKeys = function() { return this.$val.MapKeys(); };
	Value.ptr.prototype.MapIndex = function(key) {
		var _r, e, fl, k, key, tt, typ, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; e = $f.e; fl = $f.fl; k = $f.k; key = $f.key; tt = $f.tt; typ = $f.typ; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		new flag(v.flag).mustBe(21);
		tt = (v.typ.kindType);
		_r = $clone(key, Value).assignTo("reflect.Value.MapIndex", tt.key, 0); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		Value.copy(key, _r);
		k = 0;
		if (!((((key.flag & 128) >>> 0) === 0))) {
			k = key.ptr;
		} else {
			k = ((key.$ptr_ptr || (key.$ptr_ptr = new ptrType$8(function() { return this.$target.ptr; }, function($v) { this.$target.ptr = $v; }, key))));
		}
		e = mapaccess(v.typ, $clone(v, Value).pointer(), k);
		if (e === 0) {
			$s = -1; return new Value.ptr(ptrType$1.nil, 0, 0);
		}
		typ = tt.elem;
		fl = new flag((((v.flag | key.flag) >>> 0))).ro();
		fl = (fl | (((typ.Kind() >>> 0)))) >>> 0;
		$s = -1; return copyVal(typ, fl, e);
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.MapIndex }; } $f._r = _r; $f.e = e; $f.fl = fl; $f.k = k; $f.key = key; $f.tt = tt; $f.typ = typ; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.MapIndex = function(key) { return this.$val.MapIndex(key); };
	Value.ptr.prototype.Field = function(i) {
		var _r, _r$1, _r$2, field, fl, i, jsTag, o, prop, s, tag, tt, typ, v, x, x$1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; field = $f.field; fl = $f.fl; i = $f.i; jsTag = $f.jsTag; o = $f.o; prop = $f.prop; s = $f.s; tag = $f.tag; tt = $f.tt; typ = $f.typ; v = $f.v; x = $f.x; x$1 = $f.x$1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		jsTag = [jsTag];
		prop = [prop];
		s = [s];
		typ = [typ];
		v = this;
		if (!((new flag(v.flag).kind() === 25))) {
			$panic(new ValueError.ptr("reflect.Value.Field", new flag(v.flag).kind()));
		}
		tt = (v.typ.kindType);
		if (((i >>> 0)) >= ((tt.fields.$length >>> 0))) {
			$panic(new $String("reflect: Field index out of range"));
		}
		prop[0] = $internalize(jsType(v.typ).fields[i].prop, $String);
		field = (x = tt.fields, ((i < 0 || i >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + i]));
		typ[0] = field.typ;
		fl = (((v.flag & 416) >>> 0) | ((typ[0].Kind() >>> 0))) >>> 0;
		if (!$clone(field.name, name).isExported()) {
			if (field.embedded()) {
				fl = (fl | (64)) >>> 0;
			} else {
				fl = (fl | (32)) >>> 0;
			}
		}
		tag = $clone((x$1 = tt.fields, ((i < 0 || i >= x$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$1.$array[x$1.$offset + i])).name, name).tag();
		/* */ if (!(tag === "") && !((i === 0))) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!(tag === "") && !((i === 0))) { */ case 1:
			jsTag[0] = getJsTag(tag);
			/* */ if (!(jsTag[0] === "")) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (!(jsTag[0] === "")) { */ case 3:
				/* while (true) { */ case 5:
					o = [o];
					_r = $clone(v, Value).Field(0); /* */ $s = 7; case 7: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
					Value.copy(v, _r);
					/* */ if (v.typ === jsObjectPtr) { $s = 8; continue; }
					/* */ $s = 9; continue;
					/* if (v.typ === jsObjectPtr) { */ case 8:
						o[0] = $clone(v, Value).object().object;
						$s = -1; return new Value.ptr(typ[0], (new (jsType(PtrTo(typ[0])))((function(jsTag, o, prop, s, typ) { return function() {
							return $internalize(o[0][$externalize(jsTag[0], $String)], jsType(typ[0]));
						}; })(jsTag, o, prop, s, typ), (function(jsTag, o, prop, s, typ) { return function(x$2) {
							var x$2;
							o[0][$externalize(jsTag[0], $String)] = $externalize(x$2, jsType(typ[0]));
						}; })(jsTag, o, prop, s, typ))), fl);
					/* } */ case 9:
					/* */ if (v.typ.Kind() === 22) { $s = 10; continue; }
					/* */ $s = 11; continue;
					/* if (v.typ.Kind() === 22) { */ case 10:
						_r$1 = $clone(v, Value).Elem(); /* */ $s = 12; case 12: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
						Value.copy(v, _r$1);
					/* } */ case 11:
				/* } */ $s = 5; continue; case 6:
			/* } */ case 4:
		/* } */ case 2:
		s[0] = v.ptr;
		/* */ if (!((((fl & 128) >>> 0) === 0)) && !((typ[0].Kind() === 17)) && !((typ[0].Kind() === 25))) { $s = 13; continue; }
		/* */ $s = 14; continue;
		/* if (!((((fl & 128) >>> 0) === 0)) && !((typ[0].Kind() === 17)) && !((typ[0].Kind() === 25))) { */ case 13:
			$s = -1; return new Value.ptr(typ[0], (new (jsType(PtrTo(typ[0])))((function(jsTag, prop, s, typ) { return function() {
				return wrapJsObject(typ[0], s[0][$externalize(prop[0], $String)]);
			}; })(jsTag, prop, s, typ), (function(jsTag, prop, s, typ) { return function(x$2) {
				var x$2;
				s[0][$externalize(prop[0], $String)] = unwrapJsObject(typ[0], x$2);
			}; })(jsTag, prop, s, typ))), fl);
		/* } */ case 14:
		_r$2 = makeValue(typ[0], wrapJsObject(typ[0], s[0][$externalize(prop[0], $String)]), fl); /* */ $s = 15; case 15: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		$s = -1; return _r$2;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.Field }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f.field = field; $f.fl = fl; $f.i = i; $f.jsTag = jsTag; $f.o = o; $f.prop = prop; $f.s = s; $f.tag = tag; $f.tt = tt; $f.typ = typ; $f.v = v; $f.x = x; $f.x$1 = x$1; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.Field = function(i) { return this.$val.Field(i); };
	structField.ptr.prototype.embedded = function() {
		var f;
		f = this;
		return !((((f.offsetEmbed & 1) >>> 0) === 0));
	};
	structField.prototype.embedded = function() { return this.$val.embedded(); };
	Kind.prototype.String = function() {
		var k;
		k = this.$val;
		if (((k >> 0)) < kindNames.$length) {
			return ((k < 0 || k >= kindNames.$length) ? ($throwRuntimeError("index out of range"), undefined) : kindNames.$array[kindNames.$offset + k]);
		}
		return (0 >= kindNames.$length ? ($throwRuntimeError("index out of range"), undefined) : kindNames.$array[kindNames.$offset + 0]);
	};
	$ptrType(Kind).prototype.String = function() { return new Kind(this.$get()).String(); };
	rtype.ptr.prototype.String = function() {
		var s, t;
		t = this;
		s = $clone(t.nameOff(t.str), name).name();
		if (!((((t.tflag & 2) >>> 0) === 0))) {
			return $substring(s, 1);
		}
		return s;
	};
	rtype.prototype.String = function() { return this.$val.String(); };
	rtype.ptr.prototype.Size = function() {
		var t;
		t = this;
		return t.size;
	};
	rtype.prototype.Size = function() { return this.$val.Size(); };
	rtype.ptr.prototype.Kind = function() {
		var t;
		t = this;
		return ((((t.kind & 31) >>> 0) >>> 0));
	};
	rtype.prototype.Kind = function() { return this.$val.Kind(); };
	rtype.ptr.prototype.pointers = function() {
		var t;
		t = this;
		return !((t.ptrdata === 0));
	};
	rtype.prototype.pointers = function() { return this.$val.pointers(); };
	rtype.ptr.prototype.common = function() {
		var t;
		t = this;
		return t;
	};
	rtype.prototype.common = function() { return this.$val.common(); };
	rtype.ptr.prototype.exportedMethods = function() {
		var t, ut;
		t = this;
		ut = t.uncommon();
		if (ut === ptrType$4.nil) {
			return sliceType$5.nil;
		}
		return ut.exportedMethods();
	};
	rtype.prototype.exportedMethods = function() { return this.$val.exportedMethods(); };
	rtype.ptr.prototype.NumMethod = function() {
		var t, tt;
		t = this;
		if (t.Kind() === 20) {
			tt = (t.kindType);
			return tt.NumMethod();
		}
		return t.exportedMethods().$length;
	};
	rtype.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	rtype.ptr.prototype.PkgPath = function() {
		var t, ut;
		t = this;
		if (((t.tflag & 4) >>> 0) === 0) {
			return "";
		}
		ut = t.uncommon();
		if (ut === ptrType$4.nil) {
			return "";
		}
		return $clone(t.nameOff(ut.pkgPath), name).name();
	};
	rtype.prototype.PkgPath = function() { return this.$val.PkgPath(); };
	rtype.ptr.prototype.hasName = function() {
		var t;
		t = this;
		return !((((t.tflag & 4) >>> 0) === 0));
	};
	rtype.prototype.hasName = function() { return this.$val.hasName(); };
	rtype.ptr.prototype.Name = function() {
		var i, s, t;
		t = this;
		if (!t.hasName()) {
			return "";
		}
		s = t.String();
		i = s.length - 1 >> 0;
		while (true) {
			if (!(i >= 0 && !((s.charCodeAt(i) === 46)))) { break; }
			i = i - (1) >> 0;
		}
		return $substring(s, (i + 1 >> 0));
	};
	rtype.prototype.Name = function() { return this.$val.Name(); };
	rtype.ptr.prototype.chanDir = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 18))) {
			$panic(new $String("reflect: chanDir of non-chan type"));
		}
		tt = (t.kindType);
		return ((tt.dir >> 0));
	};
	rtype.prototype.chanDir = function() { return this.$val.chanDir(); };
	rtype.ptr.prototype.Elem = function() {
		var _1, t, tt, tt$1, tt$2, tt$3, tt$4;
		t = this;
		_1 = t.Kind();
		if (_1 === (17)) {
			tt = (t.kindType);
			return toType(tt.elem);
		} else if (_1 === (18)) {
			tt$1 = (t.kindType);
			return toType(tt$1.elem);
		} else if (_1 === (21)) {
			tt$2 = (t.kindType);
			return toType(tt$2.elem);
		} else if (_1 === (22)) {
			tt$3 = (t.kindType);
			return toType(tt$3.elem);
		} else if (_1 === (23)) {
			tt$4 = (t.kindType);
			return toType(tt$4.elem);
		}
		$panic(new $String("reflect: Elem of invalid type"));
	};
	rtype.prototype.Elem = function() { return this.$val.Elem(); };
	rtype.ptr.prototype.In = function(i) {
		var i, t, tt, x;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: In of non-func type"));
		}
		tt = (t.kindType);
		return toType((x = tt.in$(), ((i < 0 || i >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + i])));
	};
	rtype.prototype.In = function(i) { return this.$val.In(i); };
	rtype.ptr.prototype.Len = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 17))) {
			$panic(new $String("reflect: Len of non-array type"));
		}
		tt = (t.kindType);
		return ((tt.len >> 0));
	};
	rtype.prototype.Len = function() { return this.$val.Len(); };
	rtype.ptr.prototype.NumIn = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: NumIn of non-func type"));
		}
		tt = (t.kindType);
		return ((tt.inCount >> 0));
	};
	rtype.prototype.NumIn = function() { return this.$val.NumIn(); };
	rtype.ptr.prototype.NumOut = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: NumOut of non-func type"));
		}
		tt = (t.kindType);
		return tt.out().$length;
	};
	rtype.prototype.NumOut = function() { return this.$val.NumOut(); };
	rtype.ptr.prototype.Out = function(i) {
		var i, t, tt, x;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: Out of non-func type"));
		}
		tt = (t.kindType);
		return toType((x = tt.out(), ((i < 0 || i >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + i])));
	};
	rtype.prototype.Out = function(i) { return this.$val.Out(i); };
	interfaceType.ptr.prototype.NumMethod = function() {
		var t;
		t = this;
		return t.methods.$length;
	};
	interfaceType.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	rtype.ptr.prototype.Implements = function(u) {
		var _r, t, u, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; t = $f.t; u = $f.u; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		if ($interfaceIsEqual(u, $ifaceNil)) {
			$panic(new $String("reflect: nil type passed to Type.Implements"));
		}
		_r = u.Kind(); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		/* */ if (!((_r === 20))) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!((_r === 20))) { */ case 1:
			$panic(new $String("reflect: non-interface type passed to Type.Implements"));
		/* } */ case 2:
		$s = -1; return implements$1($assertType(u, ptrType$1), t);
		/* */ } return; } if ($f === undefined) { $f = { $blk: rtype.ptr.prototype.Implements }; } $f._r = _r; $f.t = t; $f.u = u; $f.$s = $s; $f.$r = $r; return $f;
	};
	rtype.prototype.Implements = function(u) { return this.$val.Implements(u); };
	rtype.ptr.prototype.AssignableTo = function(u) {
		var _r, t, u, uu, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; t = $f.t; u = $f.u; uu = $f.uu; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		if ($interfaceIsEqual(u, $ifaceNil)) {
			$panic(new $String("reflect: nil type passed to Type.AssignableTo"));
		}
		uu = $assertType(u, ptrType$1);
		_r = directlyAssignable(uu, t); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r || implements$1(uu, t);
		/* */ } return; } if ($f === undefined) { $f = { $blk: rtype.ptr.prototype.AssignableTo }; } $f._r = _r; $f.t = t; $f.u = u; $f.uu = uu; $f.$s = $s; $f.$r = $r; return $f;
	};
	rtype.prototype.AssignableTo = function(u) { return this.$val.AssignableTo(u); };
	implements$1 = function(T, V) {
		var T, V, i, i$1, j, j$1, t, tm, tm$1, tmName, tmName$1, tmPkgPath, tmPkgPath$1, v, v$1, vm, vm$1, vmName, vmName$1, vmPkgPath, vmPkgPath$1, vmethods, x, x$1, x$2;
		if (!((T.Kind() === 20))) {
			return false;
		}
		t = (T.kindType);
		if (t.methods.$length === 0) {
			return true;
		}
		if (V.Kind() === 20) {
			v = (V.kindType);
			i = 0;
			j = 0;
			while (true) {
				if (!(j < v.methods.$length)) { break; }
				tm = (x = t.methods, ((i < 0 || i >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + i]));
				tmName = $clone(t.rtype.nameOff(tm.name), name);
				vm = (x$1 = v.methods, ((j < 0 || j >= x$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$1.$array[x$1.$offset + j]));
				vmName = $clone(V.nameOff(vm.name), name);
				if ($clone(vmName, name).name() === $clone(tmName, name).name() && V.typeOff(vm.typ) === t.rtype.typeOff(tm.typ)) {
					if (!$clone(tmName, name).isExported()) {
						tmPkgPath = $clone(tmName, name).pkgPath();
						if (tmPkgPath === "") {
							tmPkgPath = $clone(t.pkgPath, name).name();
						}
						vmPkgPath = $clone(vmName, name).pkgPath();
						if (vmPkgPath === "") {
							vmPkgPath = $clone(v.pkgPath, name).name();
						}
						if (!(tmPkgPath === vmPkgPath)) {
							j = j + (1) >> 0;
							continue;
						}
					}
					i = i + (1) >> 0;
					if (i >= t.methods.$length) {
						return true;
					}
				}
				j = j + (1) >> 0;
			}
			return false;
		}
		v$1 = V.uncommon();
		if (v$1 === ptrType$4.nil) {
			return false;
		}
		i$1 = 0;
		vmethods = v$1.methods();
		j$1 = 0;
		while (true) {
			if (!(j$1 < ((v$1.mcount >> 0)))) { break; }
			tm$1 = (x$2 = t.methods, ((i$1 < 0 || i$1 >= x$2.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$2.$array[x$2.$offset + i$1]));
			tmName$1 = $clone(t.rtype.nameOff(tm$1.name), name);
			vm$1 = $clone(((j$1 < 0 || j$1 >= vmethods.$length) ? ($throwRuntimeError("index out of range"), undefined) : vmethods.$array[vmethods.$offset + j$1]), method);
			vmName$1 = $clone(V.nameOff(vm$1.name), name);
			if ($clone(vmName$1, name).name() === $clone(tmName$1, name).name() && V.typeOff(vm$1.mtyp) === t.rtype.typeOff(tm$1.typ)) {
				if (!$clone(tmName$1, name).isExported()) {
					tmPkgPath$1 = $clone(tmName$1, name).pkgPath();
					if (tmPkgPath$1 === "") {
						tmPkgPath$1 = $clone(t.pkgPath, name).name();
					}
					vmPkgPath$1 = $clone(vmName$1, name).pkgPath();
					if (vmPkgPath$1 === "") {
						vmPkgPath$1 = $clone(V.nameOff(v$1.pkgPath), name).name();
					}
					if (!(tmPkgPath$1 === vmPkgPath$1)) {
						j$1 = j$1 + (1) >> 0;
						continue;
					}
				}
				i$1 = i$1 + (1) >> 0;
				if (i$1 >= t.methods.$length) {
					return true;
				}
			}
			j$1 = j$1 + (1) >> 0;
		}
		return false;
	};
	directlyAssignable = function(T, V) {
		var T, V, _r, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; T = $f.T; V = $f.V; _r = $f._r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		if (T === V) {
			$s = -1; return true;
		}
		if (T.hasName() && V.hasName() || !((T.Kind() === V.Kind()))) {
			$s = -1; return false;
		}
		_r = haveIdenticalUnderlyingType(T, V, true); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: directlyAssignable }; } $f.T = T; $f.V = V; $f._r = _r; $f.$s = $s; $f.$r = $r; return $f;
	};
	haveIdenticalType = function(T, V, cmpTags) {
		var T, V, _arg, _arg$1, _r, _r$1, _r$2, _r$3, _r$4, _r$5, _r$6, _v, cmpTags, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; T = $f.T; V = $f.V; _arg = $f._arg; _arg$1 = $f._arg$1; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _r$5 = $f._r$5; _r$6 = $f._r$6; _v = $f._v; cmpTags = $f.cmpTags; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		if (cmpTags) {
			$s = -1; return $interfaceIsEqual(T, V);
		}
		_r = T.Name(); /* */ $s = 4; case 4: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_r$1 = V.Name(); /* */ $s = 5; case 5: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		if (!(_r === _r$1)) { _v = true; $s = 3; continue s; }
		_r$2 = T.Kind(); /* */ $s = 6; case 6: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		_r$3 = V.Kind(); /* */ $s = 7; case 7: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
		_v = !((_r$2 === _r$3)); case 3:
		/* */ if (_v) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (_v) { */ case 1:
			$s = -1; return false;
		/* } */ case 2:
		_r$4 = T.common(); /* */ $s = 8; case 8: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
		_arg = _r$4;
		_r$5 = V.common(); /* */ $s = 9; case 9: if($c) { $c = false; _r$5 = _r$5.$blk(); } if (_r$5 && _r$5.$blk !== undefined) { break s; }
		_arg$1 = _r$5;
		_r$6 = haveIdenticalUnderlyingType(_arg, _arg$1, false); /* */ $s = 10; case 10: if($c) { $c = false; _r$6 = _r$6.$blk(); } if (_r$6 && _r$6.$blk !== undefined) { break s; }
		$s = -1; return _r$6;
		/* */ } return; } if ($f === undefined) { $f = { $blk: haveIdenticalType }; } $f.T = T; $f.V = V; $f._arg = _arg; $f._arg$1 = _arg$1; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._r$5 = _r$5; $f._r$6 = _r$6; $f._v = _v; $f.cmpTags = cmpTags; $f.$s = $s; $f.$r = $r; return $f;
	};
	haveIdenticalUnderlyingType = function(T, V, cmpTags) {
		var T, V, _1, _i, _r, _r$1, _r$2, _r$3, _r$4, _r$5, _r$6, _r$7, _r$8, _ref, _v, _v$1, _v$2, _v$3, cmpTags, i, i$1, i$2, kind, t, t$1, t$2, tf, v, v$1, v$2, vf, x, x$1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; T = $f.T; V = $f.V; _1 = $f._1; _i = $f._i; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _r$5 = $f._r$5; _r$6 = $f._r$6; _r$7 = $f._r$7; _r$8 = $f._r$8; _ref = $f._ref; _v = $f._v; _v$1 = $f._v$1; _v$2 = $f._v$2; _v$3 = $f._v$3; cmpTags = $f.cmpTags; i = $f.i; i$1 = $f.i$1; i$2 = $f.i$2; kind = $f.kind; t = $f.t; t$1 = $f.t$1; t$2 = $f.t$2; tf = $f.tf; v = $f.v; v$1 = $f.v$1; v$2 = $f.v$2; vf = $f.vf; x = $f.x; x$1 = $f.x$1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		if (T === V) {
			$s = -1; return true;
		}
		kind = T.Kind();
		if (!((kind === V.Kind()))) {
			$s = -1; return false;
		}
		if (1 <= kind && kind <= 16 || (kind === 24) || (kind === 26)) {
			$s = -1; return true;
		}
			_1 = kind;
			/* */ if (_1 === (17)) { $s = 2; continue; }
			/* */ if (_1 === (18)) { $s = 3; continue; }
			/* */ if (_1 === (19)) { $s = 4; continue; }
			/* */ if (_1 === (20)) { $s = 5; continue; }
			/* */ if (_1 === (21)) { $s = 6; continue; }
			/* */ if ((_1 === (22)) || (_1 === (23))) { $s = 7; continue; }
			/* */ if (_1 === (25)) { $s = 8; continue; }
			/* */ $s = 9; continue;
			/* if (_1 === (17)) { */ case 2:
				if (!(T.Len() === V.Len())) { _v = false; $s = 10; continue s; }
				_r = haveIdenticalType(T.Elem(), V.Elem(), cmpTags); /* */ $s = 11; case 11: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				_v = _r; case 10:
				$s = -1; return _v;
			/* } else if (_1 === (18)) { */ case 3:
				if (!(V.chanDir() === 3)) { _v$1 = false; $s = 14; continue s; }
				_r$1 = haveIdenticalType(T.Elem(), V.Elem(), cmpTags); /* */ $s = 15; case 15: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
				_v$1 = _r$1; case 14:
				/* */ if (_v$1) { $s = 12; continue; }
				/* */ $s = 13; continue;
				/* if (_v$1) { */ case 12:
					$s = -1; return true;
				/* } */ case 13:
				if (!(V.chanDir() === T.chanDir())) { _v$2 = false; $s = 16; continue s; }
				_r$2 = haveIdenticalType(T.Elem(), V.Elem(), cmpTags); /* */ $s = 17; case 17: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
				_v$2 = _r$2; case 16:
				$s = -1; return _v$2;
			/* } else if (_1 === (19)) { */ case 4:
				t = (T.kindType);
				v = (V.kindType);
				if (!((t.outCount === v.outCount)) || !((t.inCount === v.inCount))) {
					$s = -1; return false;
				}
				i = 0;
				/* while (true) { */ case 18:
					/* if (!(i < t.rtype.NumIn())) { break; } */ if(!(i < t.rtype.NumIn())) { $s = 19; continue; }
					_r$3 = haveIdenticalType(t.rtype.In(i), v.rtype.In(i), cmpTags); /* */ $s = 22; case 22: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
					/* */ if (!_r$3) { $s = 20; continue; }
					/* */ $s = 21; continue;
					/* if (!_r$3) { */ case 20:
						$s = -1; return false;
					/* } */ case 21:
					i = i + (1) >> 0;
				/* } */ $s = 18; continue; case 19:
				i$1 = 0;
				/* while (true) { */ case 23:
					/* if (!(i$1 < t.rtype.NumOut())) { break; } */ if(!(i$1 < t.rtype.NumOut())) { $s = 24; continue; }
					_r$4 = haveIdenticalType(t.rtype.Out(i$1), v.rtype.Out(i$1), cmpTags); /* */ $s = 27; case 27: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
					/* */ if (!_r$4) { $s = 25; continue; }
					/* */ $s = 26; continue;
					/* if (!_r$4) { */ case 25:
						$s = -1; return false;
					/* } */ case 26:
					i$1 = i$1 + (1) >> 0;
				/* } */ $s = 23; continue; case 24:
				$s = -1; return true;
			/* } else if (_1 === (20)) { */ case 5:
				t$1 = (T.kindType);
				v$1 = (V.kindType);
				if ((t$1.methods.$length === 0) && (v$1.methods.$length === 0)) {
					$s = -1; return true;
				}
				$s = -1; return false;
			/* } else if (_1 === (21)) { */ case 6:
				_r$5 = haveIdenticalType(T.Key(), V.Key(), cmpTags); /* */ $s = 29; case 29: if($c) { $c = false; _r$5 = _r$5.$blk(); } if (_r$5 && _r$5.$blk !== undefined) { break s; }
				if (!(_r$5)) { _v$3 = false; $s = 28; continue s; }
				_r$6 = haveIdenticalType(T.Elem(), V.Elem(), cmpTags); /* */ $s = 30; case 30: if($c) { $c = false; _r$6 = _r$6.$blk(); } if (_r$6 && _r$6.$blk !== undefined) { break s; }
				_v$3 = _r$6; case 28:
				$s = -1; return _v$3;
			/* } else if ((_1 === (22)) || (_1 === (23))) { */ case 7:
				_r$7 = haveIdenticalType(T.Elem(), V.Elem(), cmpTags); /* */ $s = 31; case 31: if($c) { $c = false; _r$7 = _r$7.$blk(); } if (_r$7 && _r$7.$blk !== undefined) { break s; }
				$s = -1; return _r$7;
			/* } else if (_1 === (25)) { */ case 8:
				t$2 = (T.kindType);
				v$2 = (V.kindType);
				if (!((t$2.fields.$length === v$2.fields.$length))) {
					$s = -1; return false;
				}
				if (!($clone(t$2.pkgPath, name).name() === $clone(v$2.pkgPath, name).name())) {
					$s = -1; return false;
				}
				_ref = t$2.fields;
				_i = 0;
				/* while (true) { */ case 32:
					/* if (!(_i < _ref.$length)) { break; } */ if(!(_i < _ref.$length)) { $s = 33; continue; }
					i$2 = _i;
					tf = (x = t$2.fields, ((i$2 < 0 || i$2 >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + i$2]));
					vf = (x$1 = v$2.fields, ((i$2 < 0 || i$2 >= x$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$1.$array[x$1.$offset + i$2]));
					if (!($clone(tf.name, name).name() === $clone(vf.name, name).name())) {
						$s = -1; return false;
					}
					_r$8 = haveIdenticalType(tf.typ, vf.typ, cmpTags); /* */ $s = 36; case 36: if($c) { $c = false; _r$8 = _r$8.$blk(); } if (_r$8 && _r$8.$blk !== undefined) { break s; }
					/* */ if (!_r$8) { $s = 34; continue; }
					/* */ $s = 35; continue;
					/* if (!_r$8) { */ case 34:
						$s = -1; return false;
					/* } */ case 35:
					if (cmpTags && !($clone(tf.name, name).tag() === $clone(vf.name, name).tag())) {
						$s = -1; return false;
					}
					if (!((tf.offsetEmbed === vf.offsetEmbed))) {
						$s = -1; return false;
					}
					_i++;
				/* } */ $s = 32; continue; case 33:
				$s = -1; return true;
			/* } */ case 9:
		case 1:
		$s = -1; return false;
		/* */ } return; } if ($f === undefined) { $f = { $blk: haveIdenticalUnderlyingType }; } $f.T = T; $f.V = V; $f._1 = _1; $f._i = _i; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._r$5 = _r$5; $f._r$6 = _r$6; $f._r$7 = _r$7; $f._r$8 = _r$8; $f._ref = _ref; $f._v = _v; $f._v$1 = _v$1; $f._v$2 = _v$2; $f._v$3 = _v$3; $f.cmpTags = cmpTags; $f.i = i; $f.i$1 = i$1; $f.i$2 = i$2; $f.kind = kind; $f.t = t; $f.t$1 = t$1; $f.t$2 = t$2; $f.tf = tf; $f.v = v; $f.v$1 = v$1; $f.v$2 = v$2; $f.vf = vf; $f.x = x; $f.x$1 = x$1; $f.$s = $s; $f.$r = $r; return $f;
	};
	toType = function(t) {
		var t;
		if (t === ptrType$1.nil) {
			return $ifaceNil;
		}
		return t;
	};
	ifaceIndir = function(t) {
		var t;
		return ((t.kind & 32) >>> 0) === 0;
	};
	flag.prototype.kind = function() {
		var f;
		f = this.$val;
		return ((((f & 31) >>> 0) >>> 0));
	};
	$ptrType(flag).prototype.kind = function() { return new flag(this.$get()).kind(); };
	flag.prototype.ro = function() {
		var f;
		f = this.$val;
		if (!((((f & 96) >>> 0) === 0))) {
			return 32;
		}
		return 0;
	};
	$ptrType(flag).prototype.ro = function() { return new flag(this.$get()).ro(); };
	Value.ptr.prototype.pointer = function() {
		var v;
		v = this;
		if (!((v.typ.size === 4)) || !v.typ.pointers()) {
			$panic(new $String("can't call pointer on a non-pointer Value"));
		}
		if (!((((v.flag & 128) >>> 0) === 0))) {
			return (v.ptr).$get();
		}
		return v.ptr;
	};
	Value.prototype.pointer = function() { return this.$val.pointer(); };
	ValueError.ptr.prototype.Error = function() {
		var e;
		e = this;
		if (e.Kind === 0) {
			return "reflect: call of " + e.Method + " on zero Value";
		}
		return "reflect: call of " + e.Method + " on " + new Kind(e.Kind).String() + " Value";
	};
	ValueError.prototype.Error = function() { return this.$val.Error(); };
	flag.prototype.mustBeExported = function() {
		var f;
		f = this.$val;
		if (f === 0) {
			$panic(new ValueError.ptr(methodName(), 0));
		}
		if (!((((f & 96) >>> 0) === 0))) {
			$panic(new $String("reflect: " + methodName() + " using value obtained using unexported field"));
		}
	};
	$ptrType(flag).prototype.mustBeExported = function() { return new flag(this.$get()).mustBeExported(); };
	flag.prototype.mustBeAssignable = function() {
		var f;
		f = this.$val;
		if (f === 0) {
			$panic(new ValueError.ptr(methodName(), 0));
		}
		if (!((((f & 96) >>> 0) === 0))) {
			$panic(new $String("reflect: " + methodName() + " using value obtained using unexported field"));
		}
		if (((f & 256) >>> 0) === 0) {
			$panic(new $String("reflect: " + methodName() + " using unaddressable value"));
		}
	};
	$ptrType(flag).prototype.mustBeAssignable = function() { return new flag(this.$get()).mustBeAssignable(); };
	Value.ptr.prototype.CanSet = function() {
		var v;
		v = this;
		return ((v.flag & 352) >>> 0) === 256;
	};
	Value.prototype.CanSet = function() { return this.$val.CanSet(); };
	Value.ptr.prototype.IsValid = function() {
		var v;
		v = this;
		return !((v.flag === 0));
	};
	Value.prototype.IsValid = function() { return this.$val.IsValid(); };
	Value.ptr.prototype.Kind = function() {
		var v;
		v = this;
		return new flag(v.flag).kind();
	};
	Value.prototype.Kind = function() { return this.$val.Kind(); };
	Value.ptr.prototype.Type = function() {
		var f, v;
		v = this;
		f = v.flag;
		if (f === 0) {
			$panic(new ValueError.ptr("reflectlite.Value.Type", 0));
		}
		return v.typ;
	};
	Value.prototype.Type = function() { return this.$val.Type(); };
	ptrType$4.methods = [{prop: "methods", name: "methods", pkg: "internal/reflectlite", typ: $funcType([], [sliceType$5], false)}, {prop: "exportedMethods", name: "exportedMethods", pkg: "internal/reflectlite", typ: $funcType([], [sliceType$5], false)}];
	ptrType$7.methods = [{prop: "in$", name: "in", pkg: "internal/reflectlite", typ: $funcType([], [sliceType$2], false)}, {prop: "out", name: "out", pkg: "internal/reflectlite", typ: $funcType([], [sliceType$2], false)}];
	name.methods = [{prop: "name", name: "name", pkg: "internal/reflectlite", typ: $funcType([], [$String], false)}, {prop: "tag", name: "tag", pkg: "internal/reflectlite", typ: $funcType([], [$String], false)}, {prop: "pkgPath", name: "pkgPath", pkg: "internal/reflectlite", typ: $funcType([], [$String], false)}, {prop: "isExported", name: "isExported", pkg: "internal/reflectlite", typ: $funcType([], [$Bool], false)}, {prop: "data", name: "data", pkg: "internal/reflectlite", typ: $funcType([$Int, $String], [ptrType$3], false)}, {prop: "nameLen", name: "nameLen", pkg: "internal/reflectlite", typ: $funcType([], [$Int], false)}, {prop: "tagLen", name: "tagLen", pkg: "internal/reflectlite", typ: $funcType([], [$Int], false)}];
	ptrType$6.methods = [{prop: "skipUntilValidKey", name: "skipUntilValidKey", pkg: "internal/reflectlite", typ: $funcType([], [], false)}];
	ptrType$10.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	Kind.methods = [{prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}];
	ptrType$1.methods = [{prop: "uncommon", name: "uncommon", pkg: "internal/reflectlite", typ: $funcType([], [ptrType$4], false)}, {prop: "nameOff", name: "nameOff", pkg: "internal/reflectlite", typ: $funcType([nameOff], [name], false)}, {prop: "typeOff", name: "typeOff", pkg: "internal/reflectlite", typ: $funcType([typeOff], [ptrType$1], false)}, {prop: "ptrTo", name: "ptrTo", pkg: "internal/reflectlite", typ: $funcType([], [ptrType$1], false)}, {prop: "Comparable", name: "Comparable", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "IsVariadic", name: "IsVariadic", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "kindType", name: "kindType", pkg: "internal/reflectlite", typ: $funcType([], [ptrType$1], false)}, {prop: "Field", name: "Field", pkg: "", typ: $funcType([$Int], [structField], false)}, {prop: "Key", name: "Key", pkg: "", typ: $funcType([], [Type], false)}, {prop: "NumField", name: "NumField", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Method", name: "Method", pkg: "", typ: $funcType([$Int], [Method], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Size", name: "Size", pkg: "", typ: $funcType([], [$Uintptr], false)}, {prop: "Kind", name: "Kind", pkg: "", typ: $funcType([], [Kind], false)}, {prop: "pointers", name: "pointers", pkg: "internal/reflectlite", typ: $funcType([], [$Bool], false)}, {prop: "common", name: "common", pkg: "internal/reflectlite", typ: $funcType([], [ptrType$1], false)}, {prop: "exportedMethods", name: "exportedMethods", pkg: "internal/reflectlite", typ: $funcType([], [sliceType$5], false)}, {prop: "NumMethod", name: "NumMethod", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "PkgPath", name: "PkgPath", pkg: "", typ: $funcType([], [$String], false)}, {prop: "hasName", name: "hasName", pkg: "internal/reflectlite", typ: $funcType([], [$Bool], false)}, {prop: "Name", name: "Name", pkg: "", typ: $funcType([], [$String], false)}, {prop: "chanDir", name: "chanDir", pkg: "internal/reflectlite", typ: $funcType([], [chanDir], false)}, {prop: "Elem", name: "Elem", pkg: "", typ: $funcType([], [Type], false)}, {prop: "In", name: "In", pkg: "", typ: $funcType([$Int], [Type], false)}, {prop: "Len", name: "Len", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "NumIn", name: "NumIn", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "NumOut", name: "NumOut", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Out", name: "Out", pkg: "", typ: $funcType([$Int], [Type], false)}, {prop: "Implements", name: "Implements", pkg: "", typ: $funcType([Type], [$Bool], false)}, {prop: "AssignableTo", name: "AssignableTo", pkg: "", typ: $funcType([Type], [$Bool], false)}];
	ptrType$11.methods = [{prop: "NumMethod", name: "NumMethod", pkg: "", typ: $funcType([], [$Int], false)}];
	ptrType$12.methods = [{prop: "offset", name: "offset", pkg: "internal/reflectlite", typ: $funcType([], [$Uintptr], false)}, {prop: "embedded", name: "embedded", pkg: "internal/reflectlite", typ: $funcType([], [$Bool], false)}];
	Value.methods = [{prop: "object", name: "object", pkg: "internal/reflectlite", typ: $funcType([], [ptrType$2], false)}, {prop: "assignTo", name: "assignTo", pkg: "internal/reflectlite", typ: $funcType([$String, ptrType$1, $UnsafePointer], [Value], false)}, {prop: "call", name: "call", pkg: "internal/reflectlite", typ: $funcType([$String, sliceType$9], [sliceType$9], false)}, {prop: "Cap", name: "Cap", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Index", name: "Index", pkg: "", typ: $funcType([$Int], [Value], false)}, {prop: "InterfaceData", name: "InterfaceData", pkg: "", typ: $funcType([], [arrayType$2], false)}, {prop: "IsNil", name: "IsNil", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Len", name: "Len", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Pointer", name: "Pointer", pkg: "", typ: $funcType([], [$Uintptr], false)}, {prop: "Set", name: "Set", pkg: "", typ: $funcType([Value], [], false)}, {prop: "SetBytes", name: "SetBytes", pkg: "", typ: $funcType([sliceType$13], [], false)}, {prop: "SetCap", name: "SetCap", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "SetLen", name: "SetLen", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "Slice", name: "Slice", pkg: "", typ: $funcType([$Int, $Int], [Value], false)}, {prop: "Slice3", name: "Slice3", pkg: "", typ: $funcType([$Int, $Int, $Int], [Value], false)}, {prop: "Close", name: "Close", pkg: "", typ: $funcType([], [], false)}, {prop: "Elem", name: "Elem", pkg: "", typ: $funcType([], [Value], false)}, {prop: "NumField", name: "NumField", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "MapKeys", name: "MapKeys", pkg: "", typ: $funcType([], [sliceType$9], false)}, {prop: "MapIndex", name: "MapIndex", pkg: "", typ: $funcType([Value], [Value], false)}, {prop: "Field", name: "Field", pkg: "", typ: $funcType([$Int], [Value], false)}, {prop: "pointer", name: "pointer", pkg: "internal/reflectlite", typ: $funcType([], [$UnsafePointer], false)}, {prop: "CanSet", name: "CanSet", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "IsValid", name: "IsValid", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Kind", name: "Kind", pkg: "", typ: $funcType([], [Kind], false)}, {prop: "numMethod", name: "numMethod", pkg: "internal/reflectlite", typ: $funcType([], [$Int], false)}, {prop: "Type", name: "Type", pkg: "", typ: $funcType([], [Type], false)}];
	flag.methods = [{prop: "mustBe", name: "mustBe", pkg: "internal/reflectlite", typ: $funcType([Kind], [], false)}, {prop: "kind", name: "kind", pkg: "internal/reflectlite", typ: $funcType([], [Kind], false)}, {prop: "ro", name: "ro", pkg: "internal/reflectlite", typ: $funcType([], [flag], false)}, {prop: "mustBeExported", name: "mustBeExported", pkg: "internal/reflectlite", typ: $funcType([], [], false)}, {prop: "mustBeAssignable", name: "mustBeAssignable", pkg: "internal/reflectlite", typ: $funcType([], [], false)}];
	ptrType$13.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	uncommonType.init("internal/reflectlite", [{prop: "pkgPath", name: "pkgPath", embedded: false, exported: false, typ: nameOff, tag: ""}, {prop: "mcount", name: "mcount", embedded: false, exported: false, typ: $Uint16, tag: ""}, {prop: "xcount", name: "xcount", embedded: false, exported: false, typ: $Uint16, tag: ""}, {prop: "moff", name: "moff", embedded: false, exported: false, typ: $Uint32, tag: ""}, {prop: "_methods", name: "_methods", embedded: false, exported: false, typ: sliceType$5, tag: ""}]);
	funcType.init("internal/reflectlite", [{prop: "rtype", name: "rtype", embedded: true, exported: false, typ: rtype, tag: "reflect:\"func\""}, {prop: "inCount", name: "inCount", embedded: false, exported: false, typ: $Uint16, tag: ""}, {prop: "outCount", name: "outCount", embedded: false, exported: false, typ: $Uint16, tag: ""}, {prop: "_in", name: "_in", embedded: false, exported: false, typ: sliceType$2, tag: ""}, {prop: "_out", name: "_out", embedded: false, exported: false, typ: sliceType$2, tag: ""}]);
	name.init("internal/reflectlite", [{prop: "bytes", name: "bytes", embedded: false, exported: false, typ: ptrType$3, tag: ""}]);
	nameData.init("internal/reflectlite", [{prop: "name", name: "name", embedded: false, exported: false, typ: $String, tag: ""}, {prop: "tag", name: "tag", embedded: false, exported: false, typ: $String, tag: ""}, {prop: "exported", name: "exported", embedded: false, exported: false, typ: $Bool, tag: ""}]);
	mapIter.init("internal/reflectlite", [{prop: "t", name: "t", embedded: false, exported: false, typ: Type, tag: ""}, {prop: "m", name: "m", embedded: false, exported: false, typ: ptrType$2, tag: ""}, {prop: "keys", name: "keys", embedded: false, exported: false, typ: ptrType$2, tag: ""}, {prop: "i", name: "i", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "last", name: "last", embedded: false, exported: false, typ: ptrType$2, tag: ""}]);
	TypeEx.init([{prop: "AssignableTo", name: "AssignableTo", pkg: "", typ: $funcType([Type], [$Bool], false)}, {prop: "Comparable", name: "Comparable", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Elem", name: "Elem", pkg: "", typ: $funcType([], [Type], false)}, {prop: "Implements", name: "Implements", pkg: "", typ: $funcType([Type], [$Bool], false)}, {prop: "Key", name: "Key", pkg: "", typ: $funcType([], [Type], false)}, {prop: "Kind", name: "Kind", pkg: "", typ: $funcType([], [Kind], false)}, {prop: "Name", name: "Name", pkg: "", typ: $funcType([], [$String], false)}, {prop: "PkgPath", name: "PkgPath", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Size", name: "Size", pkg: "", typ: $funcType([], [$Uintptr], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "common", name: "common", pkg: "internal/reflectlite", typ: $funcType([], [ptrType$1], false)}, {prop: "uncommon", name: "uncommon", pkg: "internal/reflectlite", typ: $funcType([], [ptrType$4], false)}]);
	errorString.init("internal/reflectlite", [{prop: "s", name: "s", embedded: false, exported: false, typ: $String, tag: ""}]);
	Method.init("", [{prop: "Name", name: "Name", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "PkgPath", name: "PkgPath", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "Type", name: "Type", embedded: false, exported: true, typ: Type, tag: ""}, {prop: "Func", name: "Func", embedded: false, exported: true, typ: Value, tag: ""}, {prop: "Index", name: "Index", embedded: false, exported: true, typ: $Int, tag: ""}]);
	Type.init([{prop: "AssignableTo", name: "AssignableTo", pkg: "", typ: $funcType([Type], [$Bool], false)}, {prop: "Comparable", name: "Comparable", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Elem", name: "Elem", pkg: "", typ: $funcType([], [Type], false)}, {prop: "Implements", name: "Implements", pkg: "", typ: $funcType([Type], [$Bool], false)}, {prop: "Kind", name: "Kind", pkg: "", typ: $funcType([], [Kind], false)}, {prop: "Name", name: "Name", pkg: "", typ: $funcType([], [$String], false)}, {prop: "PkgPath", name: "PkgPath", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Size", name: "Size", pkg: "", typ: $funcType([], [$Uintptr], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "common", name: "common", pkg: "internal/reflectlite", typ: $funcType([], [ptrType$1], false)}, {prop: "uncommon", name: "uncommon", pkg: "internal/reflectlite", typ: $funcType([], [ptrType$4], false)}]);
	rtype.init("internal/reflectlite", [{prop: "size", name: "size", embedded: false, exported: false, typ: $Uintptr, tag: ""}, {prop: "ptrdata", name: "ptrdata", embedded: false, exported: false, typ: $Uintptr, tag: ""}, {prop: "hash", name: "hash", embedded: false, exported: false, typ: $Uint32, tag: ""}, {prop: "tflag", name: "tflag", embedded: false, exported: false, typ: tflag, tag: ""}, {prop: "align", name: "align", embedded: false, exported: false, typ: $Uint8, tag: ""}, {prop: "fieldAlign", name: "fieldAlign", embedded: false, exported: false, typ: $Uint8, tag: ""}, {prop: "kind", name: "kind", embedded: false, exported: false, typ: $Uint8, tag: ""}, {prop: "equal", name: "equal", embedded: false, exported: false, typ: funcType$2, tag: ""}, {prop: "gcdata", name: "gcdata", embedded: false, exported: false, typ: ptrType$3, tag: ""}, {prop: "str", name: "str", embedded: false, exported: false, typ: nameOff, tag: ""}, {prop: "ptrToThis", name: "ptrToThis", embedded: false, exported: false, typ: typeOff, tag: ""}]);
	method.init("internal/reflectlite", [{prop: "name", name: "name", embedded: false, exported: false, typ: nameOff, tag: ""}, {prop: "mtyp", name: "mtyp", embedded: false, exported: false, typ: typeOff, tag: ""}, {prop: "ifn", name: "ifn", embedded: false, exported: false, typ: textOff, tag: ""}, {prop: "tfn", name: "tfn", embedded: false, exported: false, typ: textOff, tag: ""}]);
	arrayType.init("internal/reflectlite", [{prop: "rtype", name: "rtype", embedded: true, exported: false, typ: rtype, tag: ""}, {prop: "elem", name: "elem", embedded: false, exported: false, typ: ptrType$1, tag: ""}, {prop: "slice", name: "slice", embedded: false, exported: false, typ: ptrType$1, tag: ""}, {prop: "len", name: "len", embedded: false, exported: false, typ: $Uintptr, tag: ""}]);
	chanType.init("internal/reflectlite", [{prop: "rtype", name: "rtype", embedded: true, exported: false, typ: rtype, tag: ""}, {prop: "elem", name: "elem", embedded: false, exported: false, typ: ptrType$1, tag: ""}, {prop: "dir", name: "dir", embedded: false, exported: false, typ: $Uintptr, tag: ""}]);
	imethod.init("internal/reflectlite", [{prop: "name", name: "name", embedded: false, exported: false, typ: nameOff, tag: ""}, {prop: "typ", name: "typ", embedded: false, exported: false, typ: typeOff, tag: ""}]);
	interfaceType.init("internal/reflectlite", [{prop: "rtype", name: "rtype", embedded: true, exported: false, typ: rtype, tag: ""}, {prop: "pkgPath", name: "pkgPath", embedded: false, exported: false, typ: name, tag: ""}, {prop: "methods", name: "methods", embedded: false, exported: false, typ: sliceType$6, tag: ""}]);
	mapType.init("internal/reflectlite", [{prop: "rtype", name: "rtype", embedded: true, exported: false, typ: rtype, tag: ""}, {prop: "key", name: "key", embedded: false, exported: false, typ: ptrType$1, tag: ""}, {prop: "elem", name: "elem", embedded: false, exported: false, typ: ptrType$1, tag: ""}, {prop: "bucket", name: "bucket", embedded: false, exported: false, typ: ptrType$1, tag: ""}, {prop: "hasher", name: "hasher", embedded: false, exported: false, typ: funcType$3, tag: ""}, {prop: "keysize", name: "keysize", embedded: false, exported: false, typ: $Uint8, tag: ""}, {prop: "valuesize", name: "valuesize", embedded: false, exported: false, typ: $Uint8, tag: ""}, {prop: "bucketsize", name: "bucketsize", embedded: false, exported: false, typ: $Uint16, tag: ""}, {prop: "flags", name: "flags", embedded: false, exported: false, typ: $Uint32, tag: ""}]);
	ptrType.init("internal/reflectlite", [{prop: "rtype", name: "rtype", embedded: true, exported: false, typ: rtype, tag: ""}, {prop: "elem", name: "elem", embedded: false, exported: false, typ: ptrType$1, tag: ""}]);
	sliceType.init("internal/reflectlite", [{prop: "rtype", name: "rtype", embedded: true, exported: false, typ: rtype, tag: ""}, {prop: "elem", name: "elem", embedded: false, exported: false, typ: ptrType$1, tag: ""}]);
	structField.init("internal/reflectlite", [{prop: "name", name: "name", embedded: false, exported: false, typ: name, tag: ""}, {prop: "typ", name: "typ", embedded: false, exported: false, typ: ptrType$1, tag: ""}, {prop: "offsetEmbed", name: "offsetEmbed", embedded: false, exported: false, typ: $Uintptr, tag: ""}]);
	structType.init("internal/reflectlite", [{prop: "rtype", name: "rtype", embedded: true, exported: false, typ: rtype, tag: ""}, {prop: "pkgPath", name: "pkgPath", embedded: false, exported: false, typ: name, tag: ""}, {prop: "fields", name: "fields", embedded: false, exported: false, typ: sliceType$7, tag: ""}]);
	Value.init("internal/reflectlite", [{prop: "typ", name: "typ", embedded: false, exported: false, typ: ptrType$1, tag: ""}, {prop: "ptr", name: "ptr", embedded: false, exported: false, typ: $UnsafePointer, tag: ""}, {prop: "flag", name: "flag", embedded: true, exported: false, typ: flag, tag: ""}]);
	ValueError.init("", [{prop: "Method", name: "Method", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "Kind", name: "Kind", embedded: false, exported: true, typ: Kind, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = unsafeheader.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = runtime.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		uint8Type = ptrType$1.nil;
		nameOffList = sliceType$1.nil;
		typeOffList = sliceType$2.nil;
		initialized = false;
		idJsType = "_jsType";
		idReflectType = "_reflectType";
		idKindType = "kindType";
		idRtype = "_rtype";
		uncommonTypeMap = {};
		nameMap = {};
		selectHelper = $assertType($internalize($select, $emptyInterface), funcType$1);
		$pkg.ErrSyntax = new errorString.ptr("invalid syntax");
		callHelper = $assertType($internalize($call, $emptyInterface), funcType$1);
		jsObjectPtr = reflectType($jsObjectPtr);
		kindNames = new sliceType$4(["invalid", "bool", "int", "int8", "int16", "int32", "int64", "uint", "uint8", "uint16", "uint32", "uint64", "uintptr", "float32", "float64", "complex64", "complex128", "array", "chan", "func", "interface", "map", "ptr", "slice", "string", "struct", "unsafe.Pointer"]);
		$r = init(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["errors"] = (function() {
	var $pkg = {}, $init, reflectlite, errorString, ptrType, ptrType$1, errorType, _r, New;
	reflectlite = $packages["internal/reflectlite"];
	errorString = $pkg.errorString = $newType(0, $kindStruct, "errors.errorString", true, "errors", false, function(s_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.s = "";
			return;
		}
		this.s = s_;
	});
	ptrType = $ptrType($error);
	ptrType$1 = $ptrType(errorString);
	New = function(text) {
		var text;
		return new errorString.ptr(text);
	};
	$pkg.New = New;
	errorString.ptr.prototype.Error = function() {
		var e;
		e = this;
		return e.s;
	};
	errorString.prototype.Error = function() { return this.$val.Error(); };
	ptrType$1.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	errorString.init("errors", [{prop: "s", name: "s", embedded: false, exported: false, typ: $String, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = reflectlite.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		_r = reflectlite.TypeOf((ptrType.nil)).Elem(); /* */ $s = 2; case 2: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		errorType = _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["math/bits"] = (function() {
	var $pkg = {}, $init, deBruijn32tab, deBruijn64tab, len8tab, LeadingZeros64, TrailingZeros, TrailingZeros32, TrailingZeros64, Len64, Mul64;
	LeadingZeros64 = function(x) {
		var x;
		return 64 - Len64(x) >> 0;
	};
	$pkg.LeadingZeros64 = LeadingZeros64;
	TrailingZeros = function(x) {
		var x;
		if (true) {
			return TrailingZeros32(((x >>> 0)));
		}
		return TrailingZeros64((new $Uint64(0, x)));
	};
	$pkg.TrailingZeros = TrailingZeros;
	TrailingZeros32 = function(x) {
		var x, x$1;
		if (x === 0) {
			return 32;
		}
		return (((x$1 = ($imul((((x & (-x >>> 0)) >>> 0)), 125613361) >>> 0) >>> 27 >>> 0, ((x$1 < 0 || x$1 >= deBruijn32tab.length) ? ($throwRuntimeError("index out of range"), undefined) : deBruijn32tab[x$1])) >> 0));
	};
	$pkg.TrailingZeros32 = TrailingZeros32;
	TrailingZeros64 = function(x) {
		var x, x$1, x$2;
		if ((x.$high === 0 && x.$low === 0)) {
			return 64;
		}
		return (((x$1 = $shiftRightUint64($mul64(((x$2 = new $Uint64(-x.$high, -x.$low), new $Uint64(x.$high & x$2.$high, (x.$low & x$2.$low) >>> 0))), new $Uint64(66559345, 3033172745)), 58), (($flatten64(x$1) < 0 || $flatten64(x$1) >= deBruijn64tab.length) ? ($throwRuntimeError("index out of range"), undefined) : deBruijn64tab[$flatten64(x$1)])) >> 0));
	};
	$pkg.TrailingZeros64 = TrailingZeros64;
	Len64 = function(x) {
		var n, x;
		n = 0;
		if ((x.$high > 1 || (x.$high === 1 && x.$low >= 0))) {
			x = $shiftRightUint64(x, (32));
			n = 32;
		}
		if ((x.$high > 0 || (x.$high === 0 && x.$low >= 65536))) {
			x = $shiftRightUint64(x, (16));
			n = n + (16) >> 0;
		}
		if ((x.$high > 0 || (x.$high === 0 && x.$low >= 256))) {
			x = $shiftRightUint64(x, (8));
			n = n + (8) >> 0;
		}
		n = n + (((($flatten64(x) < 0 || $flatten64(x) >= len8tab.length) ? ($throwRuntimeError("index out of range"), undefined) : len8tab[$flatten64(x)]) >> 0)) >> 0;
		return n;
	};
	$pkg.Len64 = Len64;
	Mul64 = function(x, y) {
		var hi, lo, t, w0, w1, w2, x, x$1, x$2, x$3, x$4, x$5, x$6, x0, x1, y, y0, y1;
		hi = new $Uint64(0, 0);
		lo = new $Uint64(0, 0);
		x0 = new $Uint64(x.$high & 0, (x.$low & 4294967295) >>> 0);
		x1 = $shiftRightUint64(x, 32);
		y0 = new $Uint64(y.$high & 0, (y.$low & 4294967295) >>> 0);
		y1 = $shiftRightUint64(y, 32);
		w0 = $mul64(x0, y0);
		t = (x$1 = $mul64(x1, y0), x$2 = $shiftRightUint64(w0, 32), new $Uint64(x$1.$high + x$2.$high, x$1.$low + x$2.$low));
		w1 = new $Uint64(t.$high & 0, (t.$low & 4294967295) >>> 0);
		w2 = $shiftRightUint64(t, 32);
		w1 = (x$3 = $mul64(x0, y1), new $Uint64(w1.$high + x$3.$high, w1.$low + x$3.$low));
		hi = (x$4 = (x$5 = $mul64(x1, y1), new $Uint64(x$5.$high + w2.$high, x$5.$low + w2.$low)), x$6 = $shiftRightUint64(w1, 32), new $Uint64(x$4.$high + x$6.$high, x$4.$low + x$6.$low));
		lo = $mul64(x, y);
		return [hi, lo];
	};
	$pkg.Mul64 = Mul64;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		deBruijn32tab = $toNativeArray($kindUint8, [0, 1, 28, 2, 29, 14, 24, 3, 30, 22, 20, 15, 25, 17, 4, 8, 31, 27, 13, 23, 21, 19, 16, 7, 26, 12, 18, 6, 11, 5, 10, 9]);
		deBruijn64tab = $toNativeArray($kindUint8, [0, 1, 56, 2, 57, 49, 28, 3, 61, 58, 42, 50, 38, 29, 17, 4, 62, 47, 59, 36, 45, 43, 51, 22, 53, 39, 33, 30, 24, 18, 12, 5, 63, 55, 48, 27, 60, 41, 37, 16, 46, 35, 44, 21, 52, 32, 23, 11, 54, 26, 40, 15, 34, 20, 31, 10, 25, 14, 19, 9, 13, 8, 7, 6]);
		len8tab = $toNativeArray($kindUint8, [0, 1, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8]);
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["math"] = (function() {
	var $pkg = {}, $init, js, bits, arrayType, arrayType$1, arrayType$2, structType, math, _zero, posInf, negInf, nan, buf, Exp, Inf, Log, NaN, Sin, Sqrt, init, Float32bits, Float32frombits, Float64bits, Float64frombits;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	bits = $packages["math/bits"];
	arrayType = $arrayType($Uint32, 2);
	arrayType$1 = $arrayType($Float32, 2);
	arrayType$2 = $arrayType($Float64, 1);
	structType = $structType("math", [{prop: "uint32array", name: "uint32array", embedded: false, exported: false, typ: arrayType, tag: ""}, {prop: "float32array", name: "float32array", embedded: false, exported: false, typ: arrayType$1, tag: ""}, {prop: "float64array", name: "float64array", embedded: false, exported: false, typ: arrayType$2, tag: ""}]);
	Exp = function(x) {
		var x;
		return $parseFloat(math.exp(x));
	};
	$pkg.Exp = Exp;
	Inf = function(sign) {
		var sign;
		if (sign >= 0) {
			return posInf;
		} else {
			return negInf;
		}
	};
	$pkg.Inf = Inf;
	Log = function(x) {
		var x;
		if (!((x === x))) {
			return nan;
		}
		return $parseFloat(math.log(x));
	};
	$pkg.Log = Log;
	NaN = function() {
		return nan;
	};
	$pkg.NaN = NaN;
	Sin = function(x) {
		var x;
		return $parseFloat(math.sin(x));
	};
	$pkg.Sin = Sin;
	Sqrt = function(x) {
		var x;
		return $parseFloat(math.sqrt(x));
	};
	$pkg.Sqrt = Sqrt;
	init = function() {
		var ab;
		ab = new ($global.ArrayBuffer)(8);
		buf.uint32array = new ($global.Uint32Array)(ab);
		buf.float32array = new ($global.Float32Array)(ab);
		buf.float64array = new ($global.Float64Array)(ab);
	};
	Float32bits = function(f) {
		var f;
		buf.float32array[0] = f;
		return buf.uint32array[0];
	};
	$pkg.Float32bits = Float32bits;
	Float32frombits = function(b) {
		var b;
		buf.uint32array[0] = b;
		return buf.float32array[0];
	};
	$pkg.Float32frombits = Float32frombits;
	Float64bits = function(f) {
		var f, x, x$1;
		buf.float64array[0] = f;
		return (x = $shiftLeft64((new $Uint64(0, buf.uint32array[1])), 32), x$1 = (new $Uint64(0, buf.uint32array[0])), new $Uint64(x.$high + x$1.$high, x.$low + x$1.$low));
	};
	$pkg.Float64bits = Float64bits;
	Float64frombits = function(b) {
		var b;
		buf.uint32array[0] = ((b.$low >>> 0));
		buf.uint32array[1] = (($shiftRightUint64(b, 32).$low >>> 0));
		return buf.float64array[0];
	};
	$pkg.Float64frombits = Float64frombits;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = bits.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		buf = new structType.ptr(arrayType.zero(), arrayType$1.zero(), arrayType$2.zero());
		math = $global.Math;
		_zero = 0;
		posInf = 1 / _zero;
		negInf = -1 / _zero;
		nan = 0 / _zero;
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["internal/cpu"] = (function() {
	var $pkg = {}, $init;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["internal/bytealg"] = (function() {
	var $pkg = {}, $init, cpu, Equal, HashStrBytes, IndexRabinKarpBytes, Index, Cutover, IndexByteString;
	cpu = $packages["internal/cpu"];
	Equal = function(a, b) {
		var _i, _ref, a, b, c, i;
		if (!((a.$length === b.$length))) {
			return false;
		}
		_ref = a;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			c = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			if (!((c === ((i < 0 || i >= b.$length) ? ($throwRuntimeError("index out of range"), undefined) : b.$array[b.$offset + i])))) {
				return false;
			}
			_i++;
		}
		return true;
	};
	$pkg.Equal = Equal;
	HashStrBytes = function(sep) {
		var _tmp, _tmp$1, hash, i, i$1, pow, sep, sq;
		hash = 0;
		i = 0;
		while (true) {
			if (!(i < sep.$length)) { break; }
			hash = ($imul(hash, 16777619) >>> 0) + ((((i < 0 || i >= sep.$length) ? ($throwRuntimeError("index out of range"), undefined) : sep.$array[sep.$offset + i]) >>> 0)) >>> 0;
			i = i + (1) >> 0;
		}
		_tmp = 1;
		_tmp$1 = 16777619;
		pow = _tmp;
		sq = _tmp$1;
		i$1 = sep.$length;
		while (true) {
			if (!(i$1 > 0)) { break; }
			if (!(((i$1 & 1) === 0))) {
				pow = $imul(pow, (sq)) >>> 0;
			}
			sq = $imul(sq, (sq)) >>> 0;
			i$1 = (i$1 >> $min((1), 31)) >> 0;
		}
		return [hash, pow];
	};
	$pkg.HashStrBytes = HashStrBytes;
	IndexRabinKarpBytes = function(s, sep) {
		var _tuple, h, hashsep, i, i$1, n, pow, s, sep, x;
		_tuple = HashStrBytes(sep);
		hashsep = _tuple[0];
		pow = _tuple[1];
		n = sep.$length;
		h = 0;
		i = 0;
		while (true) {
			if (!(i < n)) { break; }
			h = ($imul(h, 16777619) >>> 0) + ((((i < 0 || i >= s.$length) ? ($throwRuntimeError("index out of range"), undefined) : s.$array[s.$offset + i]) >>> 0)) >>> 0;
			i = i + (1) >> 0;
		}
		if ((h === hashsep) && Equal($subslice(s, 0, n), sep)) {
			return 0;
		}
		i$1 = n;
		while (true) {
			if (!(i$1 < s.$length)) { break; }
			h = $imul(h, (16777619)) >>> 0;
			h = h + (((((i$1 < 0 || i$1 >= s.$length) ? ($throwRuntimeError("index out of range"), undefined) : s.$array[s.$offset + i$1]) >>> 0))) >>> 0;
			h = h - (($imul(pow, (((x = i$1 - n >> 0, ((x < 0 || x >= s.$length) ? ($throwRuntimeError("index out of range"), undefined) : s.$array[s.$offset + x])) >>> 0))) >>> 0)) >>> 0;
			i$1 = i$1 + (1) >> 0;
			if ((h === hashsep) && Equal($subslice(s, (i$1 - n >> 0), i$1), sep)) {
				return i$1 - n >> 0;
			}
		}
		return -1;
	};
	$pkg.IndexRabinKarpBytes = IndexRabinKarpBytes;
	Index = function(a, b) {
		var a, b;
		$panic(new $String("unimplemented"));
	};
	$pkg.Index = Index;
	Cutover = function(n) {
		var n;
		$panic(new $String("unimplemented"));
	};
	$pkg.Cutover = Cutover;
	IndexByteString = function(s, c) {
		var c, i, s;
		i = 0;
		while (true) {
			if (!(i < s.length)) { break; }
			if (s.charCodeAt(i) === c) {
				return i;
			}
			i = i + (1) >> 0;
		}
		return -1;
	};
	$pkg.IndexByteString = IndexByteString;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = cpu.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$pkg.MaxLen = 0;
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["unicode/utf8"] = (function() {
	var $pkg = {}, $init, acceptRange, first, acceptRanges, DecodeRune, DecodeRuneInString, DecodeLastRune, DecodeLastRuneInString, RuneLen, EncodeRune, RuneCount, RuneCountInString, RuneStart, ValidString, ValidRune;
	acceptRange = $pkg.acceptRange = $newType(0, $kindStruct, "utf8.acceptRange", true, "unicode/utf8", false, function(lo_, hi_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.lo = 0;
			this.hi = 0;
			return;
		}
		this.lo = lo_;
		this.hi = hi_;
	});
	DecodeRune = function(p) {
		var _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, accept, b1, b2, b3, mask, n, p, p0, r, size, sz, x, x$1;
		r = 0;
		size = 0;
		n = p.$length;
		if (n < 1) {
			_tmp = 65533;
			_tmp$1 = 0;
			r = _tmp;
			size = _tmp$1;
			return [r, size];
		}
		p0 = (0 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 0]);
		x = ((p0 < 0 || p0 >= first.length) ? ($throwRuntimeError("index out of range"), undefined) : first[p0]);
		if (x >= 240) {
			mask = (((x >> 0)) << 31 >> 0) >> 31 >> 0;
			_tmp$2 = (((((0 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 0]) >> 0)) & ~mask) >> 0) | (65533 & mask);
			_tmp$3 = 1;
			r = _tmp$2;
			size = _tmp$3;
			return [r, size];
		}
		sz = ((((x & 7) >>> 0) >> 0));
		accept = $clone((x$1 = x >>> 4 << 24 >>> 24, ((x$1 < 0 || x$1 >= acceptRanges.length) ? ($throwRuntimeError("index out of range"), undefined) : acceptRanges[x$1])), acceptRange);
		if (n < sz) {
			_tmp$4 = 65533;
			_tmp$5 = 1;
			r = _tmp$4;
			size = _tmp$5;
			return [r, size];
		}
		b1 = (1 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 1]);
		if (b1 < accept.lo || accept.hi < b1) {
			_tmp$6 = 65533;
			_tmp$7 = 1;
			r = _tmp$6;
			size = _tmp$7;
			return [r, size];
		}
		if (sz <= 2) {
			_tmp$8 = (((((p0 & 31) >>> 0) >> 0)) << 6 >> 0) | ((((b1 & 63) >>> 0) >> 0));
			_tmp$9 = 2;
			r = _tmp$8;
			size = _tmp$9;
			return [r, size];
		}
		b2 = (2 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 2]);
		if (b2 < 128 || 191 < b2) {
			_tmp$10 = 65533;
			_tmp$11 = 1;
			r = _tmp$10;
			size = _tmp$11;
			return [r, size];
		}
		if (sz <= 3) {
			_tmp$12 = ((((((p0 & 15) >>> 0) >> 0)) << 12 >> 0) | (((((b1 & 63) >>> 0) >> 0)) << 6 >> 0)) | ((((b2 & 63) >>> 0) >> 0));
			_tmp$13 = 3;
			r = _tmp$12;
			size = _tmp$13;
			return [r, size];
		}
		b3 = (3 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 3]);
		if (b3 < 128 || 191 < b3) {
			_tmp$14 = 65533;
			_tmp$15 = 1;
			r = _tmp$14;
			size = _tmp$15;
			return [r, size];
		}
		_tmp$16 = (((((((p0 & 7) >>> 0) >> 0)) << 18 >> 0) | (((((b1 & 63) >>> 0) >> 0)) << 12 >> 0)) | (((((b2 & 63) >>> 0) >> 0)) << 6 >> 0)) | ((((b3 & 63) >>> 0) >> 0));
		_tmp$17 = 4;
		r = _tmp$16;
		size = _tmp$17;
		return [r, size];
	};
	$pkg.DecodeRune = DecodeRune;
	DecodeRuneInString = function(s) {
		var _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, accept, mask, n, r, s, s0, s1, s2, s3, size, sz, x, x$1;
		r = 0;
		size = 0;
		n = s.length;
		if (n < 1) {
			_tmp = 65533;
			_tmp$1 = 0;
			r = _tmp;
			size = _tmp$1;
			return [r, size];
		}
		s0 = s.charCodeAt(0);
		x = ((s0 < 0 || s0 >= first.length) ? ($throwRuntimeError("index out of range"), undefined) : first[s0]);
		if (x >= 240) {
			mask = (((x >> 0)) << 31 >> 0) >> 31 >> 0;
			_tmp$2 = ((((s.charCodeAt(0) >> 0)) & ~mask) >> 0) | (65533 & mask);
			_tmp$3 = 1;
			r = _tmp$2;
			size = _tmp$3;
			return [r, size];
		}
		sz = ((((x & 7) >>> 0) >> 0));
		accept = $clone((x$1 = x >>> 4 << 24 >>> 24, ((x$1 < 0 || x$1 >= acceptRanges.length) ? ($throwRuntimeError("index out of range"), undefined) : acceptRanges[x$1])), acceptRange);
		if (n < sz) {
			_tmp$4 = 65533;
			_tmp$5 = 1;
			r = _tmp$4;
			size = _tmp$5;
			return [r, size];
		}
		s1 = s.charCodeAt(1);
		if (s1 < accept.lo || accept.hi < s1) {
			_tmp$6 = 65533;
			_tmp$7 = 1;
			r = _tmp$6;
			size = _tmp$7;
			return [r, size];
		}
		if (sz <= 2) {
			_tmp$8 = (((((s0 & 31) >>> 0) >> 0)) << 6 >> 0) | ((((s1 & 63) >>> 0) >> 0));
			_tmp$9 = 2;
			r = _tmp$8;
			size = _tmp$9;
			return [r, size];
		}
		s2 = s.charCodeAt(2);
		if (s2 < 128 || 191 < s2) {
			_tmp$10 = 65533;
			_tmp$11 = 1;
			r = _tmp$10;
			size = _tmp$11;
			return [r, size];
		}
		if (sz <= 3) {
			_tmp$12 = ((((((s0 & 15) >>> 0) >> 0)) << 12 >> 0) | (((((s1 & 63) >>> 0) >> 0)) << 6 >> 0)) | ((((s2 & 63) >>> 0) >> 0));
			_tmp$13 = 3;
			r = _tmp$12;
			size = _tmp$13;
			return [r, size];
		}
		s3 = s.charCodeAt(3);
		if (s3 < 128 || 191 < s3) {
			_tmp$14 = 65533;
			_tmp$15 = 1;
			r = _tmp$14;
			size = _tmp$15;
			return [r, size];
		}
		_tmp$16 = (((((((s0 & 7) >>> 0) >> 0)) << 18 >> 0) | (((((s1 & 63) >>> 0) >> 0)) << 12 >> 0)) | (((((s2 & 63) >>> 0) >> 0)) << 6 >> 0)) | ((((s3 & 63) >>> 0) >> 0));
		_tmp$17 = 4;
		r = _tmp$16;
		size = _tmp$17;
		return [r, size];
	};
	$pkg.DecodeRuneInString = DecodeRuneInString;
	DecodeLastRune = function(p) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tuple, end, lim, p, r, size, start;
		r = 0;
		size = 0;
		end = p.$length;
		if (end === 0) {
			_tmp = 65533;
			_tmp$1 = 0;
			r = _tmp;
			size = _tmp$1;
			return [r, size];
		}
		start = end - 1 >> 0;
		r = ((((start < 0 || start >= p.$length) ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + start]) >> 0));
		if (r < 128) {
			_tmp$2 = r;
			_tmp$3 = 1;
			r = _tmp$2;
			size = _tmp$3;
			return [r, size];
		}
		lim = end - 4 >> 0;
		if (lim < 0) {
			lim = 0;
		}
		start = start - (1) >> 0;
		while (true) {
			if (!(start >= lim)) { break; }
			if (RuneStart(((start < 0 || start >= p.$length) ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + start]))) {
				break;
			}
			start = start - (1) >> 0;
		}
		if (start < 0) {
			start = 0;
		}
		_tuple = DecodeRune($subslice(p, start, end));
		r = _tuple[0];
		size = _tuple[1];
		if (!(((start + size >> 0) === end))) {
			_tmp$4 = 65533;
			_tmp$5 = 1;
			r = _tmp$4;
			size = _tmp$5;
			return [r, size];
		}
		_tmp$6 = r;
		_tmp$7 = size;
		r = _tmp$6;
		size = _tmp$7;
		return [r, size];
	};
	$pkg.DecodeLastRune = DecodeLastRune;
	DecodeLastRuneInString = function(s) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tuple, end, lim, r, s, size, start;
		r = 0;
		size = 0;
		end = s.length;
		if (end === 0) {
			_tmp = 65533;
			_tmp$1 = 0;
			r = _tmp;
			size = _tmp$1;
			return [r, size];
		}
		start = end - 1 >> 0;
		r = ((s.charCodeAt(start) >> 0));
		if (r < 128) {
			_tmp$2 = r;
			_tmp$3 = 1;
			r = _tmp$2;
			size = _tmp$3;
			return [r, size];
		}
		lim = end - 4 >> 0;
		if (lim < 0) {
			lim = 0;
		}
		start = start - (1) >> 0;
		while (true) {
			if (!(start >= lim)) { break; }
			if (RuneStart(s.charCodeAt(start))) {
				break;
			}
			start = start - (1) >> 0;
		}
		if (start < 0) {
			start = 0;
		}
		_tuple = DecodeRuneInString($substring(s, start, end));
		r = _tuple[0];
		size = _tuple[1];
		if (!(((start + size >> 0) === end))) {
			_tmp$4 = 65533;
			_tmp$5 = 1;
			r = _tmp$4;
			size = _tmp$5;
			return [r, size];
		}
		_tmp$6 = r;
		_tmp$7 = size;
		r = _tmp$6;
		size = _tmp$7;
		return [r, size];
	};
	$pkg.DecodeLastRuneInString = DecodeLastRuneInString;
	RuneLen = function(r) {
		var r;
		if (r < 0) {
			return -1;
		} else if (r <= 127) {
			return 1;
		} else if (r <= 2047) {
			return 2;
		} else if (55296 <= r && r <= 57343) {
			return -1;
		} else if (r <= 65535) {
			return 3;
		} else if (r <= 1114111) {
			return 4;
		}
		return -1;
	};
	$pkg.RuneLen = RuneLen;
	EncodeRune = function(p, r) {
		var i, p, r;
		i = ((r >>> 0));
		if (i <= 127) {
			(0 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 0] = ((r << 24 >>> 24)));
			return 1;
		} else if (i <= 2047) {
			$unused((1 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 1]));
			(0 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 0] = ((192 | (((r >> 6 >> 0) << 24 >>> 24))) >>> 0));
			(1 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 1] = ((128 | ((((r << 24 >>> 24)) & 63) >>> 0)) >>> 0));
			return 2;
		} else if ((i > 1114111) || (55296 <= i && i <= 57343)) {
			r = 65533;
			$unused((2 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 2]));
			(0 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 0] = ((224 | (((r >> 12 >> 0) << 24 >>> 24))) >>> 0));
			(1 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 1] = ((128 | (((((r >> 6 >> 0) << 24 >>> 24)) & 63) >>> 0)) >>> 0));
			(2 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 2] = ((128 | ((((r << 24 >>> 24)) & 63) >>> 0)) >>> 0));
			return 3;
		} else if (i <= 65535) {
			$unused((2 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 2]));
			(0 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 0] = ((224 | (((r >> 12 >> 0) << 24 >>> 24))) >>> 0));
			(1 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 1] = ((128 | (((((r >> 6 >> 0) << 24 >>> 24)) & 63) >>> 0)) >>> 0));
			(2 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 2] = ((128 | ((((r << 24 >>> 24)) & 63) >>> 0)) >>> 0));
			return 3;
		} else {
			$unused((3 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 3]));
			(0 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 0] = ((240 | (((r >> 18 >> 0) << 24 >>> 24))) >>> 0));
			(1 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 1] = ((128 | (((((r >> 12 >> 0) << 24 >>> 24)) & 63) >>> 0)) >>> 0));
			(2 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 2] = ((128 | (((((r >> 6 >> 0) << 24 >>> 24)) & 63) >>> 0)) >>> 0));
			(3 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 3] = ((128 | ((((r << 24 >>> 24)) & 63) >>> 0)) >>> 0));
			return 4;
		}
	};
	$pkg.EncodeRune = EncodeRune;
	RuneCount = function(p) {
		var accept, c, c$1, c$2, c$3, i, n, np, p, size, x, x$1, x$2, x$3, x$4;
		np = p.$length;
		n = 0;
		i = 0;
		while (true) {
			if (!(i < np)) { break; }
			n = n + (1) >> 0;
			c = ((i < 0 || i >= p.$length) ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + i]);
			if (c < 128) {
				i = i + (1) >> 0;
				continue;
			}
			x = ((c < 0 || c >= first.length) ? ($throwRuntimeError("index out of range"), undefined) : first[c]);
			if (x === 241) {
				i = i + (1) >> 0;
				continue;
			}
			size = ((((x & 7) >>> 0) >> 0));
			if ((i + size >> 0) > np) {
				i = i + (1) >> 0;
				continue;
			}
			accept = $clone((x$1 = x >>> 4 << 24 >>> 24, ((x$1 < 0 || x$1 >= acceptRanges.length) ? ($throwRuntimeError("index out of range"), undefined) : acceptRanges[x$1])), acceptRange);
			c$1 = (x$2 = i + 1 >> 0, ((x$2 < 0 || x$2 >= p.$length) ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + x$2]));
			if (c$1 < accept.lo || accept.hi < c$1) {
				size = 1;
			} else if (size === 2) {
			} else {
				c$2 = (x$3 = i + 2 >> 0, ((x$3 < 0 || x$3 >= p.$length) ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + x$3]));
				if (c$2 < 128 || 191 < c$2) {
					size = 1;
				} else if (size === 3) {
				} else {
					c$3 = (x$4 = i + 3 >> 0, ((x$4 < 0 || x$4 >= p.$length) ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + x$4]));
					if (c$3 < 128 || 191 < c$3) {
						size = 1;
					}
				}
			}
			i = i + (size) >> 0;
		}
		return n;
	};
	$pkg.RuneCount = RuneCount;
	RuneCountInString = function(s) {
		var accept, c, c$1, c$2, c$3, i, n, ns, s, size, x, x$1;
		n = 0;
		ns = s.length;
		i = 0;
		while (true) {
			if (!(i < ns)) { break; }
			c = s.charCodeAt(i);
			if (c < 128) {
				i = i + (1) >> 0;
				n = n + (1) >> 0;
				continue;
			}
			x = ((c < 0 || c >= first.length) ? ($throwRuntimeError("index out of range"), undefined) : first[c]);
			if (x === 241) {
				i = i + (1) >> 0;
				n = n + (1) >> 0;
				continue;
			}
			size = ((((x & 7) >>> 0) >> 0));
			if ((i + size >> 0) > ns) {
				i = i + (1) >> 0;
				n = n + (1) >> 0;
				continue;
			}
			accept = $clone((x$1 = x >>> 4 << 24 >>> 24, ((x$1 < 0 || x$1 >= acceptRanges.length) ? ($throwRuntimeError("index out of range"), undefined) : acceptRanges[x$1])), acceptRange);
			c$1 = s.charCodeAt((i + 1 >> 0));
			if (c$1 < accept.lo || accept.hi < c$1) {
				size = 1;
			} else if (size === 2) {
			} else {
				c$2 = s.charCodeAt((i + 2 >> 0));
				if (c$2 < 128 || 191 < c$2) {
					size = 1;
				} else if (size === 3) {
				} else {
					c$3 = s.charCodeAt((i + 3 >> 0));
					if (c$3 < 128 || 191 < c$3) {
						size = 1;
					}
				}
			}
			i = i + (size) >> 0;
			n = n + (1) >> 0;
		}
		n = n;
		return n;
	};
	$pkg.RuneCountInString = RuneCountInString;
	RuneStart = function(b) {
		var b;
		return !((((b & 192) >>> 0) === 128));
	};
	$pkg.RuneStart = RuneStart;
	ValidString = function(s) {
		var accept, c, c$1, c$2, first32, i, n, s, second32, si, size, x, x$1;
		while (true) {
			if (!(s.length >= 8)) { break; }
			first32 = (((((((s.charCodeAt(0) >>> 0)) | (((s.charCodeAt(1) >>> 0)) << 8 >>> 0)) >>> 0) | (((s.charCodeAt(2) >>> 0)) << 16 >>> 0)) >>> 0) | (((s.charCodeAt(3) >>> 0)) << 24 >>> 0)) >>> 0;
			second32 = (((((((s.charCodeAt(4) >>> 0)) | (((s.charCodeAt(5) >>> 0)) << 8 >>> 0)) >>> 0) | (((s.charCodeAt(6) >>> 0)) << 16 >>> 0)) >>> 0) | (((s.charCodeAt(7) >>> 0)) << 24 >>> 0)) >>> 0;
			if (!(((((((first32 | second32) >>> 0)) & 2155905152) >>> 0) === 0))) {
				break;
			}
			s = $substring(s, 8);
		}
		n = s.length;
		i = 0;
		while (true) {
			if (!(i < n)) { break; }
			si = s.charCodeAt(i);
			if (si < 128) {
				i = i + (1) >> 0;
				continue;
			}
			x = ((si < 0 || si >= first.length) ? ($throwRuntimeError("index out of range"), undefined) : first[si]);
			if (x === 241) {
				return false;
			}
			size = ((((x & 7) >>> 0) >> 0));
			if ((i + size >> 0) > n) {
				return false;
			}
			accept = $clone((x$1 = x >>> 4 << 24 >>> 24, ((x$1 < 0 || x$1 >= acceptRanges.length) ? ($throwRuntimeError("index out of range"), undefined) : acceptRanges[x$1])), acceptRange);
			c = s.charCodeAt((i + 1 >> 0));
			if (c < accept.lo || accept.hi < c) {
				return false;
			} else if (size === 2) {
			} else {
				c$1 = s.charCodeAt((i + 2 >> 0));
				if (c$1 < 128 || 191 < c$1) {
					return false;
				} else if (size === 3) {
				} else {
					c$2 = s.charCodeAt((i + 3 >> 0));
					if (c$2 < 128 || 191 < c$2) {
						return false;
					}
				}
			}
			i = i + (size) >> 0;
		}
		return true;
	};
	$pkg.ValidString = ValidString;
	ValidRune = function(r) {
		var r;
		if (0 <= r && r < 55296) {
			return true;
		} else if (57343 < r && r <= 1114111) {
			return true;
		}
		return false;
	};
	$pkg.ValidRune = ValidRune;
	acceptRange.init("unicode/utf8", [{prop: "lo", name: "lo", embedded: false, exported: false, typ: $Uint8, tag: ""}, {prop: "hi", name: "hi", embedded: false, exported: false, typ: $Uint8, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		first = $toNativeArray($kindUint8, [240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 19, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 35, 3, 3, 52, 4, 4, 4, 68, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241]);
		acceptRanges = $toNativeArray($kindStruct, [new acceptRange.ptr(128, 191), new acceptRange.ptr(160, 191), new acceptRange.ptr(128, 159), new acceptRange.ptr(144, 191), new acceptRange.ptr(128, 143), new acceptRange.ptr(0, 0), new acceptRange.ptr(0, 0), new acceptRange.ptr(0, 0), new acceptRange.ptr(0, 0), new acceptRange.ptr(0, 0), new acceptRange.ptr(0, 0), new acceptRange.ptr(0, 0), new acceptRange.ptr(0, 0), new acceptRange.ptr(0, 0), new acceptRange.ptr(0, 0), new acceptRange.ptr(0, 0)]);
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["strconv"] = (function() {
	var $pkg = {}, $init, errors, bytealg, math, bits, utf8, NumError, decimal, leftCheat, extFloat, floatInfo, decimalSlice, sliceType, sliceType$1, sliceType$2, sliceType$3, arrayType, sliceType$4, sliceType$5, ptrType, arrayType$1, sliceType$6, arrayType$2, arrayType$3, ptrType$1, arrayType$4, arrayType$5, ptrType$2, ptrType$3, ptrType$4, optimize, powtab, float64pow10, float32pow10, leftcheats, detailedPowersOfTen, powersOfTen, uint64pow10, float32info, float32info$24ptr, float64info, float64info$24ptr, isPrint16, isNotPrint16, isPrint32, isNotPrint32, isGraphic, commonPrefixLenIgnoreCase, special, readFloat, atof64exact, atof32exact, atofHex, atof32, atof64, ParseFloat, parseFloatPrefix, lower, syntaxError, rangeError, baseError, bitSizeError, ParseUint, ParseInt, underscoreOK, digitZero, trim, rightShift, prefixIsLessThan, leftShift, shouldRoundUp, eiselLemire64, eiselLemire32, frexp10Many, adjustLastDigitFixed, adjustLastDigit, AppendFloat, genericFtoa, bigFtoa, formatDigits, roundShortest, fmtE, fmtF, fmtB, fmtX, min, max, FormatUint, FormatInt, Itoa, small, formatBits, isPowerOfTwo, quoteWith, appendQuotedWith, appendQuotedRuneWith, appendEscapedRune, Quote, AppendQuote, QuoteToASCII, AppendQuoteToASCII, AppendQuoteRune, AppendQuoteRuneToASCII, CanBackquote, unhex, UnquoteChar, Unquote, contains, bsearch16, bsearch32, IsPrint, isInGraphicList;
	errors = $packages["errors"];
	bytealg = $packages["internal/bytealg"];
	math = $packages["math"];
	bits = $packages["math/bits"];
	utf8 = $packages["unicode/utf8"];
	NumError = $pkg.NumError = $newType(0, $kindStruct, "strconv.NumError", true, "strconv", true, function(Func_, Num_, Err_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Func = "";
			this.Num = "";
			this.Err = $ifaceNil;
			return;
		}
		this.Func = Func_;
		this.Num = Num_;
		this.Err = Err_;
	});
	decimal = $pkg.decimal = $newType(0, $kindStruct, "strconv.decimal", true, "strconv", false, function(d_, nd_, dp_, neg_, trunc_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.d = arrayType$1.zero();
			this.nd = 0;
			this.dp = 0;
			this.neg = false;
			this.trunc = false;
			return;
		}
		this.d = d_;
		this.nd = nd_;
		this.dp = dp_;
		this.neg = neg_;
		this.trunc = trunc_;
	});
	leftCheat = $pkg.leftCheat = $newType(0, $kindStruct, "strconv.leftCheat", true, "strconv", false, function(delta_, cutoff_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.delta = 0;
			this.cutoff = "";
			return;
		}
		this.delta = delta_;
		this.cutoff = cutoff_;
	});
	extFloat = $pkg.extFloat = $newType(0, $kindStruct, "strconv.extFloat", true, "strconv", false, function(mant_, exp_, neg_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.mant = new $Uint64(0, 0);
			this.exp = 0;
			this.neg = false;
			return;
		}
		this.mant = mant_;
		this.exp = exp_;
		this.neg = neg_;
	});
	floatInfo = $pkg.floatInfo = $newType(0, $kindStruct, "strconv.floatInfo", true, "strconv", false, function(mantbits_, expbits_, bias_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.mantbits = 0;
			this.expbits = 0;
			this.bias = 0;
			return;
		}
		this.mantbits = mantbits_;
		this.expbits = expbits_;
		this.bias = bias_;
	});
	decimalSlice = $pkg.decimalSlice = $newType(0, $kindStruct, "strconv.decimalSlice", true, "strconv", false, function(d_, nd_, dp_, neg_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.d = sliceType$6.nil;
			this.nd = 0;
			this.dp = 0;
			this.neg = false;
			return;
		}
		this.d = d_;
		this.nd = nd_;
		this.dp = dp_;
		this.neg = neg_;
	});
	sliceType = $sliceType($Int);
	sliceType$1 = $sliceType($Float64);
	sliceType$2 = $sliceType($Float32);
	sliceType$3 = $sliceType(leftCheat);
	arrayType = $arrayType($Uint64, 2);
	sliceType$4 = $sliceType($Uint16);
	sliceType$5 = $sliceType($Uint32);
	ptrType = $ptrType(NumError);
	arrayType$1 = $arrayType($Uint8, 800);
	sliceType$6 = $sliceType($Uint8);
	arrayType$2 = $arrayType($Uint8, 24);
	arrayType$3 = $arrayType($Uint8, 32);
	ptrType$1 = $ptrType(floatInfo);
	arrayType$4 = $arrayType($Uint8, 65);
	arrayType$5 = $arrayType($Uint8, 4);
	ptrType$2 = $ptrType(decimal);
	ptrType$3 = $ptrType(decimalSlice);
	ptrType$4 = $ptrType(extFloat);
	commonPrefixLenIgnoreCase = function(s, prefix) {
		var c, i, n, prefix, s;
		n = prefix.length;
		if (n > s.length) {
			n = s.length;
		}
		i = 0;
		while (true) {
			if (!(i < n)) { break; }
			c = s.charCodeAt(i);
			if (65 <= c && c <= 90) {
				c = c + (32) << 24 >>> 24;
			}
			if (!((c === prefix.charCodeAt(i)))) {
				return i;
			}
			i = i + (1) >> 0;
		}
		return n;
	};
	special = function(s) {
		var _1, _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, f, n, n$1, nsign, ok, s, sign;
		f = 0;
		n = 0;
		ok = false;
		if (s.length === 0) {
			_tmp = 0;
			_tmp$1 = 0;
			_tmp$2 = false;
			f = _tmp;
			n = _tmp$1;
			ok = _tmp$2;
			return [f, n, ok];
		}
		sign = 1;
		nsign = 0;
		_1 = s.charCodeAt(0);
		if ((_1 === (43)) || (_1 === (45))) {
			if (s.charCodeAt(0) === 45) {
				sign = -1;
			}
			nsign = 1;
			s = $substring(s, 1);
			n$1 = commonPrefixLenIgnoreCase(s, "infinity");
			if (3 < n$1 && n$1 < 8) {
				n$1 = 3;
			}
			if ((n$1 === 3) || (n$1 === 8)) {
				_tmp$3 = math.Inf(sign);
				_tmp$4 = nsign + n$1 >> 0;
				_tmp$5 = true;
				f = _tmp$3;
				n = _tmp$4;
				ok = _tmp$5;
				return [f, n, ok];
			}
		} else if ((_1 === (105)) || (_1 === (73))) {
			n$1 = commonPrefixLenIgnoreCase(s, "infinity");
			if (3 < n$1 && n$1 < 8) {
				n$1 = 3;
			}
			if ((n$1 === 3) || (n$1 === 8)) {
				_tmp$6 = math.Inf(sign);
				_tmp$7 = nsign + n$1 >> 0;
				_tmp$8 = true;
				f = _tmp$6;
				n = _tmp$7;
				ok = _tmp$8;
				return [f, n, ok];
			}
		} else if ((_1 === (110)) || (_1 === (78))) {
			if (commonPrefixLenIgnoreCase(s, "nan") === 3) {
				_tmp$9 = math.NaN();
				_tmp$10 = 3;
				_tmp$11 = true;
				f = _tmp$9;
				n = _tmp$10;
				ok = _tmp$11;
				return [f, n, ok];
			}
		}
		_tmp$12 = 0;
		_tmp$13 = 0;
		_tmp$14 = false;
		f = _tmp$12;
		n = _tmp$13;
		ok = _tmp$14;
		return [f, n, ok];
	};
	decimal.ptr.prototype.set = function(s) {
		var b, e, esign, i, ok, s, sawdigits, sawdot, x, x$1;
		ok = false;
		b = this;
		i = 0;
		b.neg = false;
		b.trunc = false;
		if (i >= s.length) {
			return ok;
		}
		if ((s.charCodeAt(i) === 43)) {
			i = i + (1) >> 0;
		} else if ((s.charCodeAt(i) === 45)) {
			b.neg = true;
			i = i + (1) >> 0;
		}
		sawdot = false;
		sawdigits = false;
		while (true) {
			if (!(i < s.length)) { break; }
			if ((s.charCodeAt(i) === 95)) {
				i = i + (1) >> 0;
				continue;
			} else if ((s.charCodeAt(i) === 46)) {
				if (sawdot) {
					return ok;
				}
				sawdot = true;
				b.dp = b.nd;
				i = i + (1) >> 0;
				continue;
			} else if (48 <= s.charCodeAt(i) && s.charCodeAt(i) <= 57) {
				sawdigits = true;
				if ((s.charCodeAt(i) === 48) && (b.nd === 0)) {
					b.dp = b.dp - (1) >> 0;
					i = i + (1) >> 0;
					continue;
				}
				if (b.nd < 800) {
					(x = b.d, x$1 = b.nd, ((x$1 < 0 || x$1 >= x.length) ? ($throwRuntimeError("index out of range"), undefined) : x[x$1] = s.charCodeAt(i)));
					b.nd = b.nd + (1) >> 0;
				} else if (!((s.charCodeAt(i) === 48))) {
					b.trunc = true;
				}
				i = i + (1) >> 0;
				continue;
			}
			break;
		}
		if (!sawdigits) {
			return ok;
		}
		if (!sawdot) {
			b.dp = b.nd;
		}
		if (i < s.length && (lower(s.charCodeAt(i)) === 101)) {
			i = i + (1) >> 0;
			if (i >= s.length) {
				return ok;
			}
			esign = 1;
			if (s.charCodeAt(i) === 43) {
				i = i + (1) >> 0;
			} else if (s.charCodeAt(i) === 45) {
				i = i + (1) >> 0;
				esign = -1;
			}
			if (i >= s.length || s.charCodeAt(i) < 48 || s.charCodeAt(i) > 57) {
				return ok;
			}
			e = 0;
			while (true) {
				if (!(i < s.length && (48 <= s.charCodeAt(i) && s.charCodeAt(i) <= 57 || (s.charCodeAt(i) === 95)))) { break; }
				if (s.charCodeAt(i) === 95) {
					i = i + (1) >> 0;
					continue;
				}
				if (e < 10000) {
					e = (($imul(e, 10)) + ((s.charCodeAt(i) >> 0)) >> 0) - 48 >> 0;
				}
				i = i + (1) >> 0;
			}
			b.dp = b.dp + (($imul(e, esign))) >> 0;
		}
		if (!((i === s.length))) {
			return ok;
		}
		ok = true;
		return ok;
	};
	decimal.prototype.set = function(s) { return this.$val.set(s); };
	readFloat = function(s) {
		var _1, base, c, dp, e, esign, exp, expChar, hex, i, mantissa, maxMantDigits, nd, ndMant, neg, ok, s, sawdigits, sawdot, trunc, underscores, x, x$1;
		mantissa = new $Uint64(0, 0);
		exp = 0;
		neg = false;
		trunc = false;
		hex = false;
		i = 0;
		ok = false;
		underscores = false;
		if (i >= s.length) {
			return [mantissa, exp, neg, trunc, hex, i, ok];
		}
		if ((s.charCodeAt(i) === 43)) {
			i = i + (1) >> 0;
		} else if ((s.charCodeAt(i) === 45)) {
			neg = true;
			i = i + (1) >> 0;
		}
		base = new $Uint64(0, 10);
		maxMantDigits = 19;
		expChar = 101;
		if ((i + 2 >> 0) < s.length && (s.charCodeAt(i) === 48) && (lower(s.charCodeAt((i + 1 >> 0))) === 120)) {
			base = new $Uint64(0, 16);
			maxMantDigits = 16;
			i = i + (2) >> 0;
			expChar = 112;
			hex = true;
		}
		sawdot = false;
		sawdigits = false;
		nd = 0;
		ndMant = 0;
		dp = 0;
		loop:
		while (true) {
			if (!(i < s.length)) { break; }
			c = s.charCodeAt(i);
			_1 = true;
			if (_1 === ((c === 95))) {
				underscores = true;
				i = i + (1) >> 0;
				continue;
			} else if (_1 === ((c === 46))) {
				if (sawdot) {
					break loop;
				}
				sawdot = true;
				dp = nd;
				i = i + (1) >> 0;
				continue;
			} else if (_1 === (48 <= c && c <= 57)) {
				sawdigits = true;
				if ((c === 48) && (nd === 0)) {
					dp = dp - (1) >> 0;
					i = i + (1) >> 0;
					continue;
				}
				nd = nd + (1) >> 0;
				if (ndMant < maxMantDigits) {
					mantissa = $mul64(mantissa, (base));
					mantissa = (x = (new $Uint64(0, (c - 48 << 24 >>> 24))), new $Uint64(mantissa.$high + x.$high, mantissa.$low + x.$low));
					ndMant = ndMant + (1) >> 0;
				} else if (!((c === 48))) {
					trunc = true;
				}
				i = i + (1) >> 0;
				continue;
			} else if (_1 === ((base.$high === 0 && base.$low === 16) && 97 <= lower(c) && lower(c) <= 102)) {
				sawdigits = true;
				nd = nd + (1) >> 0;
				if (ndMant < maxMantDigits) {
					mantissa = $mul64(mantissa, (new $Uint64(0, 16)));
					mantissa = (x$1 = (new $Uint64(0, ((lower(c) - 97 << 24 >>> 24) + 10 << 24 >>> 24))), new $Uint64(mantissa.$high + x$1.$high, mantissa.$low + x$1.$low));
					ndMant = ndMant + (1) >> 0;
				} else {
					trunc = true;
				}
				i = i + (1) >> 0;
				continue;
			}
			break;
		}
		if (!sawdigits) {
			return [mantissa, exp, neg, trunc, hex, i, ok];
		}
		if (!sawdot) {
			dp = nd;
		}
		if ((base.$high === 0 && base.$low === 16)) {
			dp = $imul(dp, (4));
			ndMant = $imul(ndMant, (4));
		}
		if (i < s.length && (lower(s.charCodeAt(i)) === expChar)) {
			i = i + (1) >> 0;
			if (i >= s.length) {
				return [mantissa, exp, neg, trunc, hex, i, ok];
			}
			esign = 1;
			if (s.charCodeAt(i) === 43) {
				i = i + (1) >> 0;
			} else if (s.charCodeAt(i) === 45) {
				i = i + (1) >> 0;
				esign = -1;
			}
			if (i >= s.length || s.charCodeAt(i) < 48 || s.charCodeAt(i) > 57) {
				return [mantissa, exp, neg, trunc, hex, i, ok];
			}
			e = 0;
			while (true) {
				if (!(i < s.length && (48 <= s.charCodeAt(i) && s.charCodeAt(i) <= 57 || (s.charCodeAt(i) === 95)))) { break; }
				if (s.charCodeAt(i) === 95) {
					underscores = true;
					i = i + (1) >> 0;
					continue;
				}
				if (e < 10000) {
					e = (($imul(e, 10)) + ((s.charCodeAt(i) >> 0)) >> 0) - 48 >> 0;
				}
				i = i + (1) >> 0;
			}
			dp = dp + (($imul(e, esign))) >> 0;
		} else if ((base.$high === 0 && base.$low === 16)) {
			return [mantissa, exp, neg, trunc, hex, i, ok];
		}
		if (!((mantissa.$high === 0 && mantissa.$low === 0))) {
			exp = dp - ndMant >> 0;
		}
		if (underscores && !underscoreOK($substring(s, 0, i))) {
			return [mantissa, exp, neg, trunc, hex, i, ok];
		}
		ok = true;
		return [mantissa, exp, neg, trunc, hex, i, ok];
	};
	decimal.ptr.prototype.floatBits = function(flt) {
		var _tmp, _tmp$1, b, bits$1, d, exp, flt, mant, n, n$1, n$2, overflow, x, x$1, x$2, x$3, x$4, x$5, x$6, x$7, x$8, y, y$1, y$2, y$3, $s;
		/* */ $s = 0; s: while (true) { switch ($s) { case 0:
		b = new $Uint64(0, 0);
		overflow = false;
		d = this;
		exp = 0;
		mant = new $Uint64(0, 0);
		/* */ if (d.nd === 0) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (d.nd === 0) { */ case 1:
			mant = new $Uint64(0, 0);
			exp = flt.bias;
			/* goto out */ $s = 3; continue;
		/* } */ case 2:
		/* */ if (d.dp > 310) { $s = 4; continue; }
		/* */ $s = 5; continue;
		/* if (d.dp > 310) { */ case 4:
			/* goto overflow */ $s = 6; continue;
		/* } */ case 5:
		/* */ if (d.dp < -330) { $s = 7; continue; }
		/* */ $s = 8; continue;
		/* if (d.dp < -330) { */ case 7:
			mant = new $Uint64(0, 0);
			exp = flt.bias;
			/* goto out */ $s = 3; continue;
		/* } */ case 8:
		exp = 0;
		while (true) {
			if (!(d.dp > 0)) { break; }
			n = 0;
			if (d.dp >= powtab.$length) {
				n = 27;
			} else {
				n = (x = d.dp, ((x < 0 || x >= powtab.$length) ? ($throwRuntimeError("index out of range"), undefined) : powtab.$array[powtab.$offset + x]));
			}
			d.Shift(-n);
			exp = exp + (n) >> 0;
		}
		while (true) {
			if (!(d.dp < 0 || (d.dp === 0) && d.d[0] < 53)) { break; }
			n$1 = 0;
			if (-d.dp >= powtab.$length) {
				n$1 = 27;
			} else {
				n$1 = (x$1 = -d.dp, ((x$1 < 0 || x$1 >= powtab.$length) ? ($throwRuntimeError("index out of range"), undefined) : powtab.$array[powtab.$offset + x$1]));
			}
			d.Shift(n$1);
			exp = exp - (n$1) >> 0;
		}
		exp = exp - (1) >> 0;
		if (exp < (flt.bias + 1 >> 0)) {
			n$2 = (flt.bias + 1 >> 0) - exp >> 0;
			d.Shift(-n$2);
			exp = exp + (n$2) >> 0;
		}
		/* */ if ((exp - flt.bias >> 0) >= (((y = flt.expbits, y < 32 ? (1 << y) : 0) >> 0) - 1 >> 0)) { $s = 9; continue; }
		/* */ $s = 10; continue;
		/* if ((exp - flt.bias >> 0) >= (((y = flt.expbits, y < 32 ? (1 << y) : 0) >> 0) - 1 >> 0)) { */ case 9:
			/* goto overflow */ $s = 6; continue;
		/* } */ case 10:
		d.Shift((((1 + flt.mantbits >>> 0) >> 0)));
		mant = d.RoundedInteger();
		/* */ if ((x$2 = $shiftLeft64(new $Uint64(0, 2), flt.mantbits), (mant.$high === x$2.$high && mant.$low === x$2.$low))) { $s = 11; continue; }
		/* */ $s = 12; continue;
		/* if ((x$2 = $shiftLeft64(new $Uint64(0, 2), flt.mantbits), (mant.$high === x$2.$high && mant.$low === x$2.$low))) { */ case 11:
			mant = $shiftRightUint64(mant, (1));
			exp = exp + (1) >> 0;
			/* */ if ((exp - flt.bias >> 0) >= (((y$1 = flt.expbits, y$1 < 32 ? (1 << y$1) : 0) >> 0) - 1 >> 0)) { $s = 13; continue; }
			/* */ $s = 14; continue;
			/* if ((exp - flt.bias >> 0) >= (((y$1 = flt.expbits, y$1 < 32 ? (1 << y$1) : 0) >> 0) - 1 >> 0)) { */ case 13:
				/* goto overflow */ $s = 6; continue;
			/* } */ case 14:
		/* } */ case 12:
		if ((x$3 = (x$4 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), new $Uint64(mant.$high & x$4.$high, (mant.$low & x$4.$low) >>> 0)), (x$3.$high === 0 && x$3.$low === 0))) {
			exp = flt.bias;
		}
		/* goto out */ $s = 3; continue;
		/* overflow: */ case 6:
		mant = new $Uint64(0, 0);
		exp = (((y$2 = flt.expbits, y$2 < 32 ? (1 << y$2) : 0) >> 0) - 1 >> 0) + flt.bias >> 0;
		overflow = true;
		/* out: */ case 3:
		bits$1 = (x$5 = (x$6 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), new $Uint64(x$6.$high - 0, x$6.$low - 1)), new $Uint64(mant.$high & x$5.$high, (mant.$low & x$5.$low) >>> 0));
		bits$1 = (x$7 = $shiftLeft64((new $Uint64(0, (((exp - flt.bias >> 0)) & ((((y$3 = flt.expbits, y$3 < 32 ? (1 << y$3) : 0) >> 0) - 1 >> 0))))), flt.mantbits), new $Uint64(bits$1.$high | x$7.$high, (bits$1.$low | x$7.$low) >>> 0));
		if (d.neg) {
			bits$1 = (x$8 = $shiftLeft64($shiftLeft64(new $Uint64(0, 1), flt.mantbits), flt.expbits), new $Uint64(bits$1.$high | x$8.$high, (bits$1.$low | x$8.$low) >>> 0));
		}
		_tmp = bits$1;
		_tmp$1 = overflow;
		b = _tmp;
		overflow = _tmp$1;
		$s = -1; return [b, overflow];
		/* */ } return; }
	};
	decimal.prototype.floatBits = function(flt) { return this.$val.floatBits(flt); };
	atof64exact = function(mantissa, exp, neg) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, exp, f, mantissa, neg, ok, x, x$1, x$2;
		f = 0;
		ok = false;
		if (!((x = $shiftRightUint64(mantissa, float64info.mantbits), (x.$high === 0 && x.$low === 0)))) {
			return [f, ok];
		}
		f = ($flatten64(mantissa));
		if (neg) {
			f = -f;
		}
		if ((exp === 0)) {
			_tmp = f;
			_tmp$1 = true;
			f = _tmp;
			ok = _tmp$1;
			return [f, ok];
		} else if (exp > 0 && exp <= 37) {
			if (exp > 22) {
				f = f * ((x$1 = exp - 22 >> 0, ((x$1 < 0 || x$1 >= float64pow10.$length) ? ($throwRuntimeError("index out of range"), undefined) : float64pow10.$array[float64pow10.$offset + x$1])));
				exp = 22;
			}
			if (f > 1e+15 || f < -1e+15) {
				return [f, ok];
			}
			_tmp$2 = f * ((exp < 0 || exp >= float64pow10.$length) ? ($throwRuntimeError("index out of range"), undefined) : float64pow10.$array[float64pow10.$offset + exp]);
			_tmp$3 = true;
			f = _tmp$2;
			ok = _tmp$3;
			return [f, ok];
		} else if (exp < 0 && exp >= -22) {
			_tmp$4 = f / (x$2 = -exp, ((x$2 < 0 || x$2 >= float64pow10.$length) ? ($throwRuntimeError("index out of range"), undefined) : float64pow10.$array[float64pow10.$offset + x$2]));
			_tmp$5 = true;
			f = _tmp$4;
			ok = _tmp$5;
			return [f, ok];
		}
		return [f, ok];
	};
	atof32exact = function(mantissa, exp, neg) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, exp, f, mantissa, neg, ok, x, x$1, x$2;
		f = 0;
		ok = false;
		if (!((x = $shiftRightUint64(mantissa, float32info.mantbits), (x.$high === 0 && x.$low === 0)))) {
			return [f, ok];
		}
		f = ($flatten64(mantissa));
		if (neg) {
			f = -f;
		}
		if ((exp === 0)) {
			_tmp = f;
			_tmp$1 = true;
			f = _tmp;
			ok = _tmp$1;
			return [f, ok];
		} else if (exp > 0 && exp <= 17) {
			if (exp > 10) {
				f = $fround(f * ((x$1 = exp - 10 >> 0, ((x$1 < 0 || x$1 >= float32pow10.$length) ? ($throwRuntimeError("index out of range"), undefined) : float32pow10.$array[float32pow10.$offset + x$1]))));
				exp = 10;
			}
			if (f > 1e+07 || f < -1e+07) {
				return [f, ok];
			}
			_tmp$2 = $fround(f * ((exp < 0 || exp >= float32pow10.$length) ? ($throwRuntimeError("index out of range"), undefined) : float32pow10.$array[float32pow10.$offset + exp]));
			_tmp$3 = true;
			f = _tmp$2;
			ok = _tmp$3;
			return [f, ok];
		} else if (exp < 0 && exp >= -10) {
			_tmp$4 = $fround(f / (x$2 = -exp, ((x$2 < 0 || x$2 >= float32pow10.$length) ? ($throwRuntimeError("index out of range"), undefined) : float32pow10.$array[float32pow10.$offset + x$2])));
			_tmp$5 = true;
			f = _tmp$4;
			ok = _tmp$5;
			return [f, ok];
		}
		return [f, ok];
	};
	atofHex = function(s, flt, mantissa, exp, neg, trunc) {
		var bits$1, err, exp, flt, mantissa, maxExp, minExp, neg, round, s, trunc, x, x$1, x$10, x$11, x$12, x$13, x$14, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9, y, y$1;
		maxExp = (((y = flt.expbits, y < 32 ? (1 << y) : 0) >> 0) + flt.bias >> 0) - 2 >> 0;
		minExp = flt.bias + 1 >> 0;
		exp = exp + (((flt.mantbits >> 0))) >> 0;
		while (true) {
			if (!(!((mantissa.$high === 0 && mantissa.$low === 0)) && (x = $shiftRightUint64(mantissa, ((flt.mantbits + 2 >>> 0))), (x.$high === 0 && x.$low === 0)))) { break; }
			mantissa = $shiftLeft64(mantissa, (1));
			exp = exp - (1) >> 0;
		}
		if (trunc) {
			mantissa = (x$1 = new $Uint64(0, 1), new $Uint64(mantissa.$high | x$1.$high, (mantissa.$low | x$1.$low) >>> 0));
		}
		while (true) {
			if (!(!((x$2 = $shiftRightUint64(mantissa, (((1 + flt.mantbits >>> 0) + 2 >>> 0))), (x$2.$high === 0 && x$2.$low === 0))))) { break; }
			mantissa = (x$3 = $shiftRightUint64(mantissa, 1), x$4 = new $Uint64(mantissa.$high & 0, (mantissa.$low & 1) >>> 0), new $Uint64(x$3.$high | x$4.$high, (x$3.$low | x$4.$low) >>> 0));
			exp = exp + (1) >> 0;
		}
		while (true) {
			if (!((mantissa.$high > 0 || (mantissa.$high === 0 && mantissa.$low > 1)) && exp < (minExp - 2 >> 0))) { break; }
			mantissa = (x$5 = $shiftRightUint64(mantissa, 1), x$6 = new $Uint64(mantissa.$high & 0, (mantissa.$low & 1) >>> 0), new $Uint64(x$5.$high | x$6.$high, (x$5.$low | x$6.$low) >>> 0));
			exp = exp + (1) >> 0;
		}
		round = new $Uint64(mantissa.$high & 0, (mantissa.$low & 3) >>> 0);
		mantissa = $shiftRightUint64(mantissa, (2));
		round = (x$7 = new $Uint64(mantissa.$high & 0, (mantissa.$low & 1) >>> 0), new $Uint64(round.$high | x$7.$high, (round.$low | x$7.$low) >>> 0));
		exp = exp + (2) >> 0;
		if ((round.$high === 0 && round.$low === 3)) {
			mantissa = (x$8 = new $Uint64(0, 1), new $Uint64(mantissa.$high + x$8.$high, mantissa.$low + x$8.$low));
			if ((x$9 = $shiftLeft64(new $Uint64(0, 1), ((1 + flt.mantbits >>> 0))), (mantissa.$high === x$9.$high && mantissa.$low === x$9.$low))) {
				mantissa = $shiftRightUint64(mantissa, (1));
				exp = exp + (1) >> 0;
			}
		}
		if ((x$10 = $shiftRightUint64(mantissa, flt.mantbits), (x$10.$high === 0 && x$10.$low === 0))) {
			exp = flt.bias;
		}
		err = $ifaceNil;
		if (exp > maxExp) {
			mantissa = $shiftLeft64(new $Uint64(0, 1), flt.mantbits);
			exp = maxExp + 1 >> 0;
			err = rangeError("ParseFloat", s);
		}
		bits$1 = (x$11 = (x$12 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), new $Uint64(x$12.$high - 0, x$12.$low - 1)), new $Uint64(mantissa.$high & x$11.$high, (mantissa.$low & x$11.$low) >>> 0));
		bits$1 = (x$13 = $shiftLeft64((new $Uint64(0, (((exp - flt.bias >> 0)) & ((((y$1 = flt.expbits, y$1 < 32 ? (1 << y$1) : 0) >> 0) - 1 >> 0))))), flt.mantbits), new $Uint64(bits$1.$high | x$13.$high, (bits$1.$low | x$13.$low) >>> 0));
		if (neg) {
			bits$1 = (x$14 = $shiftLeft64($shiftLeft64(new $Uint64(0, 1), flt.mantbits), flt.expbits), new $Uint64(bits$1.$high | x$14.$high, (bits$1.$low | x$14.$low) >>> 0));
		}
		if (flt === float32info) {
			return [(math.Float32frombits(((bits$1.$low >>> 0)))), err];
		}
		return [math.Float64frombits(bits$1), err];
	};
	atof32 = function(s) {
		var _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$18, _tmp$19, _tmp$2, _tmp$20, _tmp$21, _tmp$22, _tmp$23, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tuple, _tuple$1, _tuple$2, _tuple$3, _tuple$4, _tuple$5, _tuple$6, b, d, err, err$1, exp, f, f$1, f$2, f$3, fUp, hex, mantissa, n, n$1, neg, ok, ok$1, ok$2, ok$3, ok$4, ovf, s, trunc, val;
		f = 0;
		n = 0;
		err = $ifaceNil;
		_tuple = special(s);
		val = _tuple[0];
		n$1 = _tuple[1];
		ok = _tuple[2];
		if (ok) {
			_tmp = ($fround(val));
			_tmp$1 = n$1;
			_tmp$2 = $ifaceNil;
			f = _tmp;
			n = _tmp$1;
			err = _tmp$2;
			return [f, n, err];
		}
		_tuple$1 = readFloat(s);
		mantissa = _tuple$1[0];
		exp = _tuple$1[1];
		neg = _tuple$1[2];
		trunc = _tuple$1[3];
		hex = _tuple$1[4];
		n = _tuple$1[5];
		ok$1 = _tuple$1[6];
		if (!ok$1) {
			_tmp$3 = 0;
			_tmp$4 = n;
			_tmp$5 = syntaxError("ParseFloat", s);
			f = _tmp$3;
			n = _tmp$4;
			err = _tmp$5;
			return [f, n, err];
		}
		if (hex) {
			_tuple$2 = atofHex($substring(s, 0, n), float32info, mantissa, exp, neg, trunc);
			f$1 = _tuple$2[0];
			err$1 = _tuple$2[1];
			_tmp$6 = ($fround(f$1));
			_tmp$7 = n;
			_tmp$8 = err$1;
			f = _tmp$6;
			n = _tmp$7;
			err = _tmp$8;
			return [f, n, err];
		}
		if (optimize) {
			if (!trunc) {
				_tuple$3 = atof32exact(mantissa, exp, neg);
				f$2 = _tuple$3[0];
				ok$2 = _tuple$3[1];
				if (ok$2) {
					_tmp$9 = f$2;
					_tmp$10 = n;
					_tmp$11 = $ifaceNil;
					f = _tmp$9;
					n = _tmp$10;
					err = _tmp$11;
					return [f, n, err];
				}
			}
			_tuple$4 = eiselLemire32(mantissa, exp, neg);
			f$3 = _tuple$4[0];
			ok$3 = _tuple$4[1];
			if (ok$3) {
				if (!trunc) {
					_tmp$12 = f$3;
					_tmp$13 = n;
					_tmp$14 = $ifaceNil;
					f = _tmp$12;
					n = _tmp$13;
					err = _tmp$14;
					return [f, n, err];
				}
				_tuple$5 = eiselLemire32(new $Uint64(mantissa.$high + 0, mantissa.$low + 1), exp, neg);
				fUp = _tuple$5[0];
				ok$4 = _tuple$5[1];
				if (ok$4 && (f$3 === fUp)) {
					_tmp$15 = f$3;
					_tmp$16 = n;
					_tmp$17 = $ifaceNil;
					f = _tmp$15;
					n = _tmp$16;
					err = _tmp$17;
					return [f, n, err];
				}
			}
		}
		d = new decimal.ptr(arrayType$1.zero(), 0, 0, false, false);
		if (!d.set($substring(s, 0, n))) {
			_tmp$18 = 0;
			_tmp$19 = n;
			_tmp$20 = syntaxError("ParseFloat", s);
			f = _tmp$18;
			n = _tmp$19;
			err = _tmp$20;
			return [f, n, err];
		}
		_tuple$6 = d.floatBits(float32info);
		b = _tuple$6[0];
		ovf = _tuple$6[1];
		f = math.Float32frombits(((b.$low >>> 0)));
		if (ovf) {
			err = rangeError("ParseFloat", s);
		}
		_tmp$21 = f;
		_tmp$22 = n;
		_tmp$23 = err;
		f = _tmp$21;
		n = _tmp$22;
		err = _tmp$23;
		return [f, n, err];
	};
	atof64 = function(s) {
		var _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$18, _tmp$19, _tmp$2, _tmp$20, _tmp$21, _tmp$22, _tmp$23, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tuple, _tuple$1, _tuple$2, _tuple$3, _tuple$4, _tuple$5, _tuple$6, b, d, err, err$1, exp, f, f$1, f$2, f$3, fUp, hex, mantissa, n, n$1, neg, ok, ok$1, ok$2, ok$3, ok$4, ovf, s, trunc, val;
		f = 0;
		n = 0;
		err = $ifaceNil;
		_tuple = special(s);
		val = _tuple[0];
		n$1 = _tuple[1];
		ok = _tuple[2];
		if (ok) {
			_tmp = val;
			_tmp$1 = n$1;
			_tmp$2 = $ifaceNil;
			f = _tmp;
			n = _tmp$1;
			err = _tmp$2;
			return [f, n, err];
		}
		_tuple$1 = readFloat(s);
		mantissa = _tuple$1[0];
		exp = _tuple$1[1];
		neg = _tuple$1[2];
		trunc = _tuple$1[3];
		hex = _tuple$1[4];
		n = _tuple$1[5];
		ok$1 = _tuple$1[6];
		if (!ok$1) {
			_tmp$3 = 0;
			_tmp$4 = n;
			_tmp$5 = syntaxError("ParseFloat", s);
			f = _tmp$3;
			n = _tmp$4;
			err = _tmp$5;
			return [f, n, err];
		}
		if (hex) {
			_tuple$2 = atofHex($substring(s, 0, n), float64info, mantissa, exp, neg, trunc);
			f$1 = _tuple$2[0];
			err$1 = _tuple$2[1];
			_tmp$6 = f$1;
			_tmp$7 = n;
			_tmp$8 = err$1;
			f = _tmp$6;
			n = _tmp$7;
			err = _tmp$8;
			return [f, n, err];
		}
		if (optimize) {
			if (!trunc) {
				_tuple$3 = atof64exact(mantissa, exp, neg);
				f$2 = _tuple$3[0];
				ok$2 = _tuple$3[1];
				if (ok$2) {
					_tmp$9 = f$2;
					_tmp$10 = n;
					_tmp$11 = $ifaceNil;
					f = _tmp$9;
					n = _tmp$10;
					err = _tmp$11;
					return [f, n, err];
				}
			}
			_tuple$4 = eiselLemire64(mantissa, exp, neg);
			f$3 = _tuple$4[0];
			ok$3 = _tuple$4[1];
			if (ok$3) {
				if (!trunc) {
					_tmp$12 = f$3;
					_tmp$13 = n;
					_tmp$14 = $ifaceNil;
					f = _tmp$12;
					n = _tmp$13;
					err = _tmp$14;
					return [f, n, err];
				}
				_tuple$5 = eiselLemire64(new $Uint64(mantissa.$high + 0, mantissa.$low + 1), exp, neg);
				fUp = _tuple$5[0];
				ok$4 = _tuple$5[1];
				if (ok$4 && (f$3 === fUp)) {
					_tmp$15 = f$3;
					_tmp$16 = n;
					_tmp$17 = $ifaceNil;
					f = _tmp$15;
					n = _tmp$16;
					err = _tmp$17;
					return [f, n, err];
				}
			}
		}
		d = new decimal.ptr(arrayType$1.zero(), 0, 0, false, false);
		if (!d.set($substring(s, 0, n))) {
			_tmp$18 = 0;
			_tmp$19 = n;
			_tmp$20 = syntaxError("ParseFloat", s);
			f = _tmp$18;
			n = _tmp$19;
			err = _tmp$20;
			return [f, n, err];
		}
		_tuple$6 = d.floatBits(float64info);
		b = _tuple$6[0];
		ovf = _tuple$6[1];
		f = math.Float64frombits(b);
		if (ovf) {
			err = rangeError("ParseFloat", s);
		}
		_tmp$21 = f;
		_tmp$22 = n;
		_tmp$23 = err;
		f = _tmp$21;
		n = _tmp$22;
		err = _tmp$23;
		return [f, n, err];
	};
	ParseFloat = function(s, bitSize) {
		var _tuple, bitSize, err, f, n, s;
		_tuple = parseFloatPrefix(s, bitSize);
		f = _tuple[0];
		n = _tuple[1];
		err = _tuple[2];
		if ($interfaceIsEqual(err, $ifaceNil) && !((n === s.length))) {
			return [0, syntaxError("ParseFloat", s)];
		}
		return [f, err];
	};
	$pkg.ParseFloat = ParseFloat;
	parseFloatPrefix = function(s, bitSize) {
		var _tuple, bitSize, err, f, n, s;
		if (bitSize === 32) {
			_tuple = atof32(s);
			f = _tuple[0];
			n = _tuple[1];
			err = _tuple[2];
			return [(f), n, err];
		}
		return atof64(s);
	};
	lower = function(c) {
		var c;
		return (c | 32) >>> 0;
	};
	NumError.ptr.prototype.Error = function() {
		var _r, e, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; e = $f.e; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		e = this;
		_r = e.Err.Error(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return "strconv." + e.Func + ": " + "parsing " + Quote(e.Num) + ": " + _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: NumError.ptr.prototype.Error }; } $f._r = _r; $f.e = e; $f.$s = $s; $f.$r = $r; return $f;
	};
	NumError.prototype.Error = function() { return this.$val.Error(); };
	NumError.ptr.prototype.Unwrap = function() {
		var e;
		e = this;
		return e.Err;
	};
	NumError.prototype.Unwrap = function() { return this.$val.Unwrap(); };
	syntaxError = function(fn, str) {
		var fn, str;
		return new NumError.ptr(fn, str, $pkg.ErrSyntax);
	};
	rangeError = function(fn, str) {
		var fn, str;
		return new NumError.ptr(fn, str, $pkg.ErrRange);
	};
	baseError = function(fn, str, base) {
		var base, fn, str;
		return new NumError.ptr(fn, str, errors.New("invalid base " + Itoa(base)));
	};
	bitSizeError = function(fn, str, bitSize) {
		var bitSize, fn, str;
		return new NumError.ptr(fn, str, errors.New("invalid bit size " + Itoa(bitSize)));
	};
	ParseUint = function(s, base, bitSize) {
		var _1, _i, _ref, base, base0, bitSize, c, cutoff, d, maxVal, n, n1, s, s0, underscores, x, x$1, x$2;
		if (s === "") {
			return [new $Uint64(0, 0), syntaxError("ParseUint", s)];
		}
		base0 = base === 0;
		s0 = s;
		if (2 <= base && base <= 36) {
		} else if ((base === 0)) {
			base = 10;
			if (s.charCodeAt(0) === 48) {
				if (s.length >= 3 && (lower(s.charCodeAt(1)) === 98)) {
					base = 2;
					s = $substring(s, 2);
				} else if (s.length >= 3 && (lower(s.charCodeAt(1)) === 111)) {
					base = 8;
					s = $substring(s, 2);
				} else if (s.length >= 3 && (lower(s.charCodeAt(1)) === 120)) {
					base = 16;
					s = $substring(s, 2);
				} else {
					base = 8;
					s = $substring(s, 1);
				}
			}
		} else {
			return [new $Uint64(0, 0), baseError("ParseUint", s0, base)];
		}
		if (bitSize === 0) {
			bitSize = 32;
		} else if (bitSize < 0 || bitSize > 64) {
			return [new $Uint64(0, 0), bitSizeError("ParseUint", s0, bitSize)];
		}
		cutoff = new $Uint64(0, 0);
		_1 = base;
		if (_1 === (10)) {
			cutoff = new $Uint64(429496729, 2576980378);
		} else if (_1 === (16)) {
			cutoff = new $Uint64(268435456, 0);
		} else {
			cutoff = (x = $div64(new $Uint64(4294967295, 4294967295), (new $Uint64(0, base)), false), new $Uint64(x.$high + 0, x.$low + 1));
		}
		maxVal = (x$1 = $shiftLeft64(new $Uint64(0, 1), ((bitSize >>> 0))), new $Uint64(x$1.$high - 0, x$1.$low - 1));
		underscores = false;
		n = new $Uint64(0, 0);
		_ref = (new sliceType$6($stringToBytes(s)));
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			c = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			d = 0;
			if ((c === 95) && base0) {
				underscores = true;
				_i++;
				continue;
			} else if (48 <= c && c <= 57) {
				d = c - 48 << 24 >>> 24;
			} else if (97 <= lower(c) && lower(c) <= 122) {
				d = (lower(c) - 97 << 24 >>> 24) + 10 << 24 >>> 24;
			} else {
				return [new $Uint64(0, 0), syntaxError("ParseUint", s0)];
			}
			if (d >= ((base << 24 >>> 24))) {
				return [new $Uint64(0, 0), syntaxError("ParseUint", s0)];
			}
			if ((n.$high > cutoff.$high || (n.$high === cutoff.$high && n.$low >= cutoff.$low))) {
				return [maxVal, rangeError("ParseUint", s0)];
			}
			n = $mul64(n, ((new $Uint64(0, base))));
			n1 = (x$2 = (new $Uint64(0, d)), new $Uint64(n.$high + x$2.$high, n.$low + x$2.$low));
			if ((n1.$high < n.$high || (n1.$high === n.$high && n1.$low < n.$low)) || (n1.$high > maxVal.$high || (n1.$high === maxVal.$high && n1.$low > maxVal.$low))) {
				return [maxVal, rangeError("ParseUint", s0)];
			}
			n = n1;
			_i++;
		}
		if (underscores && !underscoreOK(s0)) {
			return [new $Uint64(0, 0), syntaxError("ParseUint", s0)];
		}
		return [n, $ifaceNil];
	};
	$pkg.ParseUint = ParseUint;
	ParseInt = function(s, base, bitSize) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tuple, base, bitSize, cutoff, err, i, n, neg, s, s0, un, x, x$1;
		i = new $Int64(0, 0);
		err = $ifaceNil;
		if (s === "") {
			_tmp = new $Int64(0, 0);
			_tmp$1 = syntaxError("ParseInt", s);
			i = _tmp;
			err = _tmp$1;
			return [i, err];
		}
		s0 = s;
		neg = false;
		if (s.charCodeAt(0) === 43) {
			s = $substring(s, 1);
		} else if (s.charCodeAt(0) === 45) {
			neg = true;
			s = $substring(s, 1);
		}
		un = new $Uint64(0, 0);
		_tuple = ParseUint(s, base, bitSize);
		un = _tuple[0];
		err = _tuple[1];
		if (!($interfaceIsEqual(err, $ifaceNil)) && !($interfaceIsEqual($assertType(err, ptrType).Err, $pkg.ErrRange))) {
			$assertType(err, ptrType).Func = "ParseInt";
			$assertType(err, ptrType).Num = s0;
			_tmp$2 = new $Int64(0, 0);
			_tmp$3 = err;
			i = _tmp$2;
			err = _tmp$3;
			return [i, err];
		}
		if (bitSize === 0) {
			bitSize = 32;
		}
		cutoff = ($shiftLeft64(new $Uint64(0, 1), (((bitSize - 1 >> 0) >>> 0))));
		if (!neg && (un.$high > cutoff.$high || (un.$high === cutoff.$high && un.$low >= cutoff.$low))) {
			_tmp$4 = ((x = new $Uint64(cutoff.$high - 0, cutoff.$low - 1), new $Int64(x.$high, x.$low)));
			_tmp$5 = rangeError("ParseInt", s0);
			i = _tmp$4;
			err = _tmp$5;
			return [i, err];
		}
		if (neg && (un.$high > cutoff.$high || (un.$high === cutoff.$high && un.$low > cutoff.$low))) {
			_tmp$6 = (x$1 = (new $Int64(cutoff.$high, cutoff.$low)), new $Int64(-x$1.$high, -x$1.$low));
			_tmp$7 = rangeError("ParseInt", s0);
			i = _tmp$6;
			err = _tmp$7;
			return [i, err];
		}
		n = (new $Int64(un.$high, un.$low));
		if (neg) {
			n = new $Int64(-n.$high, -n.$low);
		}
		_tmp$8 = n;
		_tmp$9 = $ifaceNil;
		i = _tmp$8;
		err = _tmp$9;
		return [i, err];
	};
	$pkg.ParseInt = ParseInt;
	underscoreOK = function(s) {
		var hex, i, s, saw;
		saw = 94;
		i = 0;
		if (s.length >= 1 && ((s.charCodeAt(0) === 45) || (s.charCodeAt(0) === 43))) {
			s = $substring(s, 1);
		}
		hex = false;
		if (s.length >= 2 && (s.charCodeAt(0) === 48) && ((lower(s.charCodeAt(1)) === 98) || (lower(s.charCodeAt(1)) === 111) || (lower(s.charCodeAt(1)) === 120))) {
			i = 2;
			saw = 48;
			hex = lower(s.charCodeAt(1)) === 120;
		}
		while (true) {
			if (!(i < s.length)) { break; }
			if (48 <= s.charCodeAt(i) && s.charCodeAt(i) <= 57 || hex && 97 <= lower(s.charCodeAt(i)) && lower(s.charCodeAt(i)) <= 102) {
				saw = 48;
				i = i + (1) >> 0;
				continue;
			}
			if (s.charCodeAt(i) === 95) {
				if (!((saw === 48))) {
					return false;
				}
				saw = 95;
				i = i + (1) >> 0;
				continue;
			}
			if (saw === 95) {
				return false;
			}
			saw = 33;
			i = i + (1) >> 0;
		}
		return !((saw === 95));
	};
	decimal.ptr.prototype.String = function() {
		var a, buf, n, w;
		a = this;
		n = 10 + a.nd >> 0;
		if (a.dp > 0) {
			n = n + (a.dp) >> 0;
		}
		if (a.dp < 0) {
			n = n + (-a.dp) >> 0;
		}
		buf = $makeSlice(sliceType$6, n);
		w = 0;
		if ((a.nd === 0)) {
			return "0";
		} else if (a.dp <= 0) {
			((w < 0 || w >= buf.$length) ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + w] = 48);
			w = w + (1) >> 0;
			((w < 0 || w >= buf.$length) ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + w] = 46);
			w = w + (1) >> 0;
			w = w + (digitZero($subslice(buf, w, (w + -a.dp >> 0)))) >> 0;
			w = w + ($copySlice($subslice(buf, w), $subslice(new sliceType$6(a.d), 0, a.nd))) >> 0;
		} else if (a.dp < a.nd) {
			w = w + ($copySlice($subslice(buf, w), $subslice(new sliceType$6(a.d), 0, a.dp))) >> 0;
			((w < 0 || w >= buf.$length) ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + w] = 46);
			w = w + (1) >> 0;
			w = w + ($copySlice($subslice(buf, w), $subslice(new sliceType$6(a.d), a.dp, a.nd))) >> 0;
		} else {
			w = w + ($copySlice($subslice(buf, w), $subslice(new sliceType$6(a.d), 0, a.nd))) >> 0;
			w = w + (digitZero($subslice(buf, w, ((w + a.dp >> 0) - a.nd >> 0)))) >> 0;
		}
		return ($bytesToString($subslice(buf, 0, w)));
	};
	decimal.prototype.String = function() { return this.$val.String(); };
	digitZero = function(dst) {
		var _i, _ref, dst, i;
		_ref = dst;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			((i < 0 || i >= dst.$length) ? ($throwRuntimeError("index out of range"), undefined) : dst.$array[dst.$offset + i] = 48);
			_i++;
		}
		return dst.$length;
	};
	trim = function(a) {
		var a, x, x$1;
		while (true) {
			if (!(a.nd > 0 && ((x = a.d, x$1 = a.nd - 1 >> 0, ((x$1 < 0 || x$1 >= x.length) ? ($throwRuntimeError("index out of range"), undefined) : x[x$1])) === 48))) { break; }
			a.nd = a.nd - (1) >> 0;
		}
		if (a.nd === 0) {
			a.dp = 0;
		}
	};
	decimal.ptr.prototype.Assign = function(v) {
		var a, buf, n, v, v1, x, x$1, x$2;
		a = this;
		buf = arrayType$2.zero();
		n = 0;
		while (true) {
			if (!((v.$high > 0 || (v.$high === 0 && v.$low > 0)))) { break; }
			v1 = $div64(v, new $Uint64(0, 10), false);
			v = (x = $mul64(new $Uint64(0, 10), v1), new $Uint64(v.$high - x.$high, v.$low - x.$low));
			((n < 0 || n >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[n] = ((new $Uint64(v.$high + 0, v.$low + 48).$low << 24 >>> 24)));
			n = n + (1) >> 0;
			v = v1;
		}
		a.nd = 0;
		n = n - (1) >> 0;
		while (true) {
			if (!(n >= 0)) { break; }
			(x$1 = a.d, x$2 = a.nd, ((x$2 < 0 || x$2 >= x$1.length) ? ($throwRuntimeError("index out of range"), undefined) : x$1[x$2] = ((n < 0 || n >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[n])));
			a.nd = a.nd + (1) >> 0;
			n = n - (1) >> 0;
		}
		a.dp = a.nd;
		trim(a);
	};
	decimal.prototype.Assign = function(v) { return this.$val.Assign(v); };
	rightShift = function(a, k) {
		var a, c, c$1, dig, dig$1, k, mask, n, r, w, x, x$1, x$2, x$3, y, y$1, y$2, y$3, y$4;
		r = 0;
		w = 0;
		n = 0;
		while (true) {
			if (!(((y = k, y < 32 ? (n >>> y) : 0) >>> 0) === 0)) { break; }
			if (r >= a.nd) {
				if (n === 0) {
					a.nd = 0;
					return;
				}
				while (true) {
					if (!(((y$1 = k, y$1 < 32 ? (n >>> y$1) : 0) >>> 0) === 0)) { break; }
					n = n * 10 >>> 0;
					r = r + (1) >> 0;
				}
				break;
			}
			c = (((x = a.d, ((r < 0 || r >= x.length) ? ($throwRuntimeError("index out of range"), undefined) : x[r])) >>> 0));
			n = ((n * 10 >>> 0) + c >>> 0) - 48 >>> 0;
			r = r + (1) >> 0;
		}
		a.dp = a.dp - ((r - 1 >> 0)) >> 0;
		mask = (((y$2 = k, y$2 < 32 ? (1 << y$2) : 0) >>> 0)) - 1 >>> 0;
		while (true) {
			if (!(r < a.nd)) { break; }
			c$1 = (((x$1 = a.d, ((r < 0 || r >= x$1.length) ? ($throwRuntimeError("index out of range"), undefined) : x$1[r])) >>> 0));
			dig = (y$3 = k, y$3 < 32 ? (n >>> y$3) : 0) >>> 0;
			n = (n & (mask)) >>> 0;
			(x$2 = a.d, ((w < 0 || w >= x$2.length) ? ($throwRuntimeError("index out of range"), undefined) : x$2[w] = (((dig + 48 >>> 0) << 24 >>> 24))));
			w = w + (1) >> 0;
			n = ((n * 10 >>> 0) + c$1 >>> 0) - 48 >>> 0;
			r = r + (1) >> 0;
		}
		while (true) {
			if (!(n > 0)) { break; }
			dig$1 = (y$4 = k, y$4 < 32 ? (n >>> y$4) : 0) >>> 0;
			n = (n & (mask)) >>> 0;
			if (w < 800) {
				(x$3 = a.d, ((w < 0 || w >= x$3.length) ? ($throwRuntimeError("index out of range"), undefined) : x$3[w] = (((dig$1 + 48 >>> 0) << 24 >>> 24))));
				w = w + (1) >> 0;
			} else if (dig$1 > 0) {
				a.trunc = true;
			}
			n = n * 10 >>> 0;
		}
		a.nd = w;
		trim(a);
	};
	prefixIsLessThan = function(b, s) {
		var b, i, s;
		i = 0;
		while (true) {
			if (!(i < s.length)) { break; }
			if (i >= b.$length) {
				return true;
			}
			if (!((((i < 0 || i >= b.$length) ? ($throwRuntimeError("index out of range"), undefined) : b.$array[b.$offset + i]) === s.charCodeAt(i)))) {
				return ((i < 0 || i >= b.$length) ? ($throwRuntimeError("index out of range"), undefined) : b.$array[b.$offset + i]) < s.charCodeAt(i);
			}
			i = i + (1) >> 0;
		}
		return false;
	};
	leftShift = function(a, k) {
		var _q, _q$1, a, delta, k, n, quo, quo$1, r, rem, rem$1, w, x, x$1, x$2, y;
		delta = ((k < 0 || k >= leftcheats.$length) ? ($throwRuntimeError("index out of range"), undefined) : leftcheats.$array[leftcheats.$offset + k]).delta;
		if (prefixIsLessThan($subslice(new sliceType$6(a.d), 0, a.nd), ((k < 0 || k >= leftcheats.$length) ? ($throwRuntimeError("index out of range"), undefined) : leftcheats.$array[leftcheats.$offset + k]).cutoff)) {
			delta = delta - (1) >> 0;
		}
		r = a.nd;
		w = a.nd + delta >> 0;
		n = 0;
		r = r - (1) >> 0;
		while (true) {
			if (!(r >= 0)) { break; }
			n = n + (((y = k, y < 32 ? ((((((x = a.d, ((r < 0 || r >= x.length) ? ($throwRuntimeError("index out of range"), undefined) : x[r])) >>> 0)) - 48 >>> 0)) << y) : 0) >>> 0)) >>> 0;
			quo = (_q = n / 10, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
			rem = n - (10 * quo >>> 0) >>> 0;
			w = w - (1) >> 0;
			if (w < 800) {
				(x$1 = a.d, ((w < 0 || w >= x$1.length) ? ($throwRuntimeError("index out of range"), undefined) : x$1[w] = (((rem + 48 >>> 0) << 24 >>> 24))));
			} else if (!((rem === 0))) {
				a.trunc = true;
			}
			n = quo;
			r = r - (1) >> 0;
		}
		while (true) {
			if (!(n > 0)) { break; }
			quo$1 = (_q$1 = n / 10, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >>> 0 : $throwRuntimeError("integer divide by zero"));
			rem$1 = n - (10 * quo$1 >>> 0) >>> 0;
			w = w - (1) >> 0;
			if (w < 800) {
				(x$2 = a.d, ((w < 0 || w >= x$2.length) ? ($throwRuntimeError("index out of range"), undefined) : x$2[w] = (((rem$1 + 48 >>> 0) << 24 >>> 24))));
			} else if (!((rem$1 === 0))) {
				a.trunc = true;
			}
			n = quo$1;
		}
		a.nd = a.nd + (delta) >> 0;
		if (a.nd >= 800) {
			a.nd = 800;
		}
		a.dp = a.dp + (delta) >> 0;
		trim(a);
	};
	decimal.ptr.prototype.Shift = function(k) {
		var a, k;
		a = this;
		if ((a.nd === 0)) {
		} else if (k > 0) {
			while (true) {
				if (!(k > 28)) { break; }
				leftShift(a, 28);
				k = k - (28) >> 0;
			}
			leftShift(a, ((k >>> 0)));
		} else if (k < 0) {
			while (true) {
				if (!(k < -28)) { break; }
				rightShift(a, 28);
				k = k + (28) >> 0;
			}
			rightShift(a, ((-k >>> 0)));
		}
	};
	decimal.prototype.Shift = function(k) { return this.$val.Shift(k); };
	shouldRoundUp = function(a, nd) {
		var _r, a, nd, x, x$1, x$2, x$3;
		if (nd < 0 || nd >= a.nd) {
			return false;
		}
		if (((x = a.d, ((nd < 0 || nd >= x.length) ? ($throwRuntimeError("index out of range"), undefined) : x[nd])) === 53) && ((nd + 1 >> 0) === a.nd)) {
			if (a.trunc) {
				return true;
			}
			return nd > 0 && !(((_r = (((x$1 = a.d, x$2 = nd - 1 >> 0, ((x$2 < 0 || x$2 >= x$1.length) ? ($throwRuntimeError("index out of range"), undefined) : x$1[x$2])) - 48 << 24 >>> 24)) % 2, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) === 0));
		}
		return (x$3 = a.d, ((nd < 0 || nd >= x$3.length) ? ($throwRuntimeError("index out of range"), undefined) : x$3[nd])) >= 53;
	};
	decimal.ptr.prototype.Round = function(nd) {
		var a, nd;
		a = this;
		if (nd < 0 || nd >= a.nd) {
			return;
		}
		if (shouldRoundUp(a, nd)) {
			a.RoundUp(nd);
		} else {
			a.RoundDown(nd);
		}
	};
	decimal.prototype.Round = function(nd) { return this.$val.Round(nd); };
	decimal.ptr.prototype.RoundDown = function(nd) {
		var a, nd;
		a = this;
		if (nd < 0 || nd >= a.nd) {
			return;
		}
		a.nd = nd;
		trim(a);
	};
	decimal.prototype.RoundDown = function(nd) { return this.$val.RoundDown(nd); };
	decimal.ptr.prototype.RoundUp = function(nd) {
		var a, c, i, nd, x, x$1, x$2;
		a = this;
		if (nd < 0 || nd >= a.nd) {
			return;
		}
		i = nd - 1 >> 0;
		while (true) {
			if (!(i >= 0)) { break; }
			c = (x = a.d, ((i < 0 || i >= x.length) ? ($throwRuntimeError("index out of range"), undefined) : x[i]));
			if (c < 57) {
				(x$2 = a.d, ((i < 0 || i >= x$2.length) ? ($throwRuntimeError("index out of range"), undefined) : x$2[i] = ((x$1 = a.d, ((i < 0 || i >= x$1.length) ? ($throwRuntimeError("index out of range"), undefined) : x$1[i])) + (1) << 24 >>> 24)));
				a.nd = i + 1 >> 0;
				return;
			}
			i = i - (1) >> 0;
		}
		a.d[0] = 49;
		a.nd = 1;
		a.dp = a.dp + (1) >> 0;
	};
	decimal.prototype.RoundUp = function(nd) { return this.$val.RoundUp(nd); };
	decimal.ptr.prototype.RoundedInteger = function() {
		var a, i, n, x, x$1, x$2, x$3;
		a = this;
		if (a.dp > 20) {
			return new $Uint64(4294967295, 4294967295);
		}
		i = 0;
		n = new $Uint64(0, 0);
		i = 0;
		while (true) {
			if (!(i < a.dp && i < a.nd)) { break; }
			n = (x = $mul64(n, new $Uint64(0, 10)), x$1 = (new $Uint64(0, ((x$2 = a.d, ((i < 0 || i >= x$2.length) ? ($throwRuntimeError("index out of range"), undefined) : x$2[i])) - 48 << 24 >>> 24))), new $Uint64(x.$high + x$1.$high, x.$low + x$1.$low));
			i = i + (1) >> 0;
		}
		while (true) {
			if (!(i < a.dp)) { break; }
			n = $mul64(n, (new $Uint64(0, 10)));
			i = i + (1) >> 0;
		}
		if (shouldRoundUp(a, a.dp)) {
			n = (x$3 = new $Uint64(0, 1), new $Uint64(n.$high + x$3.$high, n.$low + x$3.$low));
		}
		return n;
	};
	decimal.prototype.RoundedInteger = function() { return this.$val.RoundedInteger(); };
	eiselLemire64 = function(man, exp10, neg) {
		var _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tuple, _tuple$1, clz, exp10, f, man, mergedHi, mergedLo, msb, neg, ok, retBits, retExp2, retMantissa, x, x$1, x$10, x$11, x$12, x$13, x$14, x$15, x$16, x$17, x$18, x$19, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9, xHi, xLo, yHi, yLo;
		f = 0;
		ok = false;
		if ((man.$high === 0 && man.$low === 0)) {
			if (neg) {
				f = math.Float64frombits(new $Uint64(2147483648, 0));
			}
			_tmp = f;
			_tmp$1 = true;
			f = _tmp;
			ok = _tmp$1;
			return [f, ok];
		}
		if (exp10 < -348 || 347 < exp10) {
			_tmp$2 = 0;
			_tmp$3 = false;
			f = _tmp$2;
			ok = _tmp$3;
			return [f, ok];
		}
		clz = bits.LeadingZeros64(man);
		man = $shiftLeft64(man, (clz));
		retExp2 = (x = (new $Uint64(0, (((($imul(217706, exp10)) >> 16 >> 0) + 64 >> 0) + 1023 >> 0))), x$1 = (new $Uint64(0, clz)), new $Uint64(x.$high - x$1.$high, x.$low - x$1.$low));
		_tuple = bits.Mul64(man, (x$2 = exp10 - -348 >> 0, ((x$2 < 0 || x$2 >= detailedPowersOfTen.length) ? ($throwRuntimeError("index out of range"), undefined) : detailedPowersOfTen[x$2]))[1]);
		xHi = _tuple[0];
		xLo = _tuple[1];
		if ((x$3 = new $Uint64(xHi.$high & 0, (xHi.$low & 511) >>> 0), (x$3.$high === 0 && x$3.$low === 511)) && (x$4 = new $Uint64(xLo.$high + man.$high, xLo.$low + man.$low), (x$4.$high < man.$high || (x$4.$high === man.$high && x$4.$low < man.$low)))) {
			_tuple$1 = bits.Mul64(man, (x$5 = exp10 - -348 >> 0, ((x$5 < 0 || x$5 >= detailedPowersOfTen.length) ? ($throwRuntimeError("index out of range"), undefined) : detailedPowersOfTen[x$5]))[0]);
			yHi = _tuple$1[0];
			yLo = _tuple$1[1];
			_tmp$4 = xHi;
			_tmp$5 = new $Uint64(xLo.$high + yHi.$high, xLo.$low + yHi.$low);
			mergedHi = _tmp$4;
			mergedLo = _tmp$5;
			if ((mergedLo.$high < xLo.$high || (mergedLo.$high === xLo.$high && mergedLo.$low < xLo.$low))) {
				mergedHi = (x$6 = new $Uint64(0, 1), new $Uint64(mergedHi.$high + x$6.$high, mergedHi.$low + x$6.$low));
			}
			if ((x$7 = new $Uint64(mergedHi.$high & 0, (mergedHi.$low & 511) >>> 0), (x$7.$high === 0 && x$7.$low === 511)) && (x$8 = new $Uint64(mergedLo.$high + 0, mergedLo.$low + 1), (x$8.$high === 0 && x$8.$low === 0)) && (x$9 = new $Uint64(yLo.$high + man.$high, yLo.$low + man.$low), (x$9.$high < man.$high || (x$9.$high === man.$high && x$9.$low < man.$low)))) {
				_tmp$6 = 0;
				_tmp$7 = false;
				f = _tmp$6;
				ok = _tmp$7;
				return [f, ok];
			}
			_tmp$8 = mergedHi;
			_tmp$9 = mergedLo;
			xHi = _tmp$8;
			xLo = _tmp$9;
		}
		msb = $shiftRightUint64(xHi, 63);
		retMantissa = $shiftRightUint64(xHi, $flatten64((new $Uint64(msb.$high + 0, msb.$low + 9))));
		retExp2 = (x$10 = new $Uint64(0 ^ msb.$high, (1 ^ msb.$low) >>> 0), new $Uint64(retExp2.$high - x$10.$high, retExp2.$low - x$10.$low));
		if ((xLo.$high === 0 && xLo.$low === 0) && (x$11 = new $Uint64(xHi.$high & 0, (xHi.$low & 511) >>> 0), (x$11.$high === 0 && x$11.$low === 0)) && (x$12 = new $Uint64(retMantissa.$high & 0, (retMantissa.$low & 3) >>> 0), (x$12.$high === 0 && x$12.$low === 1))) {
			_tmp$10 = 0;
			_tmp$11 = false;
			f = _tmp$10;
			ok = _tmp$11;
			return [f, ok];
		}
		retMantissa = (x$13 = new $Uint64(retMantissa.$high & 0, (retMantissa.$low & 1) >>> 0), new $Uint64(retMantissa.$high + x$13.$high, retMantissa.$low + x$13.$low));
		retMantissa = $shiftRightUint64(retMantissa, (1));
		if ((x$14 = $shiftRightUint64(retMantissa, 53), (x$14.$high > 0 || (x$14.$high === 0 && x$14.$low > 0)))) {
			retMantissa = $shiftRightUint64(retMantissa, (1));
			retExp2 = (x$15 = new $Uint64(0, 1), new $Uint64(retExp2.$high + x$15.$high, retExp2.$low + x$15.$low));
		}
		if ((x$16 = new $Uint64(retExp2.$high - 0, retExp2.$low - 1), (x$16.$high > 0 || (x$16.$high === 0 && x$16.$low >= 2046)))) {
			_tmp$12 = 0;
			_tmp$13 = false;
			f = _tmp$12;
			ok = _tmp$13;
			return [f, ok];
		}
		retBits = (x$17 = $shiftLeft64(retExp2, 52), x$18 = new $Uint64(retMantissa.$high & 1048575, (retMantissa.$low & 4294967295) >>> 0), new $Uint64(x$17.$high | x$18.$high, (x$17.$low | x$18.$low) >>> 0));
		if (neg) {
			retBits = (x$19 = new $Uint64(2147483648, 0), new $Uint64(retBits.$high | x$19.$high, (retBits.$low | x$19.$low) >>> 0));
		}
		_tmp$14 = math.Float64frombits(retBits);
		_tmp$15 = true;
		f = _tmp$14;
		ok = _tmp$15;
		return [f, ok];
	};
	eiselLemire32 = function(man, exp10, neg) {
		var _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tuple, _tuple$1, clz, exp10, f, man, mergedHi, mergedLo, msb, neg, ok, retBits, retExp2, retMantissa, x, x$1, x$10, x$11, x$12, x$13, x$14, x$15, x$16, x$17, x$18, x$19, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9, xHi, xLo, yHi, yLo;
		f = 0;
		ok = false;
		if ((man.$high === 0 && man.$low === 0)) {
			if (neg) {
				f = math.Float32frombits(2147483648);
			}
			_tmp = f;
			_tmp$1 = true;
			f = _tmp;
			ok = _tmp$1;
			return [f, ok];
		}
		if (exp10 < -348 || 347 < exp10) {
			_tmp$2 = 0;
			_tmp$3 = false;
			f = _tmp$2;
			ok = _tmp$3;
			return [f, ok];
		}
		clz = bits.LeadingZeros64(man);
		man = $shiftLeft64(man, (clz));
		retExp2 = (x = (new $Uint64(0, (((($imul(217706, exp10)) >> 16 >> 0) + 64 >> 0) + 127 >> 0))), x$1 = (new $Uint64(0, clz)), new $Uint64(x.$high - x$1.$high, x.$low - x$1.$low));
		_tuple = bits.Mul64(man, (x$2 = exp10 - -348 >> 0, ((x$2 < 0 || x$2 >= detailedPowersOfTen.length) ? ($throwRuntimeError("index out of range"), undefined) : detailedPowersOfTen[x$2]))[1]);
		xHi = _tuple[0];
		xLo = _tuple[1];
		if ((x$3 = new $Uint64(xHi.$high & 63, (xHi.$low & 4294967295) >>> 0), (x$3.$high === 63 && x$3.$low === 4294967295)) && (x$4 = new $Uint64(xLo.$high + man.$high, xLo.$low + man.$low), (x$4.$high < man.$high || (x$4.$high === man.$high && x$4.$low < man.$low)))) {
			_tuple$1 = bits.Mul64(man, (x$5 = exp10 - -348 >> 0, ((x$5 < 0 || x$5 >= detailedPowersOfTen.length) ? ($throwRuntimeError("index out of range"), undefined) : detailedPowersOfTen[x$5]))[0]);
			yHi = _tuple$1[0];
			yLo = _tuple$1[1];
			_tmp$4 = xHi;
			_tmp$5 = new $Uint64(xLo.$high + yHi.$high, xLo.$low + yHi.$low);
			mergedHi = _tmp$4;
			mergedLo = _tmp$5;
			if ((mergedLo.$high < xLo.$high || (mergedLo.$high === xLo.$high && mergedLo.$low < xLo.$low))) {
				mergedHi = (x$6 = new $Uint64(0, 1), new $Uint64(mergedHi.$high + x$6.$high, mergedHi.$low + x$6.$low));
			}
			if ((x$7 = new $Uint64(mergedHi.$high & 63, (mergedHi.$low & 4294967295) >>> 0), (x$7.$high === 63 && x$7.$low === 4294967295)) && (x$8 = new $Uint64(mergedLo.$high + 0, mergedLo.$low + 1), (x$8.$high === 0 && x$8.$low === 0)) && (x$9 = new $Uint64(yLo.$high + man.$high, yLo.$low + man.$low), (x$9.$high < man.$high || (x$9.$high === man.$high && x$9.$low < man.$low)))) {
				_tmp$6 = 0;
				_tmp$7 = false;
				f = _tmp$6;
				ok = _tmp$7;
				return [f, ok];
			}
			_tmp$8 = mergedHi;
			_tmp$9 = mergedLo;
			xHi = _tmp$8;
			xLo = _tmp$9;
		}
		msb = $shiftRightUint64(xHi, 63);
		retMantissa = $shiftRightUint64(xHi, $flatten64((new $Uint64(msb.$high + 0, msb.$low + 38))));
		retExp2 = (x$10 = new $Uint64(0 ^ msb.$high, (1 ^ msb.$low) >>> 0), new $Uint64(retExp2.$high - x$10.$high, retExp2.$low - x$10.$low));
		if ((xLo.$high === 0 && xLo.$low === 0) && (x$11 = new $Uint64(xHi.$high & 63, (xHi.$low & 4294967295) >>> 0), (x$11.$high === 0 && x$11.$low === 0)) && (x$12 = new $Uint64(retMantissa.$high & 0, (retMantissa.$low & 3) >>> 0), (x$12.$high === 0 && x$12.$low === 1))) {
			_tmp$10 = 0;
			_tmp$11 = false;
			f = _tmp$10;
			ok = _tmp$11;
			return [f, ok];
		}
		retMantissa = (x$13 = new $Uint64(retMantissa.$high & 0, (retMantissa.$low & 1) >>> 0), new $Uint64(retMantissa.$high + x$13.$high, retMantissa.$low + x$13.$low));
		retMantissa = $shiftRightUint64(retMantissa, (1));
		if ((x$14 = $shiftRightUint64(retMantissa, 24), (x$14.$high > 0 || (x$14.$high === 0 && x$14.$low > 0)))) {
			retMantissa = $shiftRightUint64(retMantissa, (1));
			retExp2 = (x$15 = new $Uint64(0, 1), new $Uint64(retExp2.$high + x$15.$high, retExp2.$low + x$15.$low));
		}
		if ((x$16 = new $Uint64(retExp2.$high - 0, retExp2.$low - 1), (x$16.$high > 0 || (x$16.$high === 0 && x$16.$low >= 254)))) {
			_tmp$12 = 0;
			_tmp$13 = false;
			f = _tmp$12;
			ok = _tmp$13;
			return [f, ok];
		}
		retBits = (x$17 = $shiftLeft64(retExp2, 23), x$18 = new $Uint64(retMantissa.$high & 0, (retMantissa.$low & 8388607) >>> 0), new $Uint64(x$17.$high | x$18.$high, (x$17.$low | x$18.$low) >>> 0));
		if (neg) {
			retBits = (x$19 = new $Uint64(0, 2147483648), new $Uint64(retBits.$high | x$19.$high, (retBits.$low | x$19.$low) >>> 0));
		}
		_tmp$14 = math.Float32frombits(((retBits.$low >>> 0)));
		_tmp$15 = true;
		f = _tmp$14;
		ok = _tmp$15;
		return [f, ok];
	};
	extFloat.ptr.prototype.AssignComputeBounds = function(mant, exp, neg, flt) {
		var _tmp, _tmp$1, exp, expBiased, f, flt, lower$1, mant, neg, upper, x, x$1, x$2, x$3, x$4;
		lower$1 = new extFloat.ptr(new $Uint64(0, 0), 0, false);
		upper = new extFloat.ptr(new $Uint64(0, 0), 0, false);
		f = this;
		f.mant = mant;
		f.exp = exp - ((flt.mantbits >> 0)) >> 0;
		f.neg = neg;
		if (f.exp <= 0 && (x = $shiftLeft64(($shiftRightUint64(mant, ((-f.exp >>> 0)))), ((-f.exp >>> 0))), (mant.$high === x.$high && mant.$low === x.$low))) {
			f.mant = $shiftRightUint64(f.mant, (((-f.exp >>> 0))));
			f.exp = 0;
			_tmp = $clone(f, extFloat);
			_tmp$1 = $clone(f, extFloat);
			extFloat.copy(lower$1, _tmp);
			extFloat.copy(upper, _tmp$1);
			return [lower$1, upper];
		}
		expBiased = exp - flt.bias >> 0;
		extFloat.copy(upper, new extFloat.ptr((x$1 = $mul64(new $Uint64(0, 2), f.mant), new $Uint64(x$1.$high + 0, x$1.$low + 1)), f.exp - 1 >> 0, f.neg));
		if (!((x$2 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), (mant.$high === x$2.$high && mant.$low === x$2.$low))) || (expBiased === 1)) {
			extFloat.copy(lower$1, new extFloat.ptr((x$3 = $mul64(new $Uint64(0, 2), f.mant), new $Uint64(x$3.$high - 0, x$3.$low - 1)), f.exp - 1 >> 0, f.neg));
		} else {
			extFloat.copy(lower$1, new extFloat.ptr((x$4 = $mul64(new $Uint64(0, 4), f.mant), new $Uint64(x$4.$high - 0, x$4.$low - 1)), f.exp - 2 >> 0, f.neg));
		}
		return [lower$1, upper];
	};
	extFloat.prototype.AssignComputeBounds = function(mant, exp, neg, flt) { return this.$val.AssignComputeBounds(mant, exp, neg, flt); };
	extFloat.ptr.prototype.Normalize = function() {
		var f, shift, x;
		f = this;
		if ((x = f.mant, (x.$high === 0 && x.$low === 0))) {
			return 0;
		}
		shift = bits.LeadingZeros64(f.mant);
		f.mant = $shiftLeft64(f.mant, (((shift >>> 0))));
		f.exp = f.exp - (shift) >> 0;
		return ((shift >>> 0));
	};
	extFloat.prototype.Normalize = function() { return this.$val.Normalize(); };
	extFloat.ptr.prototype.Multiply = function(g) {
		var _tuple, f, g, hi, lo, x;
		f = this;
		_tuple = bits.Mul64(f.mant, g.mant);
		hi = _tuple[0];
		lo = _tuple[1];
		f.mant = (x = $shiftRightUint64(lo, 63), new $Uint64(hi.$high + x.$high, hi.$low + x.$low));
		f.exp = (f.exp + g.exp >> 0) + 64 >> 0;
	};
	extFloat.prototype.Multiply = function(g) { return this.$val.Multiply(g); };
	extFloat.ptr.prototype.frexp10 = function() {
		var _q, _q$1, _tmp, _tmp$1, approxExp10, exp, exp10, f, i, index;
		exp10 = 0;
		index = 0;
		f = this;
		approxExp10 = (_q = ($imul(((-46 - f.exp >> 0)), 28)) / 93, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		i = (_q$1 = ((approxExp10 - -348 >> 0)) / 8, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero"));
		Loop:
		while (true) {
			exp = (f.exp + ((i < 0 || i >= powersOfTen.length) ? ($throwRuntimeError("index out of range"), undefined) : powersOfTen[i]).exp >> 0) + 64 >> 0;
			if (exp < -60) {
				i = i + (1) >> 0;
			} else if (exp > -32) {
				i = i - (1) >> 0;
			} else {
				break Loop;
			}
		}
		f.Multiply($clone(((i < 0 || i >= powersOfTen.length) ? ($throwRuntimeError("index out of range"), undefined) : powersOfTen[i]), extFloat));
		_tmp = -((-348 + ($imul(i, 8)) >> 0));
		_tmp$1 = i;
		exp10 = _tmp;
		index = _tmp$1;
		return [exp10, index];
	};
	extFloat.prototype.frexp10 = function() { return this.$val.frexp10(); };
	frexp10Many = function(a, b, c) {
		var _tuple, a, b, c, exp10, i;
		exp10 = 0;
		_tuple = c.frexp10();
		exp10 = _tuple[0];
		i = _tuple[1];
		a.Multiply($clone(((i < 0 || i >= powersOfTen.length) ? ($throwRuntimeError("index out of range"), undefined) : powersOfTen[i]), extFloat));
		b.Multiply($clone(((i < 0 || i >= powersOfTen.length) ? ($throwRuntimeError("index out of range"), undefined) : powersOfTen[i]), extFloat));
		return exp10;
	};
	extFloat.ptr.prototype.FixedDecimal = function(d, n) {
		var $CE$B5, _q, _q$1, _tmp, _tmp$1, _tuple, buf, d, digit, exp10, f, fraction, i, i$1, i$2, integer, integerDigits, n, nd, needed, ok, pos, pow, pow10, rest, shift, v, v1, x, x$1, x$10, x$11, x$12, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		f = this;
		if ((x = f.mant, (x.$high === 0 && x.$low === 0))) {
			d.nd = 0;
			d.dp = 0;
			d.neg = f.neg;
			return true;
		}
		if (n === 0) {
			$panic(new $String("strconv: internal error: extFloat.FixedDecimal called with n == 0"));
		}
		f.Normalize();
		_tuple = f.frexp10();
		exp10 = _tuple[0];
		shift = ((-f.exp >>> 0));
		integer = (($shiftRightUint64(f.mant, shift).$low >>> 0));
		fraction = (x$1 = f.mant, x$2 = $shiftLeft64((new $Uint64(0, integer)), shift), new $Uint64(x$1.$high - x$2.$high, x$1.$low - x$2.$low));
		$CE$B5 = new $Uint64(0, 1);
		needed = n;
		integerDigits = 0;
		pow10 = new $Uint64(0, 1);
		_tmp = 0;
		_tmp$1 = new $Uint64(0, 1);
		i = _tmp;
		pow = _tmp$1;
		while (true) {
			if (!(i < 20)) { break; }
			if ((x$3 = (new $Uint64(0, integer)), (pow.$high > x$3.$high || (pow.$high === x$3.$high && pow.$low > x$3.$low)))) {
				integerDigits = i;
				break;
			}
			pow = $mul64(pow, (new $Uint64(0, 10)));
			i = i + (1) >> 0;
		}
		rest = integer;
		if (integerDigits > needed) {
			pow10 = (x$4 = integerDigits - needed >> 0, ((x$4 < 0 || x$4 >= uint64pow10.length) ? ($throwRuntimeError("index out of range"), undefined) : uint64pow10[x$4]));
			integer = (_q = integer / (((pow10.$low >>> 0))), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
			rest = rest - (($imul(integer, ((pow10.$low >>> 0))) >>> 0)) >>> 0;
		} else {
			rest = 0;
		}
		buf = arrayType$3.zero();
		pos = 32;
		v = integer;
		while (true) {
			if (!(v > 0)) { break; }
			v1 = (_q$1 = v / 10, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >>> 0 : $throwRuntimeError("integer divide by zero"));
			v = v - (($imul(10, v1) >>> 0)) >>> 0;
			pos = pos - (1) >> 0;
			((pos < 0 || pos >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[pos] = (((v + 48 >>> 0) << 24 >>> 24)));
			v = v1;
		}
		i$1 = pos;
		while (true) {
			if (!(i$1 < 32)) { break; }
			(x$5 = d.d, x$6 = i$1 - pos >> 0, ((x$6 < 0 || x$6 >= x$5.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$5.$array[x$5.$offset + x$6] = ((i$1 < 0 || i$1 >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[i$1])));
			i$1 = i$1 + (1) >> 0;
		}
		nd = 32 - pos >> 0;
		d.nd = nd;
		d.dp = integerDigits + exp10 >> 0;
		needed = needed - (nd) >> 0;
		if (needed > 0) {
			if (!((rest === 0)) || !((pow10.$high === 0 && pow10.$low === 1))) {
				$panic(new $String("strconv: internal error, rest != 0 but needed > 0"));
			}
			while (true) {
				if (!(needed > 0)) { break; }
				fraction = $mul64(fraction, (new $Uint64(0, 10)));
				$CE$B5 = $mul64($CE$B5, (new $Uint64(0, 10)));
				if ((x$7 = $mul64(new $Uint64(0, 2), $CE$B5), x$8 = $shiftLeft64(new $Uint64(0, 1), shift), (x$7.$high > x$8.$high || (x$7.$high === x$8.$high && x$7.$low > x$8.$low)))) {
					return false;
				}
				digit = $shiftRightUint64(fraction, shift);
				(x$9 = d.d, ((nd < 0 || nd >= x$9.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$9.$array[x$9.$offset + nd] = ((new $Uint64(digit.$high + 0, digit.$low + 48).$low << 24 >>> 24))));
				fraction = (x$10 = $shiftLeft64(digit, shift), new $Uint64(fraction.$high - x$10.$high, fraction.$low - x$10.$low));
				nd = nd + (1) >> 0;
				needed = needed - (1) >> 0;
			}
			d.nd = nd;
		}
		ok = adjustLastDigitFixed(d, (x$11 = $shiftLeft64((new $Uint64(0, rest)), shift), new $Uint64(x$11.$high | fraction.$high, (x$11.$low | fraction.$low) >>> 0)), pow10, shift, $CE$B5);
		if (!ok) {
			return false;
		}
		i$2 = d.nd - 1 >> 0;
		while (true) {
			if (!(i$2 >= 0)) { break; }
			if (!(((x$12 = d.d, ((i$2 < 0 || i$2 >= x$12.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$12.$array[x$12.$offset + i$2])) === 48))) {
				d.nd = i$2 + 1 >> 0;
				break;
			}
			i$2 = i$2 - (1) >> 0;
		}
		return true;
	};
	extFloat.prototype.FixedDecimal = function(d, n) { return this.$val.FixedDecimal(d, n); };
	adjustLastDigitFixed = function(d, num, den, shift, $CE$B5) {
		var $CE$B5, d, den, i, num, shift, x, x$1, x$10, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		if ((x = $shiftLeft64(den, shift), (num.$high > x.$high || (num.$high === x.$high && num.$low > x.$low)))) {
			$panic(new $String("strconv: num > den<<shift in adjustLastDigitFixed"));
		}
		if ((x$1 = $mul64(new $Uint64(0, 2), $CE$B5), x$2 = $shiftLeft64(den, shift), (x$1.$high > x$2.$high || (x$1.$high === x$2.$high && x$1.$low > x$2.$low)))) {
			$panic(new $String("strconv: \xCE\xB5 > (den<<shift)/2"));
		}
		if ((x$3 = $mul64(new $Uint64(0, 2), (new $Uint64(num.$high + $CE$B5.$high, num.$low + $CE$B5.$low))), x$4 = $shiftLeft64(den, shift), (x$3.$high < x$4.$high || (x$3.$high === x$4.$high && x$3.$low < x$4.$low)))) {
			return true;
		}
		if ((x$5 = $mul64(new $Uint64(0, 2), (new $Uint64(num.$high - $CE$B5.$high, num.$low - $CE$B5.$low))), x$6 = $shiftLeft64(den, shift), (x$5.$high > x$6.$high || (x$5.$high === x$6.$high && x$5.$low > x$6.$low)))) {
			i = d.nd - 1 >> 0;
			while (true) {
				if (!(i >= 0)) { break; }
				if ((x$7 = d.d, ((i < 0 || i >= x$7.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$7.$array[x$7.$offset + i])) === 57) {
					d.nd = d.nd - (1) >> 0;
				} else {
					break;
				}
				i = i - (1) >> 0;
			}
			if (i < 0) {
				(x$8 = d.d, (0 >= x$8.$length ? ($throwRuntimeError("index out of range"), undefined) : x$8.$array[x$8.$offset + 0] = 49));
				d.nd = 1;
				d.dp = d.dp + (1) >> 0;
			} else {
				(x$10 = d.d, ((i < 0 || i >= x$10.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$10.$array[x$10.$offset + i] = ((x$9 = d.d, ((i < 0 || i >= x$9.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$9.$array[x$9.$offset + i])) + (1) << 24 >>> 24)));
			}
			return true;
		}
		return false;
	};
	extFloat.ptr.prototype.ShortestDecimal = function(d, lower$1, upper) {
		var _q, _tmp, _tmp$1, _tmp$2, _tmp$3, allowance, buf, currentDiff, d, digit, digit$1, exp10, f, fraction, i, i$1, i$2, integer, integerDigits, lower$1, multiplier, n, nd, pow, pow$1, shift, targetDiff, upper, v, v1, x, x$1, x$10, x$11, x$12, x$13, x$14, x$15, x$16, x$17, x$18, x$19, x$2, x$20, x$21, x$22, x$23, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		f = this;
		if ((x = f.mant, (x.$high === 0 && x.$low === 0))) {
			d.nd = 0;
			d.dp = 0;
			d.neg = f.neg;
			return true;
		}
		if ((f.exp === 0) && $equal(lower$1, f, extFloat) && $equal(lower$1, upper, extFloat)) {
			buf = arrayType$2.zero();
			n = 23;
			v = f.mant;
			while (true) {
				if (!((v.$high > 0 || (v.$high === 0 && v.$low > 0)))) { break; }
				v1 = $div64(v, new $Uint64(0, 10), false);
				v = (x$1 = $mul64(new $Uint64(0, 10), v1), new $Uint64(v.$high - x$1.$high, v.$low - x$1.$low));
				((n < 0 || n >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[n] = ((new $Uint64(v.$high + 0, v.$low + 48).$low << 24 >>> 24)));
				n = n - (1) >> 0;
				v = v1;
			}
			nd = (24 - n >> 0) - 1 >> 0;
			i = 0;
			while (true) {
				if (!(i < nd)) { break; }
				(x$3 = d.d, ((i < 0 || i >= x$3.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$3.$array[x$3.$offset + i] = (x$2 = (n + 1 >> 0) + i >> 0, ((x$2 < 0 || x$2 >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[x$2]))));
				i = i + (1) >> 0;
			}
			_tmp = nd;
			_tmp$1 = nd;
			d.nd = _tmp;
			d.dp = _tmp$1;
			while (true) {
				if (!(d.nd > 0 && ((x$4 = d.d, x$5 = d.nd - 1 >> 0, ((x$5 < 0 || x$5 >= x$4.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$4.$array[x$4.$offset + x$5])) === 48))) { break; }
				d.nd = d.nd - (1) >> 0;
			}
			if (d.nd === 0) {
				d.dp = 0;
			}
			d.neg = f.neg;
			return true;
		}
		upper.Normalize();
		if (f.exp > upper.exp) {
			f.mant = $shiftLeft64(f.mant, ((((f.exp - upper.exp >> 0) >>> 0))));
			f.exp = upper.exp;
		}
		if (lower$1.exp > upper.exp) {
			lower$1.mant = $shiftLeft64(lower$1.mant, ((((lower$1.exp - upper.exp >> 0) >>> 0))));
			lower$1.exp = upper.exp;
		}
		exp10 = frexp10Many(lower$1, f, upper);
		upper.mant = (x$6 = upper.mant, x$7 = new $Uint64(0, 1), new $Uint64(x$6.$high + x$7.$high, x$6.$low + x$7.$low));
		lower$1.mant = (x$8 = lower$1.mant, x$9 = new $Uint64(0, 1), new $Uint64(x$8.$high - x$9.$high, x$8.$low - x$9.$low));
		shift = ((-upper.exp >>> 0));
		integer = (($shiftRightUint64(upper.mant, shift).$low >>> 0));
		fraction = (x$10 = upper.mant, x$11 = $shiftLeft64((new $Uint64(0, integer)), shift), new $Uint64(x$10.$high - x$11.$high, x$10.$low - x$11.$low));
		allowance = (x$12 = upper.mant, x$13 = lower$1.mant, new $Uint64(x$12.$high - x$13.$high, x$12.$low - x$13.$low));
		targetDiff = (x$14 = upper.mant, x$15 = f.mant, new $Uint64(x$14.$high - x$15.$high, x$14.$low - x$15.$low));
		integerDigits = 0;
		_tmp$2 = 0;
		_tmp$3 = new $Uint64(0, 1);
		i$1 = _tmp$2;
		pow = _tmp$3;
		while (true) {
			if (!(i$1 < 20)) { break; }
			if ((x$16 = (new $Uint64(0, integer)), (pow.$high > x$16.$high || (pow.$high === x$16.$high && pow.$low > x$16.$low)))) {
				integerDigits = i$1;
				break;
			}
			pow = $mul64(pow, (new $Uint64(0, 10)));
			i$1 = i$1 + (1) >> 0;
		}
		i$2 = 0;
		while (true) {
			if (!(i$2 < integerDigits)) { break; }
			pow$1 = (x$17 = (integerDigits - i$2 >> 0) - 1 >> 0, ((x$17 < 0 || x$17 >= uint64pow10.length) ? ($throwRuntimeError("index out of range"), undefined) : uint64pow10[x$17]));
			digit = (_q = integer / ((pow$1.$low >>> 0)), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
			(x$18 = d.d, ((i$2 < 0 || i$2 >= x$18.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$18.$array[x$18.$offset + i$2] = (((digit + 48 >>> 0) << 24 >>> 24))));
			integer = integer - (($imul(digit, ((pow$1.$low >>> 0))) >>> 0)) >>> 0;
			currentDiff = (x$19 = $shiftLeft64((new $Uint64(0, integer)), shift), new $Uint64(x$19.$high + fraction.$high, x$19.$low + fraction.$low));
			if ((currentDiff.$high < allowance.$high || (currentDiff.$high === allowance.$high && currentDiff.$low < allowance.$low))) {
				d.nd = i$2 + 1 >> 0;
				d.dp = integerDigits + exp10 >> 0;
				d.neg = f.neg;
				return adjustLastDigit(d, currentDiff, targetDiff, allowance, $shiftLeft64(pow$1, shift), new $Uint64(0, 2));
			}
			i$2 = i$2 + (1) >> 0;
		}
		d.nd = integerDigits;
		d.dp = d.nd + exp10 >> 0;
		d.neg = f.neg;
		digit$1 = 0;
		multiplier = new $Uint64(0, 1);
		while (true) {
			fraction = $mul64(fraction, (new $Uint64(0, 10)));
			multiplier = $mul64(multiplier, (new $Uint64(0, 10)));
			digit$1 = (($shiftRightUint64(fraction, shift).$low >> 0));
			(x$20 = d.d, x$21 = d.nd, ((x$21 < 0 || x$21 >= x$20.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$20.$array[x$20.$offset + x$21] = (((digit$1 + 48 >> 0) << 24 >>> 24))));
			d.nd = d.nd + (1) >> 0;
			fraction = (x$22 = $shiftLeft64((new $Uint64(0, digit$1)), shift), new $Uint64(fraction.$high - x$22.$high, fraction.$low - x$22.$low));
			if ((x$23 = $mul64(allowance, multiplier), (fraction.$high < x$23.$high || (fraction.$high === x$23.$high && fraction.$low < x$23.$low)))) {
				return adjustLastDigit(d, fraction, $mul64(targetDiff, multiplier), $mul64(allowance, multiplier), $shiftLeft64(new $Uint64(0, 1), shift), $mul64(multiplier, new $Uint64(0, 2)));
			}
		}
	};
	extFloat.prototype.ShortestDecimal = function(d, lower$1, upper) { return this.$val.ShortestDecimal(d, lower$1, upper); };
	adjustLastDigit = function(d, currentDiff, targetDiff, maxDiff, ulpDecimal, ulpBinary) {
		var _index, currentDiff, d, maxDiff, targetDiff, ulpBinary, ulpDecimal, x, x$1, x$10, x$11, x$12, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		if ((x = $mul64(new $Uint64(0, 2), ulpBinary), (ulpDecimal.$high < x.$high || (ulpDecimal.$high === x.$high && ulpDecimal.$low < x.$low)))) {
			return false;
		}
		while (true) {
			if (!((x$1 = (x$2 = (x$3 = $div64(ulpDecimal, new $Uint64(0, 2), false), new $Uint64(currentDiff.$high + x$3.$high, currentDiff.$low + x$3.$low)), new $Uint64(x$2.$high + ulpBinary.$high, x$2.$low + ulpBinary.$low)), (x$1.$high < targetDiff.$high || (x$1.$high === targetDiff.$high && x$1.$low < targetDiff.$low))))) { break; }
			_index = d.nd - 1 >> 0;
			(x$5 = d.d, ((_index < 0 || _index >= x$5.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$5.$array[x$5.$offset + _index] = ((x$4 = d.d, ((_index < 0 || _index >= x$4.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$4.$array[x$4.$offset + _index])) - (1) << 24 >>> 24)));
			currentDiff = (x$6 = ulpDecimal, new $Uint64(currentDiff.$high + x$6.$high, currentDiff.$low + x$6.$low));
		}
		if ((x$7 = new $Uint64(currentDiff.$high + ulpDecimal.$high, currentDiff.$low + ulpDecimal.$low), x$8 = (x$9 = (x$10 = $div64(ulpDecimal, new $Uint64(0, 2), false), new $Uint64(targetDiff.$high + x$10.$high, targetDiff.$low + x$10.$low)), new $Uint64(x$9.$high + ulpBinary.$high, x$9.$low + ulpBinary.$low)), (x$7.$high < x$8.$high || (x$7.$high === x$8.$high && x$7.$low <= x$8.$low)))) {
			return false;
		}
		if ((currentDiff.$high < ulpBinary.$high || (currentDiff.$high === ulpBinary.$high && currentDiff.$low < ulpBinary.$low)) || (x$11 = new $Uint64(maxDiff.$high - ulpBinary.$high, maxDiff.$low - ulpBinary.$low), (currentDiff.$high > x$11.$high || (currentDiff.$high === x$11.$high && currentDiff.$low > x$11.$low)))) {
			return false;
		}
		if ((d.nd === 1) && ((x$12 = d.d, (0 >= x$12.$length ? ($throwRuntimeError("index out of range"), undefined) : x$12.$array[x$12.$offset + 0])) === 48)) {
			d.nd = 0;
			d.dp = 0;
		}
		return true;
	};
	AppendFloat = function(dst, f, fmt, prec, bitSize) {
		var bitSize, dst, f, fmt, prec;
		return genericFtoa(dst, f, fmt, prec, bitSize);
	};
	$pkg.AppendFloat = AppendFloat;
	genericFtoa = function(dst, val, fmt, prec, bitSize) {
		var _1, _2, _3, _4, _tuple, bitSize, bits$1, buf, buf$1, digits, digs, dst, exp, f, f$1, flt, fmt, lower$1, mant, neg, ok, prec, s, shortest, upper, val, x, x$1, x$2, x$3, y, y$1;
		bits$1 = new $Uint64(0, 0);
		flt = ptrType$1.nil;
		_1 = bitSize;
		if (_1 === (32)) {
			bits$1 = (new $Uint64(0, math.Float32bits(($fround(val)))));
			flt = float32info;
		} else if (_1 === (64)) {
			bits$1 = math.Float64bits(val);
			flt = float64info;
		} else {
			$panic(new $String("strconv: illegal AppendFloat/FormatFloat bitSize"));
		}
		neg = !((x = $shiftRightUint64(bits$1, ((flt.expbits + flt.mantbits >>> 0))), (x.$high === 0 && x.$low === 0)));
		exp = (($shiftRightUint64(bits$1, flt.mantbits).$low >> 0)) & ((((y = flt.expbits, y < 32 ? (1 << y) : 0) >> 0) - 1 >> 0));
		mant = (x$1 = (x$2 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), new $Uint64(x$2.$high - 0, x$2.$low - 1)), new $Uint64(bits$1.$high & x$1.$high, (bits$1.$low & x$1.$low) >>> 0));
		_2 = exp;
		if (_2 === ((((y$1 = flt.expbits, y$1 < 32 ? (1 << y$1) : 0) >> 0) - 1 >> 0))) {
			s = "";
			if (!((mant.$high === 0 && mant.$low === 0))) {
				s = "NaN";
			} else if (neg) {
				s = "-Inf";
			} else {
				s = "+Inf";
			}
			return $appendSlice(dst, s);
		} else if (_2 === (0)) {
			exp = exp + (1) >> 0;
		} else {
			mant = (x$3 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), new $Uint64(mant.$high | x$3.$high, (mant.$low | x$3.$low) >>> 0));
		}
		exp = exp + (flt.bias) >> 0;
		if (fmt === 98) {
			return fmtB(dst, neg, mant, exp, flt);
		}
		if ((fmt === 120) || (fmt === 88)) {
			return fmtX(dst, prec, fmt, neg, mant, exp, flt);
		}
		if (!optimize) {
			return bigFtoa(dst, prec, fmt, neg, mant, exp, flt);
		}
		digs = new decimalSlice.ptr(sliceType$6.nil, 0, 0, false);
		ok = false;
		shortest = prec < 0;
		if (shortest) {
			f = new extFloat.ptr(new $Uint64(0, 0), 0, false);
			_tuple = f.AssignComputeBounds(mant, exp, neg, flt);
			lower$1 = $clone(_tuple[0], extFloat);
			upper = $clone(_tuple[1], extFloat);
			buf = arrayType$3.zero();
			digs.d = new sliceType$6(buf);
			ok = f.ShortestDecimal(digs, lower$1, upper);
			if (!ok) {
				return bigFtoa(dst, prec, fmt, neg, mant, exp, flt);
			}
			_3 = fmt;
			if ((_3 === (101)) || (_3 === (69))) {
				prec = max(digs.nd - 1 >> 0, 0);
			} else if (_3 === (102)) {
				prec = max(digs.nd - digs.dp >> 0, 0);
			} else if ((_3 === (103)) || (_3 === (71))) {
				prec = digs.nd;
			}
		} else if (!((fmt === 102))) {
			digits = prec;
			_4 = fmt;
			if ((_4 === (101)) || (_4 === (69))) {
				digits = digits + (1) >> 0;
			} else if ((_4 === (103)) || (_4 === (71))) {
				if (prec === 0) {
					prec = 1;
				}
				digits = prec;
			}
			if (digits <= 15) {
				buf$1 = arrayType$2.zero();
				digs.d = new sliceType$6(buf$1);
				f$1 = new extFloat.ptr(mant, exp - ((flt.mantbits >> 0)) >> 0, neg);
				ok = f$1.FixedDecimal(digs, digits);
			}
		}
		if (!ok) {
			return bigFtoa(dst, prec, fmt, neg, mant, exp, flt);
		}
		return formatDigits(dst, shortest, neg, $clone(digs, decimalSlice), prec, fmt);
	};
	bigFtoa = function(dst, prec, fmt, neg, mant, exp, flt) {
		var _1, _2, d, digs, dst, exp, flt, fmt, mant, neg, prec, shortest;
		d = new decimal.ptr(arrayType$1.zero(), 0, 0, false, false);
		d.Assign(mant);
		d.Shift(exp - ((flt.mantbits >> 0)) >> 0);
		digs = new decimalSlice.ptr(sliceType$6.nil, 0, 0, false);
		shortest = prec < 0;
		if (shortest) {
			roundShortest(d, mant, exp, flt);
			decimalSlice.copy(digs, new decimalSlice.ptr(new sliceType$6(d.d), d.nd, d.dp, false));
			_1 = fmt;
			if ((_1 === (101)) || (_1 === (69))) {
				prec = digs.nd - 1 >> 0;
			} else if (_1 === (102)) {
				prec = max(digs.nd - digs.dp >> 0, 0);
			} else if ((_1 === (103)) || (_1 === (71))) {
				prec = digs.nd;
			}
		} else {
			_2 = fmt;
			if ((_2 === (101)) || (_2 === (69))) {
				d.Round(prec + 1 >> 0);
			} else if (_2 === (102)) {
				d.Round(d.dp + prec >> 0);
			} else if ((_2 === (103)) || (_2 === (71))) {
				if (prec === 0) {
					prec = 1;
				}
				d.Round(prec);
			}
			decimalSlice.copy(digs, new decimalSlice.ptr(new sliceType$6(d.d), d.nd, d.dp, false));
		}
		return formatDigits(dst, shortest, neg, $clone(digs, decimalSlice), prec, fmt);
	};
	formatDigits = function(dst, shortest, neg, digs, prec, fmt) {
		var _1, digs, dst, eprec, exp, fmt, neg, prec, shortest;
		_1 = fmt;
		if ((_1 === (101)) || (_1 === (69))) {
			return fmtE(dst, neg, $clone(digs, decimalSlice), prec, fmt);
		} else if (_1 === (102)) {
			return fmtF(dst, neg, $clone(digs, decimalSlice), prec);
		} else if ((_1 === (103)) || (_1 === (71))) {
			eprec = prec;
			if (eprec > digs.nd && digs.nd >= digs.dp) {
				eprec = digs.nd;
			}
			if (shortest) {
				eprec = 6;
			}
			exp = digs.dp - 1 >> 0;
			if (exp < -4 || exp >= eprec) {
				if (prec > digs.nd) {
					prec = digs.nd;
				}
				return fmtE(dst, neg, $clone(digs, decimalSlice), prec - 1 >> 0, (fmt + 101 << 24 >>> 24) - 103 << 24 >>> 24);
			}
			if (prec > digs.dp) {
				prec = digs.nd;
			}
			return fmtF(dst, neg, $clone(digs, decimalSlice), max(prec - digs.dp >> 0, 0));
		}
		return $append(dst, 37, fmt);
	};
	roundShortest = function(d, mant, exp, flt) {
		var d, exp, explo, flt, inclusive, l, li, lower$1, m, mant, mantlo, mi, minexp, okdown, okup, u, ui, upper, upperdelta, x, x$1, x$2, x$3, x$4, x$5, x$6, x$7;
		if ((mant.$high === 0 && mant.$low === 0)) {
			d.nd = 0;
			return;
		}
		minexp = flt.bias + 1 >> 0;
		if (exp > minexp && ($imul(332, ((d.dp - d.nd >> 0)))) >= ($imul(100, ((exp - ((flt.mantbits >> 0)) >> 0))))) {
			return;
		}
		upper = new decimal.ptr(arrayType$1.zero(), 0, 0, false, false);
		upper.Assign((x = $mul64(mant, new $Uint64(0, 2)), new $Uint64(x.$high + 0, x.$low + 1)));
		upper.Shift((exp - ((flt.mantbits >> 0)) >> 0) - 1 >> 0);
		mantlo = new $Uint64(0, 0);
		explo = 0;
		if ((x$1 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), (mant.$high > x$1.$high || (mant.$high === x$1.$high && mant.$low > x$1.$low))) || (exp === minexp)) {
			mantlo = new $Uint64(mant.$high - 0, mant.$low - 1);
			explo = exp;
		} else {
			mantlo = (x$2 = $mul64(mant, new $Uint64(0, 2)), new $Uint64(x$2.$high - 0, x$2.$low - 1));
			explo = exp - 1 >> 0;
		}
		lower$1 = new decimal.ptr(arrayType$1.zero(), 0, 0, false, false);
		lower$1.Assign((x$3 = $mul64(mantlo, new $Uint64(0, 2)), new $Uint64(x$3.$high + 0, x$3.$low + 1)));
		lower$1.Shift((explo - ((flt.mantbits >> 0)) >> 0) - 1 >> 0);
		inclusive = (x$4 = $div64(mant, new $Uint64(0, 2), true), (x$4.$high === 0 && x$4.$low === 0));
		upperdelta = 0;
		ui = 0;
		while (true) {
			mi = (ui - upper.dp >> 0) + d.dp >> 0;
			if (mi >= d.nd) {
				break;
			}
			li = (ui - upper.dp >> 0) + lower$1.dp >> 0;
			l = 48;
			if (li >= 0 && li < lower$1.nd) {
				l = (x$5 = lower$1.d, ((li < 0 || li >= x$5.length) ? ($throwRuntimeError("index out of range"), undefined) : x$5[li]));
			}
			m = 48;
			if (mi >= 0) {
				m = (x$6 = d.d, ((mi < 0 || mi >= x$6.length) ? ($throwRuntimeError("index out of range"), undefined) : x$6[mi]));
			}
			u = 48;
			if (ui < upper.nd) {
				u = (x$7 = upper.d, ((ui < 0 || ui >= x$7.length) ? ($throwRuntimeError("index out of range"), undefined) : x$7[ui]));
			}
			okdown = !((l === m)) || inclusive && ((li + 1 >> 0) === lower$1.nd);
			if ((upperdelta === 0) && (m + 1 << 24 >>> 24) < u) {
				upperdelta = 2;
			} else if ((upperdelta === 0) && !((m === u))) {
				upperdelta = 1;
			} else if ((upperdelta === 1) && (!((m === 57)) || !((u === 48)))) {
				upperdelta = 2;
			}
			okup = upperdelta > 0 && (inclusive || upperdelta > 1 || (ui + 1 >> 0) < upper.nd);
			if (okdown && okup) {
				d.Round(mi + 1 >> 0);
				return;
			} else if (okdown) {
				d.RoundDown(mi + 1 >> 0);
				return;
			} else if (okup) {
				d.RoundUp(mi + 1 >> 0);
				return;
			}
			ui = ui + (1) >> 0;
		}
	};
	fmtE = function(dst, neg, d, prec, fmt) {
		var _q, _q$1, _q$2, _r, _r$1, _r$2, ch, d, dst, exp, fmt, i, m, neg, prec, x;
		if (neg) {
			dst = $append(dst, 45);
		}
		ch = 48;
		if (!((d.nd === 0))) {
			ch = (x = d.d, (0 >= x.$length ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + 0]));
		}
		dst = $append(dst, ch);
		if (prec > 0) {
			dst = $append(dst, 46);
			i = 1;
			m = min(d.nd, prec + 1 >> 0);
			if (i < m) {
				dst = $appendSlice(dst, $subslice(d.d, i, m));
				i = m;
			}
			while (true) {
				if (!(i <= prec)) { break; }
				dst = $append(dst, 48);
				i = i + (1) >> 0;
			}
		}
		dst = $append(dst, fmt);
		exp = d.dp - 1 >> 0;
		if (d.nd === 0) {
			exp = 0;
		}
		if (exp < 0) {
			ch = 45;
			exp = -exp;
		} else {
			ch = 43;
		}
		dst = $append(dst, ch);
		if (exp < 10) {
			dst = $append(dst, 48, ((exp << 24 >>> 24)) + 48 << 24 >>> 24);
		} else if (exp < 100) {
			dst = $append(dst, (((_q = exp / 10, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) << 24 >>> 24)) + 48 << 24 >>> 24, (((_r = exp % 10, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) << 24 >>> 24)) + 48 << 24 >>> 24);
		} else {
			dst = $append(dst, (((_q$1 = exp / 100, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero")) << 24 >>> 24)) + 48 << 24 >>> 24, (_r$1 = (((_q$2 = exp / 10, (_q$2 === _q$2 && _q$2 !== 1/0 && _q$2 !== -1/0) ? _q$2 >> 0 : $throwRuntimeError("integer divide by zero")) << 24 >>> 24)) % 10, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) + 48 << 24 >>> 24, (((_r$2 = exp % 10, _r$2 === _r$2 ? _r$2 : $throwRuntimeError("integer divide by zero")) << 24 >>> 24)) + 48 << 24 >>> 24);
		}
		return dst;
	};
	fmtF = function(dst, neg, d, prec) {
		var ch, d, dst, i, j, m, neg, prec, x;
		if (neg) {
			dst = $append(dst, 45);
		}
		if (d.dp > 0) {
			m = min(d.nd, d.dp);
			dst = $appendSlice(dst, $subslice(d.d, 0, m));
			while (true) {
				if (!(m < d.dp)) { break; }
				dst = $append(dst, 48);
				m = m + (1) >> 0;
			}
		} else {
			dst = $append(dst, 48);
		}
		if (prec > 0) {
			dst = $append(dst, 46);
			i = 0;
			while (true) {
				if (!(i < prec)) { break; }
				ch = 48;
				j = d.dp + i >> 0;
				if (0 <= j && j < d.nd) {
					ch = (x = d.d, ((j < 0 || j >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + j]));
				}
				dst = $append(dst, ch);
				i = i + (1) >> 0;
			}
		}
		return dst;
	};
	fmtB = function(dst, neg, mant, exp, flt) {
		var _tuple, _tuple$1, dst, exp, flt, mant, neg;
		if (neg) {
			dst = $append(dst, 45);
		}
		_tuple = formatBits(dst, mant, 10, false, true);
		dst = _tuple[0];
		dst = $append(dst, 112);
		exp = exp - (((flt.mantbits >> 0))) >> 0;
		if (exp >= 0) {
			dst = $append(dst, 43);
		}
		_tuple$1 = formatBits(dst, (new $Uint64(0, exp)), 10, exp < 0, true);
		dst = _tuple$1[0];
		return dst;
	};
	fmtX = function(dst, prec, fmt, neg, mant, exp, flt) {
		var _q, _q$1, _q$2, _q$3, _q$4, _q$5, _r, _r$1, _r$2, _r$3, _r$4, _r$5, ch, dst, exp, extra, flt, fmt, hex, i, mant, neg, prec, shift, x, x$1, x$2, x$3, x$4, x$5, x$6, x$7, x$8;
		if ((mant.$high === 0 && mant.$low === 0)) {
			exp = 0;
		}
		mant = $shiftLeft64(mant, ((60 - flt.mantbits >>> 0)));
		while (true) {
			if (!(!((mant.$high === 0 && mant.$low === 0)) && (x = new $Uint64(mant.$high & 268435456, (mant.$low & 0) >>> 0), (x.$high === 0 && x.$low === 0)))) { break; }
			mant = $shiftLeft64(mant, (1));
			exp = exp - (1) >> 0;
		}
		if (prec >= 0 && prec < 15) {
			shift = ((($imul(prec, 4)) >>> 0));
			extra = (x$1 = $shiftLeft64(mant, shift), new $Uint64(x$1.$high & 268435455, (x$1.$low & 4294967295) >>> 0));
			mant = $shiftRightUint64(mant, ((60 - shift >>> 0)));
			if ((x$2 = (x$3 = new $Uint64(mant.$high & 0, (mant.$low & 1) >>> 0), new $Uint64(extra.$high | x$3.$high, (extra.$low | x$3.$low) >>> 0)), (x$2.$high > 134217728 || (x$2.$high === 134217728 && x$2.$low > 0)))) {
				mant = (x$4 = new $Uint64(0, 1), new $Uint64(mant.$high + x$4.$high, mant.$low + x$4.$low));
			}
			mant = $shiftLeft64(mant, ((60 - shift >>> 0)));
			if (!((x$5 = new $Uint64(mant.$high & 536870912, (mant.$low & 0) >>> 0), (x$5.$high === 0 && x$5.$low === 0)))) {
				mant = $shiftRightUint64(mant, (1));
				exp = exp + (1) >> 0;
			}
		}
		hex = "0123456789abcdef";
		if (fmt === 88) {
			hex = "0123456789ABCDEF";
		}
		if (neg) {
			dst = $append(dst, 45);
		}
		dst = $append(dst, 48, fmt, 48 + (((x$6 = $shiftRightUint64(mant, 60), new $Uint64(x$6.$high & 0, (x$6.$low & 1) >>> 0)).$low << 24 >>> 24)) << 24 >>> 24);
		mant = $shiftLeft64(mant, (4));
		if (prec < 0 && !((mant.$high === 0 && mant.$low === 0))) {
			dst = $append(dst, 46);
			while (true) {
				if (!(!((mant.$high === 0 && mant.$low === 0)))) { break; }
				dst = $append(dst, hex.charCodeAt($flatten64((x$7 = $shiftRightUint64(mant, 60), new $Uint64(x$7.$high & 0, (x$7.$low & 15) >>> 0)))));
				mant = $shiftLeft64(mant, (4));
			}
		} else if (prec > 0) {
			dst = $append(dst, 46);
			i = 0;
			while (true) {
				if (!(i < prec)) { break; }
				dst = $append(dst, hex.charCodeAt($flatten64((x$8 = $shiftRightUint64(mant, 60), new $Uint64(x$8.$high & 0, (x$8.$low & 15) >>> 0)))));
				mant = $shiftLeft64(mant, (4));
				i = i + (1) >> 0;
			}
		}
		ch = 80;
		if (fmt === lower(fmt)) {
			ch = 112;
		}
		dst = $append(dst, ch);
		if (exp < 0) {
			ch = 45;
			exp = -exp;
		} else {
			ch = 43;
		}
		dst = $append(dst, ch);
		if (exp < 100) {
			dst = $append(dst, (((_q = exp / 10, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) << 24 >>> 24)) + 48 << 24 >>> 24, (((_r = exp % 10, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) << 24 >>> 24)) + 48 << 24 >>> 24);
		} else if (exp < 1000) {
			dst = $append(dst, (((_q$1 = exp / 100, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero")) << 24 >>> 24)) + 48 << 24 >>> 24, (((_r$1 = ((_q$2 = exp / 10, (_q$2 === _q$2 && _q$2 !== 1/0 && _q$2 !== -1/0) ? _q$2 >> 0 : $throwRuntimeError("integer divide by zero"))) % 10, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) << 24 >>> 24)) + 48 << 24 >>> 24, (((_r$2 = exp % 10, _r$2 === _r$2 ? _r$2 : $throwRuntimeError("integer divide by zero")) << 24 >>> 24)) + 48 << 24 >>> 24);
		} else {
			dst = $append(dst, (((_q$3 = exp / 1000, (_q$3 === _q$3 && _q$3 !== 1/0 && _q$3 !== -1/0) ? _q$3 >> 0 : $throwRuntimeError("integer divide by zero")) << 24 >>> 24)) + 48 << 24 >>> 24, (_r$3 = (((_q$4 = exp / 100, (_q$4 === _q$4 && _q$4 !== 1/0 && _q$4 !== -1/0) ? _q$4 >> 0 : $throwRuntimeError("integer divide by zero")) << 24 >>> 24)) % 10, _r$3 === _r$3 ? _r$3 : $throwRuntimeError("integer divide by zero")) + 48 << 24 >>> 24, (((_r$4 = ((_q$5 = exp / 10, (_q$5 === _q$5 && _q$5 !== 1/0 && _q$5 !== -1/0) ? _q$5 >> 0 : $throwRuntimeError("integer divide by zero"))) % 10, _r$4 === _r$4 ? _r$4 : $throwRuntimeError("integer divide by zero")) << 24 >>> 24)) + 48 << 24 >>> 24, (((_r$5 = exp % 10, _r$5 === _r$5 ? _r$5 : $throwRuntimeError("integer divide by zero")) << 24 >>> 24)) + 48 << 24 >>> 24);
		}
		return dst;
	};
	min = function(a, b) {
		var a, b;
		if (a < b) {
			return a;
		}
		return b;
	};
	max = function(a, b) {
		var a, b;
		if (a > b) {
			return a;
		}
		return b;
	};
	FormatUint = function(i, base) {
		var _tuple, base, i, s;
		if (true && (i.$high < 0 || (i.$high === 0 && i.$low < 100)) && (base === 10)) {
			return small(((i.$low >> 0)));
		}
		_tuple = formatBits(sliceType$6.nil, i, base, false, false);
		s = _tuple[1];
		return s;
	};
	$pkg.FormatUint = FormatUint;
	FormatInt = function(i, base) {
		var _tuple, base, i, s;
		if (true && (0 < i.$high || (0 === i.$high && 0 <= i.$low)) && (i.$high < 0 || (i.$high === 0 && i.$low < 100)) && (base === 10)) {
			return small((((i.$low + ((i.$high >> 31) * 4294967296)) >> 0)));
		}
		_tuple = formatBits(sliceType$6.nil, (new $Uint64(i.$high, i.$low)), base, (i.$high < 0 || (i.$high === 0 && i.$low < 0)), false);
		s = _tuple[1];
		return s;
	};
	$pkg.FormatInt = FormatInt;
	Itoa = function(i) {
		var i;
		return FormatInt((new $Int64(0, i)), 10);
	};
	$pkg.Itoa = Itoa;
	small = function(i) {
		var i;
		if (i < 10) {
			return $substring("0123456789abcdefghijklmnopqrstuvwxyz", i, (i + 1 >> 0));
		}
		return $substring("00010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263646566676869707172737475767778798081828384858687888990919293949596979899", ($imul(i, 2)), (($imul(i, 2)) + 2 >> 0));
	};
	formatBits = function(dst, u, base, neg, append_) {
		var _q, _q$1, _r, _r$1, a, append_, b, b$1, base, d, dst, i, is, is$1, is$2, j, m, neg, q, q$1, s, shift, u, us, us$1, x, x$1, x$2, x$3, x$4, x$5;
		d = sliceType$6.nil;
		s = "";
		if (base < 2 || base > 36) {
			$panic(new $String("strconv: illegal AppendInt/FormatInt base"));
		}
		a = arrayType$4.zero();
		i = 65;
		if (neg) {
			u = new $Uint64(-u.$high, -u.$low);
		}
		if (base === 10) {
			if (true) {
				while (true) {
					if (!((u.$high > 0 || (u.$high === 0 && u.$low >= 1000000000)))) { break; }
					q = $div64(u, new $Uint64(0, 1000000000), false);
					us = (((x = $mul64(q, new $Uint64(0, 1000000000)), new $Uint64(u.$high - x.$high, u.$low - x.$low)).$low >>> 0));
					j = 4;
					while (true) {
						if (!(j > 0)) { break; }
						is = (_r = us % 100, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) * 2 >>> 0;
						us = (_q = us / (100), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
						i = i - (2) >> 0;
						(x$1 = i + 1 >> 0, ((x$1 < 0 || x$1 >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[x$1] = "00010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263646566676869707172737475767778798081828384858687888990919293949596979899".charCodeAt((is + 1 >>> 0))));
						(x$2 = i + 0 >> 0, ((x$2 < 0 || x$2 >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[x$2] = "00010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263646566676869707172737475767778798081828384858687888990919293949596979899".charCodeAt((is + 0 >>> 0))));
						j = j - (1) >> 0;
					}
					i = i - (1) >> 0;
					((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "00010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263646566676869707172737475767778798081828384858687888990919293949596979899".charCodeAt(((us * 2 >>> 0) + 1 >>> 0)));
					u = q;
				}
			}
			us$1 = ((u.$low >>> 0));
			while (true) {
				if (!(us$1 >= 100)) { break; }
				is$1 = (_r$1 = us$1 % 100, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) * 2 >>> 0;
				us$1 = (_q$1 = us$1 / (100), (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >>> 0 : $throwRuntimeError("integer divide by zero"));
				i = i - (2) >> 0;
				(x$3 = i + 1 >> 0, ((x$3 < 0 || x$3 >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[x$3] = "00010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263646566676869707172737475767778798081828384858687888990919293949596979899".charCodeAt((is$1 + 1 >>> 0))));
				(x$4 = i + 0 >> 0, ((x$4 < 0 || x$4 >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[x$4] = "00010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263646566676869707172737475767778798081828384858687888990919293949596979899".charCodeAt((is$1 + 0 >>> 0))));
			}
			is$2 = us$1 * 2 >>> 0;
			i = i - (1) >> 0;
			((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "00010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263646566676869707172737475767778798081828384858687888990919293949596979899".charCodeAt((is$2 + 1 >>> 0)));
			if (us$1 >= 10) {
				i = i - (1) >> 0;
				((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "00010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263646566676869707172737475767778798081828384858687888990919293949596979899".charCodeAt(is$2));
			}
		} else if (isPowerOfTwo(base)) {
			shift = (((bits.TrailingZeros(((base >>> 0))) >>> 0)) & 7) >>> 0;
			b = (new $Uint64(0, base));
			m = ((base >>> 0)) - 1 >>> 0;
			while (true) {
				if (!((u.$high > b.$high || (u.$high === b.$high && u.$low >= b.$low)))) { break; }
				i = i - (1) >> 0;
				((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt(((((u.$low >>> 0)) & m) >>> 0)));
				u = $shiftRightUint64(u, (shift));
			}
			i = i - (1) >> 0;
			((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt(((u.$low >>> 0))));
		} else {
			b$1 = (new $Uint64(0, base));
			while (true) {
				if (!((u.$high > b$1.$high || (u.$high === b$1.$high && u.$low >= b$1.$low)))) { break; }
				i = i - (1) >> 0;
				q$1 = $div64(u, b$1, false);
				((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt((((x$5 = $mul64(q$1, b$1), new $Uint64(u.$high - x$5.$high, u.$low - x$5.$low)).$low >>> 0))));
				u = q$1;
			}
			i = i - (1) >> 0;
			((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt(((u.$low >>> 0))));
		}
		if (neg) {
			i = i - (1) >> 0;
			((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = 45);
		}
		if (append_) {
			d = $appendSlice(dst, $subslice(new sliceType$6(a), i));
			return [d, s];
		}
		s = ($bytesToString($subslice(new sliceType$6(a), i)));
		return [d, s];
	};
	isPowerOfTwo = function(x) {
		var x;
		return (x & ((x - 1 >> 0))) === 0;
	};
	quoteWith = function(s, quote, ASCIIonly, graphicOnly) {
		var ASCIIonly, _q, graphicOnly, quote, s;
		return ($bytesToString(appendQuotedWith($makeSlice(sliceType$6, 0, (_q = ($imul(3, s.length)) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"))), s, quote, ASCIIonly, graphicOnly)));
	};
	appendQuotedWith = function(buf, s, quote, ASCIIonly, graphicOnly) {
		var ASCIIonly, _tuple, buf, graphicOnly, nBuf, quote, r, s, width;
		if ((buf.$capacity - buf.$length >> 0) < s.length) {
			nBuf = $makeSlice(sliceType$6, buf.$length, (((buf.$length + 1 >> 0) + s.length >> 0) + 1 >> 0));
			$copySlice(nBuf, buf);
			buf = nBuf;
		}
		buf = $append(buf, quote);
		width = 0;
		while (true) {
			if (!(s.length > 0)) { break; }
			r = ((s.charCodeAt(0) >> 0));
			width = 1;
			if (r >= 128) {
				_tuple = utf8.DecodeRuneInString(s);
				r = _tuple[0];
				width = _tuple[1];
			}
			if ((width === 1) && (r === 65533)) {
				buf = $appendSlice(buf, "\\x");
				buf = $append(buf, "0123456789abcdef".charCodeAt((s.charCodeAt(0) >>> 4 << 24 >>> 24)));
				buf = $append(buf, "0123456789abcdef".charCodeAt(((s.charCodeAt(0) & 15) >>> 0)));
				s = $substring(s, width);
				continue;
			}
			buf = appendEscapedRune(buf, r, quote, ASCIIonly, graphicOnly);
			s = $substring(s, width);
		}
		buf = $append(buf, quote);
		return buf;
	};
	appendQuotedRuneWith = function(buf, r, quote, ASCIIonly, graphicOnly) {
		var ASCIIonly, buf, graphicOnly, quote, r;
		buf = $append(buf, quote);
		if (!utf8.ValidRune(r)) {
			r = 65533;
		}
		buf = appendEscapedRune(buf, r, quote, ASCIIonly, graphicOnly);
		buf = $append(buf, quote);
		return buf;
	};
	appendEscapedRune = function(buf, r, quote, ASCIIonly, graphicOnly) {
		var ASCIIonly, _1, buf, graphicOnly, n, quote, r, runeTmp, s, s$1;
		runeTmp = arrayType$5.zero();
		if ((r === ((quote >> 0))) || (r === 92)) {
			buf = $append(buf, 92);
			buf = $append(buf, ((r << 24 >>> 24)));
			return buf;
		}
		if (ASCIIonly) {
			if (r < 128 && IsPrint(r)) {
				buf = $append(buf, ((r << 24 >>> 24)));
				return buf;
			}
		} else if (IsPrint(r) || graphicOnly && isInGraphicList(r)) {
			n = utf8.EncodeRune(new sliceType$6(runeTmp), r);
			buf = $appendSlice(buf, $subslice(new sliceType$6(runeTmp), 0, n));
			return buf;
		}
		_1 = r;
		if (_1 === (7)) {
			buf = $appendSlice(buf, "\\a");
		} else if (_1 === (8)) {
			buf = $appendSlice(buf, "\\b");
		} else if (_1 === (12)) {
			buf = $appendSlice(buf, "\\f");
		} else if (_1 === (10)) {
			buf = $appendSlice(buf, "\\n");
		} else if (_1 === (13)) {
			buf = $appendSlice(buf, "\\r");
		} else if (_1 === (9)) {
			buf = $appendSlice(buf, "\\t");
		} else if (_1 === (11)) {
			buf = $appendSlice(buf, "\\v");
		} else {
			if (r < 32) {
				buf = $appendSlice(buf, "\\x");
				buf = $append(buf, "0123456789abcdef".charCodeAt((((r << 24 >>> 24)) >>> 4 << 24 >>> 24)));
				buf = $append(buf, "0123456789abcdef".charCodeAt(((((r << 24 >>> 24)) & 15) >>> 0)));
			} else if (r > 1114111) {
				r = 65533;
				buf = $appendSlice(buf, "\\u");
				s = 12;
				while (true) {
					if (!(s >= 0)) { break; }
					buf = $append(buf, "0123456789abcdef".charCodeAt((((r >> $min(((s >>> 0)), 31)) >> 0) & 15)));
					s = s - (4) >> 0;
				}
			} else if (r < 65536) {
				buf = $appendSlice(buf, "\\u");
				s = 12;
				while (true) {
					if (!(s >= 0)) { break; }
					buf = $append(buf, "0123456789abcdef".charCodeAt((((r >> $min(((s >>> 0)), 31)) >> 0) & 15)));
					s = s - (4) >> 0;
				}
			} else {
				buf = $appendSlice(buf, "\\U");
				s$1 = 28;
				while (true) {
					if (!(s$1 >= 0)) { break; }
					buf = $append(buf, "0123456789abcdef".charCodeAt((((r >> $min(((s$1 >>> 0)), 31)) >> 0) & 15)));
					s$1 = s$1 - (4) >> 0;
				}
			}
		}
		return buf;
	};
	Quote = function(s) {
		var s;
		return quoteWith(s, 34, false, false);
	};
	$pkg.Quote = Quote;
	AppendQuote = function(dst, s) {
		var dst, s;
		return appendQuotedWith(dst, s, 34, false, false);
	};
	$pkg.AppendQuote = AppendQuote;
	QuoteToASCII = function(s) {
		var s;
		return quoteWith(s, 34, true, false);
	};
	$pkg.QuoteToASCII = QuoteToASCII;
	AppendQuoteToASCII = function(dst, s) {
		var dst, s;
		return appendQuotedWith(dst, s, 34, true, false);
	};
	$pkg.AppendQuoteToASCII = AppendQuoteToASCII;
	AppendQuoteRune = function(dst, r) {
		var dst, r;
		return appendQuotedRuneWith(dst, r, 39, false, false);
	};
	$pkg.AppendQuoteRune = AppendQuoteRune;
	AppendQuoteRuneToASCII = function(dst, r) {
		var dst, r;
		return appendQuotedRuneWith(dst, r, 39, true, false);
	};
	$pkg.AppendQuoteRuneToASCII = AppendQuoteRuneToASCII;
	CanBackquote = function(s) {
		var _tuple, r, s, wid;
		while (true) {
			if (!(s.length > 0)) { break; }
			_tuple = utf8.DecodeRuneInString(s);
			r = _tuple[0];
			wid = _tuple[1];
			s = $substring(s, wid);
			if (wid > 1) {
				if (r === 65279) {
					return false;
				}
				continue;
			}
			if (r === 65533) {
				return false;
			}
			if ((r < 32 && !((r === 9))) || (r === 96) || (r === 127)) {
				return false;
			}
		}
		return true;
	};
	$pkg.CanBackquote = CanBackquote;
	unhex = function(b) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, b, c, ok, v;
		v = 0;
		ok = false;
		c = ((b >> 0));
		if (48 <= c && c <= 57) {
			_tmp = c - 48 >> 0;
			_tmp$1 = true;
			v = _tmp;
			ok = _tmp$1;
			return [v, ok];
		} else if (97 <= c && c <= 102) {
			_tmp$2 = (c - 97 >> 0) + 10 >> 0;
			_tmp$3 = true;
			v = _tmp$2;
			ok = _tmp$3;
			return [v, ok];
		} else if (65 <= c && c <= 70) {
			_tmp$4 = (c - 65 >> 0) + 10 >> 0;
			_tmp$5 = true;
			v = _tmp$4;
			ok = _tmp$5;
			return [v, ok];
		}
		return [v, ok];
	};
	UnquoteChar = function(s, quote) {
		var _1, _2, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tuple, _tuple$1, c, c$1, err, j, j$1, multibyte, n, ok, quote, r, s, size, tail, v, v$1, value, x, x$1;
		value = 0;
		multibyte = false;
		tail = "";
		err = $ifaceNil;
		if (s.length === 0) {
			err = $pkg.ErrSyntax;
			return [value, multibyte, tail, err];
		}
		c = s.charCodeAt(0);
		if ((c === quote) && ((quote === 39) || (quote === 34))) {
			err = $pkg.ErrSyntax;
			return [value, multibyte, tail, err];
		} else if (c >= 128) {
			_tuple = utf8.DecodeRuneInString(s);
			r = _tuple[0];
			size = _tuple[1];
			_tmp = r;
			_tmp$1 = true;
			_tmp$2 = $substring(s, size);
			_tmp$3 = $ifaceNil;
			value = _tmp;
			multibyte = _tmp$1;
			tail = _tmp$2;
			err = _tmp$3;
			return [value, multibyte, tail, err];
		} else if (!((c === 92))) {
			_tmp$4 = ((s.charCodeAt(0) >> 0));
			_tmp$5 = false;
			_tmp$6 = $substring(s, 1);
			_tmp$7 = $ifaceNil;
			value = _tmp$4;
			multibyte = _tmp$5;
			tail = _tmp$6;
			err = _tmp$7;
			return [value, multibyte, tail, err];
		}
		if (s.length <= 1) {
			err = $pkg.ErrSyntax;
			return [value, multibyte, tail, err];
		}
		c$1 = s.charCodeAt(1);
		s = $substring(s, 2);
		switch (0) { default:
			_1 = c$1;
			if (_1 === (97)) {
				value = 7;
			} else if (_1 === (98)) {
				value = 8;
			} else if (_1 === (102)) {
				value = 12;
			} else if (_1 === (110)) {
				value = 10;
			} else if (_1 === (114)) {
				value = 13;
			} else if (_1 === (116)) {
				value = 9;
			} else if (_1 === (118)) {
				value = 11;
			} else if ((_1 === (120)) || (_1 === (117)) || (_1 === (85))) {
				n = 0;
				_2 = c$1;
				if (_2 === (120)) {
					n = 2;
				} else if (_2 === (117)) {
					n = 4;
				} else if (_2 === (85)) {
					n = 8;
				}
				v = 0;
				if (s.length < n) {
					err = $pkg.ErrSyntax;
					return [value, multibyte, tail, err];
				}
				j = 0;
				while (true) {
					if (!(j < n)) { break; }
					_tuple$1 = unhex(s.charCodeAt(j));
					x = _tuple$1[0];
					ok = _tuple$1[1];
					if (!ok) {
						err = $pkg.ErrSyntax;
						return [value, multibyte, tail, err];
					}
					v = (v << 4 >> 0) | x;
					j = j + (1) >> 0;
				}
				s = $substring(s, n);
				if (c$1 === 120) {
					value = v;
					break;
				}
				if (v > 1114111) {
					err = $pkg.ErrSyntax;
					return [value, multibyte, tail, err];
				}
				value = v;
				multibyte = true;
			} else if ((_1 === (48)) || (_1 === (49)) || (_1 === (50)) || (_1 === (51)) || (_1 === (52)) || (_1 === (53)) || (_1 === (54)) || (_1 === (55))) {
				v$1 = ((c$1 >> 0)) - 48 >> 0;
				if (s.length < 2) {
					err = $pkg.ErrSyntax;
					return [value, multibyte, tail, err];
				}
				j$1 = 0;
				while (true) {
					if (!(j$1 < 2)) { break; }
					x$1 = ((s.charCodeAt(j$1) >> 0)) - 48 >> 0;
					if (x$1 < 0 || x$1 > 7) {
						err = $pkg.ErrSyntax;
						return [value, multibyte, tail, err];
					}
					v$1 = ((v$1 << 3 >> 0)) | x$1;
					j$1 = j$1 + (1) >> 0;
				}
				s = $substring(s, 2);
				if (v$1 > 255) {
					err = $pkg.ErrSyntax;
					return [value, multibyte, tail, err];
				}
				value = v$1;
			} else if (_1 === (92)) {
				value = 92;
			} else if ((_1 === (39)) || (_1 === (34))) {
				if (!((c$1 === quote))) {
					err = $pkg.ErrSyntax;
					return [value, multibyte, tail, err];
				}
				value = ((c$1 >> 0));
			} else {
				err = $pkg.ErrSyntax;
				return [value, multibyte, tail, err];
			}
		}
		tail = s;
		return [value, multibyte, tail, err];
	};
	$pkg.UnquoteChar = UnquoteChar;
	Unquote = function(s) {
		var _1, _q, _tuple, _tuple$1, buf, buf$1, c, err, i, multibyte, n, n$1, quote, r, runeTmp, s, size, ss;
		n = s.length;
		if (n < 2) {
			return ["", $pkg.ErrSyntax];
		}
		quote = s.charCodeAt(0);
		if (!((quote === s.charCodeAt((n - 1 >> 0))))) {
			return ["", $pkg.ErrSyntax];
		}
		s = $substring(s, 1, (n - 1 >> 0));
		if (quote === 96) {
			if (contains(s, 96)) {
				return ["", $pkg.ErrSyntax];
			}
			if (contains(s, 13)) {
				buf = $makeSlice(sliceType$6, 0, (s.length - 1 >> 0));
				i = 0;
				while (true) {
					if (!(i < s.length)) { break; }
					if (!((s.charCodeAt(i) === 13))) {
						buf = $append(buf, s.charCodeAt(i));
					}
					i = i + (1) >> 0;
				}
				return [($bytesToString(buf)), $ifaceNil];
			}
			return [s, $ifaceNil];
		}
		if (!((quote === 34)) && !((quote === 39))) {
			return ["", $pkg.ErrSyntax];
		}
		if (contains(s, 10)) {
			return ["", $pkg.ErrSyntax];
		}
		if (!contains(s, 92) && !contains(s, quote)) {
			_1 = quote;
			if (_1 === (34)) {
				if (utf8.ValidString(s)) {
					return [s, $ifaceNil];
				}
			} else if (_1 === (39)) {
				_tuple = utf8.DecodeRuneInString(s);
				r = _tuple[0];
				size = _tuple[1];
				if ((size === s.length) && (!((r === 65533)) || !((size === 1)))) {
					return [s, $ifaceNil];
				}
			}
		}
		runeTmp = arrayType$5.zero();
		buf$1 = $makeSlice(sliceType$6, 0, (_q = ($imul(3, s.length)) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")));
		while (true) {
			if (!(s.length > 0)) { break; }
			_tuple$1 = UnquoteChar(s, quote);
			c = _tuple$1[0];
			multibyte = _tuple$1[1];
			ss = _tuple$1[2];
			err = _tuple$1[3];
			if (!($interfaceIsEqual(err, $ifaceNil))) {
				return ["", err];
			}
			s = ss;
			if (c < 128 || !multibyte) {
				buf$1 = $append(buf$1, ((c << 24 >>> 24)));
			} else {
				n$1 = utf8.EncodeRune(new sliceType$6(runeTmp), c);
				buf$1 = $appendSlice(buf$1, $subslice(new sliceType$6(runeTmp), 0, n$1));
			}
			if ((quote === 39) && !((s.length === 0))) {
				return ["", $pkg.ErrSyntax];
			}
		}
		return [($bytesToString(buf$1)), $ifaceNil];
	};
	$pkg.Unquote = Unquote;
	contains = function(s, c) {
		var c, s;
		return !((bytealg.IndexByteString(s, c) === -1));
	};
	bsearch16 = function(a, x) {
		var _q, _tmp, _tmp$1, a, h, i, j, x;
		_tmp = 0;
		_tmp$1 = a.$length;
		i = _tmp;
		j = _tmp$1;
		while (true) {
			if (!(i < j)) { break; }
			h = i + (_q = ((j - i >> 0)) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0;
			if (((h < 0 || h >= a.$length) ? ($throwRuntimeError("index out of range"), undefined) : a.$array[a.$offset + h]) < x) {
				i = h + 1 >> 0;
			} else {
				j = h;
			}
		}
		return i;
	};
	bsearch32 = function(a, x) {
		var _q, _tmp, _tmp$1, a, h, i, j, x;
		_tmp = 0;
		_tmp$1 = a.$length;
		i = _tmp;
		j = _tmp$1;
		while (true) {
			if (!(i < j)) { break; }
			h = i + (_q = ((j - i >> 0)) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0;
			if (((h < 0 || h >= a.$length) ? ($throwRuntimeError("index out of range"), undefined) : a.$array[a.$offset + h]) < x) {
				i = h + 1 >> 0;
			} else {
				j = h;
			}
		}
		return i;
	};
	IsPrint = function(r) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, i, i$1, isNotPrint, isNotPrint$1, isPrint, isPrint$1, j, j$1, r, rr, rr$1, x, x$1, x$2, x$3;
		if (r <= 255) {
			if (32 <= r && r <= 126) {
				return true;
			}
			if (161 <= r && r <= 255) {
				return !((r === 173));
			}
			return false;
		}
		if (0 <= r && r < 65536) {
			_tmp = ((r << 16 >>> 16));
			_tmp$1 = isPrint16;
			_tmp$2 = isNotPrint16;
			rr = _tmp;
			isPrint = _tmp$1;
			isNotPrint = _tmp$2;
			i = bsearch16(isPrint, rr);
			if (i >= isPrint.$length || rr < (x = (i & ~1) >> 0, ((x < 0 || x >= isPrint.$length) ? ($throwRuntimeError("index out of range"), undefined) : isPrint.$array[isPrint.$offset + x])) || (x$1 = i | 1, ((x$1 < 0 || x$1 >= isPrint.$length) ? ($throwRuntimeError("index out of range"), undefined) : isPrint.$array[isPrint.$offset + x$1])) < rr) {
				return false;
			}
			j = bsearch16(isNotPrint, rr);
			return j >= isNotPrint.$length || !((((j < 0 || j >= isNotPrint.$length) ? ($throwRuntimeError("index out of range"), undefined) : isNotPrint.$array[isNotPrint.$offset + j]) === rr));
		}
		_tmp$3 = ((r >>> 0));
		_tmp$4 = isPrint32;
		_tmp$5 = isNotPrint32;
		rr$1 = _tmp$3;
		isPrint$1 = _tmp$4;
		isNotPrint$1 = _tmp$5;
		i$1 = bsearch32(isPrint$1, rr$1);
		if (i$1 >= isPrint$1.$length || rr$1 < (x$2 = (i$1 & ~1) >> 0, ((x$2 < 0 || x$2 >= isPrint$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : isPrint$1.$array[isPrint$1.$offset + x$2])) || (x$3 = i$1 | 1, ((x$3 < 0 || x$3 >= isPrint$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : isPrint$1.$array[isPrint$1.$offset + x$3])) < rr$1) {
			return false;
		}
		if (r >= 131072) {
			return true;
		}
		r = r - (65536) >> 0;
		j$1 = bsearch16(isNotPrint$1, ((r << 16 >>> 16)));
		return j$1 >= isNotPrint$1.$length || !((((j$1 < 0 || j$1 >= isNotPrint$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : isNotPrint$1.$array[isNotPrint$1.$offset + j$1]) === ((r << 16 >>> 16))));
	};
	$pkg.IsPrint = IsPrint;
	isInGraphicList = function(r) {
		var i, r, rr;
		if (r > 65535) {
			return false;
		}
		rr = ((r << 16 >>> 16));
		i = bsearch16(isGraphic, rr);
		return i < isGraphic.$length && (rr === ((i < 0 || i >= isGraphic.$length) ? ($throwRuntimeError("index out of range"), undefined) : isGraphic.$array[isGraphic.$offset + i]));
	};
	ptrType.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Unwrap", name: "Unwrap", pkg: "", typ: $funcType([], [$error], false)}];
	ptrType$2.methods = [{prop: "set", name: "set", pkg: "strconv", typ: $funcType([$String], [$Bool], false)}, {prop: "floatBits", name: "floatBits", pkg: "strconv", typ: $funcType([ptrType$1], [$Uint64, $Bool], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Assign", name: "Assign", pkg: "", typ: $funcType([$Uint64], [], false)}, {prop: "Shift", name: "Shift", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "Round", name: "Round", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "RoundDown", name: "RoundDown", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "RoundUp", name: "RoundUp", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "RoundedInteger", name: "RoundedInteger", pkg: "", typ: $funcType([], [$Uint64], false)}];
	ptrType$4.methods = [{prop: "AssignComputeBounds", name: "AssignComputeBounds", pkg: "", typ: $funcType([$Uint64, $Int, $Bool, ptrType$1], [extFloat, extFloat], false)}, {prop: "Normalize", name: "Normalize", pkg: "", typ: $funcType([], [$Uint], false)}, {prop: "Multiply", name: "Multiply", pkg: "", typ: $funcType([extFloat], [], false)}, {prop: "frexp10", name: "frexp10", pkg: "strconv", typ: $funcType([], [$Int, $Int], false)}, {prop: "FixedDecimal", name: "FixedDecimal", pkg: "", typ: $funcType([ptrType$3, $Int], [$Bool], false)}, {prop: "ShortestDecimal", name: "ShortestDecimal", pkg: "", typ: $funcType([ptrType$3, ptrType$4, ptrType$4], [$Bool], false)}];
	NumError.init("", [{prop: "Func", name: "Func", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "Num", name: "Num", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "Err", name: "Err", embedded: false, exported: true, typ: $error, tag: ""}]);
	decimal.init("strconv", [{prop: "d", name: "d", embedded: false, exported: false, typ: arrayType$1, tag: ""}, {prop: "nd", name: "nd", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "dp", name: "dp", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "neg", name: "neg", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "trunc", name: "trunc", embedded: false, exported: false, typ: $Bool, tag: ""}]);
	leftCheat.init("strconv", [{prop: "delta", name: "delta", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "cutoff", name: "cutoff", embedded: false, exported: false, typ: $String, tag: ""}]);
	extFloat.init("strconv", [{prop: "mant", name: "mant", embedded: false, exported: false, typ: $Uint64, tag: ""}, {prop: "exp", name: "exp", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "neg", name: "neg", embedded: false, exported: false, typ: $Bool, tag: ""}]);
	floatInfo.init("strconv", [{prop: "mantbits", name: "mantbits", embedded: false, exported: false, typ: $Uint, tag: ""}, {prop: "expbits", name: "expbits", embedded: false, exported: false, typ: $Uint, tag: ""}, {prop: "bias", name: "bias", embedded: false, exported: false, typ: $Int, tag: ""}]);
	decimalSlice.init("strconv", [{prop: "d", name: "d", embedded: false, exported: false, typ: sliceType$6, tag: ""}, {prop: "nd", name: "nd", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "dp", name: "dp", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "neg", name: "neg", embedded: false, exported: false, typ: $Bool, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = errors.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = bytealg.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = math.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = bits.$init(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = utf8.$init(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		optimize = true;
		powtab = new sliceType([1, 3, 6, 9, 13, 16, 19, 23, 26]);
		float64pow10 = new sliceType$1([1, 10, 100, 1000, 10000, 100000, 1e+06, 1e+07, 1e+08, 1e+09, 1e+10, 1e+11, 1e+12, 1e+13, 1e+14, 1e+15, 1e+16, 1e+17, 1e+18, 1e+19, 1e+20, 1e+21, 1e+22]);
		float32pow10 = new sliceType$2([1, 10, 100, 1000, 10000, 100000, 1e+06, 1e+07, 1e+08, 1e+09, 1e+10]);
		$pkg.ErrRange = errors.New("value out of range");
		$pkg.ErrSyntax = errors.New("invalid syntax");
		leftcheats = new sliceType$3([new leftCheat.ptr(0, ""), new leftCheat.ptr(1, "5"), new leftCheat.ptr(1, "25"), new leftCheat.ptr(1, "125"), new leftCheat.ptr(2, "625"), new leftCheat.ptr(2, "3125"), new leftCheat.ptr(2, "15625"), new leftCheat.ptr(3, "78125"), new leftCheat.ptr(3, "390625"), new leftCheat.ptr(3, "1953125"), new leftCheat.ptr(4, "9765625"), new leftCheat.ptr(4, "48828125"), new leftCheat.ptr(4, "244140625"), new leftCheat.ptr(4, "1220703125"), new leftCheat.ptr(5, "6103515625"), new leftCheat.ptr(5, "30517578125"), new leftCheat.ptr(5, "152587890625"), new leftCheat.ptr(6, "762939453125"), new leftCheat.ptr(6, "3814697265625"), new leftCheat.ptr(6, "19073486328125"), new leftCheat.ptr(7, "95367431640625"), new leftCheat.ptr(7, "476837158203125"), new leftCheat.ptr(7, "2384185791015625"), new leftCheat.ptr(7, "11920928955078125"), new leftCheat.ptr(8, "59604644775390625"), new leftCheat.ptr(8, "298023223876953125"), new leftCheat.ptr(8, "1490116119384765625"), new leftCheat.ptr(9, "7450580596923828125"), new leftCheat.ptr(9, "37252902984619140625"), new leftCheat.ptr(9, "186264514923095703125"), new leftCheat.ptr(10, "931322574615478515625"), new leftCheat.ptr(10, "4656612873077392578125"), new leftCheat.ptr(10, "23283064365386962890625"), new leftCheat.ptr(10, "116415321826934814453125"), new leftCheat.ptr(11, "582076609134674072265625"), new leftCheat.ptr(11, "2910383045673370361328125"), new leftCheat.ptr(11, "14551915228366851806640625"), new leftCheat.ptr(12, "72759576141834259033203125"), new leftCheat.ptr(12, "363797880709171295166015625"), new leftCheat.ptr(12, "1818989403545856475830078125"), new leftCheat.ptr(13, "9094947017729282379150390625"), new leftCheat.ptr(13, "45474735088646411895751953125"), new leftCheat.ptr(13, "227373675443232059478759765625"), new leftCheat.ptr(13, "1136868377216160297393798828125"), new leftCheat.ptr(14, "5684341886080801486968994140625"), new leftCheat.ptr(14, "28421709430404007434844970703125"), new leftCheat.ptr(14, "142108547152020037174224853515625"), new leftCheat.ptr(15, "710542735760100185871124267578125"), new leftCheat.ptr(15, "3552713678800500929355621337890625"), new leftCheat.ptr(15, "17763568394002504646778106689453125"), new leftCheat.ptr(16, "88817841970012523233890533447265625"), new leftCheat.ptr(16, "444089209850062616169452667236328125"), new leftCheat.ptr(16, "2220446049250313080847263336181640625"), new leftCheat.ptr(16, "11102230246251565404236316680908203125"), new leftCheat.ptr(17, "55511151231257827021181583404541015625"), new leftCheat.ptr(17, "277555756156289135105907917022705078125"), new leftCheat.ptr(17, "1387778780781445675529539585113525390625"), new leftCheat.ptr(18, "6938893903907228377647697925567626953125"), new leftCheat.ptr(18, "34694469519536141888238489627838134765625"), new leftCheat.ptr(18, "173472347597680709441192448139190673828125"), new leftCheat.ptr(19, "867361737988403547205962240695953369140625")]);
		detailedPowersOfTen = $toNativeArray($kindArray, [$toNativeArray($kindUint64, [new $Uint64(389204073, 3445679187), new $Uint64(4203730336, 136053384)]), $toNativeArray($kindUint64, [new $Uint64(243252546, 542936756), new $Uint64(2627331460, 85033365)]), $toNativeArray($kindUint64, [new $Uint64(1377807506, 2826154593), new $Uint64(3284164325, 106291706)]), $toNativeArray($kindUint64, [new $Uint64(3869743031, 1385209593), new $Uint64(4105205406, 1206606456)]), $toNativeArray($kindUint64, [new $Uint64(2418589394, 2476368732), new $Uint64(2565753378, 3975354507)]), $toNativeArray($kindUint64, [new $Uint64(1949494919, 947977267), new $Uint64(3207191723, 2821709486)]), $toNativeArray($kindUint64, [new $Uint64(289385001, 111229759), new $Uint64(4008989654, 2453395034)]), $toNativeArray($kindUint64, [new $Uint64(1254607449, 2753873159), new $Uint64(2505618534, 459630072)]), $toNativeArray($kindUint64, [new $Uint64(1568259312, 221115977), new $Uint64(3132023167, 2722021238)]), $toNativeArray($kindUint64, [new $Uint64(4107807788, 276394972), new $Uint64(3915028959, 2328784723)]), $toNativeArray($kindUint64, [new $Uint64(2030508955, 2320230505), new $Uint64(2446893099, 3066103188)]), $toNativeArray($kindUint64, [new $Uint64(2538136194, 1826546308), new $Uint64(3058616374, 2758887161)]), $toNativeArray($kindUint64, [new $Uint64(4246412067, 135699237), new $Uint64(3823270468, 1301125303)]), $toNativeArray($kindUint64, [new $Uint64(4264620277, 3842908407), new $Uint64(2389544042, 2960686962)]), $toNativeArray($kindUint64, [new $Uint64(3183291699, 1582410037), new $Uint64(2986930053, 1553375055)]), $toNativeArray($kindUint64, [new $Uint64(2905372800, 904270722), new $Uint64(3733662566, 3015460643)]), $toNativeArray($kindUint64, [new $Uint64(1278987088, 565169201), new $Uint64(2333539104, 810921078)]), $toNativeArray($kindUint64, [new $Uint64(3746217508, 706461501), new $Uint64(2916923880, 1013651347)]), $toNativeArray($kindUint64, [new $Uint64(3609030061, 883076877), new $Uint64(3646154850, 1267064184)]), $toNativeArray($kindUint64, [new $Uint64(2255643788, 1088793960), new $Uint64(2278846781, 1865656939)]), $toNativeArray($kindUint64, [new $Uint64(1745812911, 1360992450), new $Uint64(2848558476, 3405812998)]), $toNativeArray($kindUint64, [new $Uint64(34782491, 627498738), new $Uint64(3560698095, 4257266248)]), $toNativeArray($kindUint64, [new $Uint64(21739056, 4150283095), new $Uint64(2225436309, 4271404141)]), $toNativeArray($kindUint64, [new $Uint64(1100915645, 892886573), new $Uint64(2781795387, 2118029704)]), $toNativeArray($kindUint64, [new $Uint64(1376144556, 2189850041), new $Uint64(3477244234, 1573795306)]), $toNativeArray($kindUint64, [new $Uint64(1933832171, 3516139923), new $Uint64(2173277646, 2057363890)]), $toNativeArray($kindUint64, [new $Uint64(269806566, 3321433080), new $Uint64(2716597058, 424221215)]), $toNativeArray($kindUint64, [new $Uint64(3558483680, 2004307702), new $Uint64(3395746322, 2677760166)]), $toNativeArray($kindUint64, [new $Uint64(2300620952, 2505384628), new $Uint64(4244682903, 1199716560)]), $toNativeArray($kindUint64, [new $Uint64(1437888095, 1565865392), new $Uint64(2652926814, 2360435586)]), $toNativeArray($kindUint64, [new $Uint64(3944843767, 883589917), new $Uint64(3316158518, 803060834)]), $toNativeArray($kindUint64, [new $Uint64(2783571061, 30745572), new $Uint64(4145198147, 3151309691)]), $toNativeArray($kindUint64, [new $Uint64(1202861001, 556086894), new $Uint64(2590748842, 1432697645)]), $toNativeArray($kindUint64, [new $Uint64(2577318075, 1768850442), new $Uint64(3238436052, 3938355704)]), $toNativeArray($kindUint64, [new $Uint64(3221647594, 1137321229), new $Uint64(4048045066, 627977334)]), $toNativeArray($kindUint64, [new $Uint64(939787922, 1784567592), new $Uint64(2530028166, 1466227658)]), $toNativeArray($kindUint64, [new $Uint64(3322218551, 83225842), new $Uint64(3162535207, 3980268220)]), $toNativeArray($kindUint64, [new $Uint64(4152773188, 3325257774), new $Uint64(3953169009, 3901593451)]), $toNativeArray($kindUint64, [new $Uint64(2058612330, 4225769757), new $Uint64(2470730631, 827883171)]), $toNativeArray($kindUint64, [new $Uint64(1499523589, 3134728548), new $Uint64(3088413288, 4256079436)]), $toNativeArray($kindUint64, [new $Uint64(1874404487, 697185213), new $Uint64(3860516611, 1025131999)]), $toNativeArray($kindUint64, [new $Uint64(2782115540, 2046353494), new $Uint64(2412822882, 103836587)]), $toNativeArray($kindUint64, [new $Uint64(2403902601, 2557941868), new $Uint64(3016028602, 2277279382)]), $toNativeArray($kindUint64, [new $Uint64(857394603, 4271169159), new $Uint64(3770035753, 699115580)]), $toNativeArray($kindUint64, [new $Uint64(2683355275, 2132609812), new $Uint64(2356272345, 3121301797)]), $toNativeArray($kindUint64, [new $Uint64(132968622, 1592020441), new $Uint64(2945340432, 680401775)]), $toNativeArray($kindUint64, [new $Uint64(3387436249, 4137509200), new $Uint64(3681675540, 850502218)]), $toNativeArray($kindUint64, [new $Uint64(3190889480, 975330514), new $Uint64(2301047212, 2679047534)]), $toNativeArray($kindUint64, [new $Uint64(1841128202, 1219163142), new $Uint64(2876309015, 3348809418)]), $toNativeArray($kindUint64, [new $Uint64(153926604, 3671437576), new $Uint64(3595386269, 3112269949)]), $toNativeArray($kindUint64, [new $Uint64(633075040, 147164837), new $Uint64(2247116418, 2482039630)]), $toNativeArray($kindUint64, [new $Uint64(2938827448, 183956046), new $Uint64(2808895523, 955065889)]), $toNativeArray($kindUint64, [new $Uint64(452308838, 229945057), new $Uint64(3511119404, 120090538)]), $toNativeArray($kindUint64, [new $Uint64(1356434847, 3364941133), new $Uint64(2194449627, 2222540234)]), $toNativeArray($kindUint64, [new $Uint64(3843027207, 3132434592), new $Uint64(2743062034, 1704433468)]), $toNativeArray($kindUint64, [new $Uint64(508816713, 2841801416), new $Uint64(3428827542, 4278025484)]), $toNativeArray($kindUint64, [new $Uint64(636020892, 331026298), new $Uint64(4286034428, 3200048207)]), $toNativeArray($kindUint64, [new $Uint64(2008125793, 2354375084), new $Uint64(2678771517, 4147513777)]), $toNativeArray($kindUint64, [new $Uint64(3583899065, 4016710679), new $Uint64(3348464397, 1963166749)]), $toNativeArray($kindUint64, [new $Uint64(1258648360, 1799662877), new $Uint64(4185580496, 3527700261)]), $toNativeArray($kindUint64, [new $Uint64(1323526137, 1124789298), new $Uint64(2615987810, 2204812663)]), $toNativeArray($kindUint64, [new $Uint64(580665847, 2479728447), new $Uint64(3269984763, 608532181)]), $toNativeArray($kindUint64, [new $Uint64(1799574133, 2025918735), new $Uint64(4087480953, 3981890698)]), $toNativeArray($kindUint64, [new $Uint64(2198475657, 1803070121), new $Uint64(2554675596, 878068950)]), $toNativeArray($kindUint64, [new $Uint64(600610923, 3327579475), new $Uint64(3193344495, 1097586188)]), $toNativeArray($kindUint64, [new $Uint64(750763654, 3085732520), new $Uint64(3991680619, 298240911)]), $toNativeArray($kindUint64, [new $Uint64(2079840020, 854841001), new $Uint64(2494800386, 3944496953)]), $toNativeArray($kindUint64, [new $Uint64(3673541849, 1068551251), new $Uint64(3118500483, 2783137543)]), $toNativeArray($kindUint64, [new $Uint64(3518185487, 2409430888), new $Uint64(3898125604, 2405180105)]), $toNativeArray($kindUint64, [new $Uint64(588253193, 3116507041), new $Uint64(2436328502, 3650721214)]), $toNativeArray($kindUint64, [new $Uint64(2882800140, 674408330), new $Uint64(3045410628, 2415917869)]), $toNativeArray($kindUint64, [new $Uint64(382274703, 843010412), new $Uint64(3806763285, 3019897337)]), $toNativeArray($kindUint64, [new $Uint64(2923276249, 2137494243), new $Uint64(2379227053, 2424306747)]), $toNativeArray($kindUint64, [new $Uint64(2580353487, 3745609628), new $Uint64(2974033816, 4104125258)]), $toNativeArray($kindUint64, [new $Uint64(1077958211, 3608270211), new $Uint64(3717542271, 835189277)]), $toNativeArray($kindUint64, [new $Uint64(1210594794, 1718297970), new $Uint64(2323463919, 2132606034)]), $toNativeArray($kindUint64, [new $Uint64(3660727141, 388815), new $Uint64(2904329899, 1592015718)]), $toNativeArray($kindUint64, [new $Uint64(2428425278, 1074227842), new $Uint64(3630412374, 916277824)]), $toNativeArray($kindUint64, [new $Uint64(1517765798, 3892617873), new $Uint64(2269007733, 3793899112)]), $toNativeArray($kindUint64, [new $Uint64(1897207248, 2718288694), new $Uint64(2836259667, 1521148418)]), $toNativeArray($kindUint64, [new $Uint64(224025412, 3397860867), new $Uint64(3545324584, 827693699)]), $toNativeArray($kindUint64, [new $Uint64(3898112266, 4271146690), new $Uint64(2215827865, 517308561)]), $toNativeArray($kindUint64, [new $Uint64(1651414861, 3191449714), new $Uint64(2769784831, 1720377526)]), $toNativeArray($kindUint64, [new $Uint64(4211752225, 768086671), new $Uint64(3462231039, 1076730083)]), $toNativeArray($kindUint64, [new $Uint64(2095474228, 3164408729), new $Uint64(2163894399, 2283569038)]), $toNativeArray($kindUint64, [new $Uint64(471859137, 3955510912), new $Uint64(2704867999, 1780719474)]), $toNativeArray($kindUint64, [new $Uint64(2737307570, 1723163168), new $Uint64(3381084999, 1152157518)]), $toNativeArray($kindUint64, [new $Uint64(1274150815, 6470312), new $Uint64(4226356249, 366455074)]), $toNativeArray($kindUint64, [new $Uint64(1870086083, 1614656681), new $Uint64(2641472655, 2913388981)]), $toNativeArray($kindUint64, [new $Uint64(3411349428, 944579027), new $Uint64(3301840819, 2567994402)]), $toNativeArray($kindUint64, [new $Uint64(2116703137, 1180723784), new $Uint64(4127301024, 2136251179)]), $toNativeArray($kindUint64, [new $Uint64(786068548, 3422306925), new $Uint64(2579563140, 1335156987)]), $toNativeArray($kindUint64, [new $Uint64(4203811157, 4277883656), new $Uint64(3224453925, 1668946233)]), $toNativeArray($kindUint64, [new $Uint64(2033538475, 2126129098), new $Uint64(4030567406, 3159924616)]), $toNativeArray($kindUint64, [new $Uint64(1270961547, 791959774), new $Uint64(2519104629, 901211061)]), $toNativeArray($kindUint64, [new $Uint64(2662443757, 4211175190), new $Uint64(3148880786, 2200255650)]), $toNativeArray($kindUint64, [new $Uint64(1180571049, 2042743516), new $Uint64(3936100983, 602835915)]), $toNativeArray($kindUint64, [new $Uint64(200985993, 3961069257), new $Uint64(2460063114, 1987385183)]), $toNativeArray($kindUint64, [new $Uint64(3472457964, 1730111099), new $Uint64(3075078893, 336747830)]), $toNativeArray($kindUint64, [new $Uint64(2193088807, 2162638874), new $Uint64(3843848616, 1494676612)]), $toNativeArray($kindUint64, [new $Uint64(3518164152, 2962262032), new $Uint64(2402405385, 934172882)]), $toNativeArray($kindUint64, [new $Uint64(2250221542, 3702827541), new $Uint64(3003006731, 2241457927)]), $toNativeArray($kindUint64, [new $Uint64(1739035104, 2481050778), new $Uint64(3753758414, 1728080585)]), $toNativeArray($kindUint64, [new $Uint64(3771251500, 1550656736), new $Uint64(2346099009, 6308541)]), $toNativeArray($kindUint64, [new $Uint64(1492838903, 1938320920), new $Uint64(2932623761, 1081627501)]), $toNativeArray($kindUint64, [new $Uint64(2939790453, 1349159326), new $Uint64(3665779701, 2425776200)]), $toNativeArray($kindUint64, [new $Uint64(1837369033, 1380095491), new $Uint64(2291112313, 2052981037)]), $toNativeArray($kindUint64, [new $Uint64(3370453115, 2798861187), new $Uint64(2863890391, 3639968120)]), $toNativeArray($kindUint64, [new $Uint64(4213066394, 2424834660), new $Uint64(3579862989, 3476218326)]), $toNativeArray($kindUint64, [new $Uint64(1559424672, 2589263487), new $Uint64(2237414368, 2709507366)]), $toNativeArray($kindUint64, [new $Uint64(4096764488, 3236579358), new $Uint64(2796767960, 3386884207)]), $toNativeArray($kindUint64, [new $Uint64(4047213786, 4045724198), new $Uint64(3495959950, 4233605259)]), $toNativeArray($kindUint64, [new $Uint64(1992637704, 3602319448), new $Uint64(2184974969, 1572261463)]), $toNativeArray($kindUint64, [new $Uint64(1417055307, 207932014), new $Uint64(2731218711, 3039068653)]), $toNativeArray($kindUint64, [new $Uint64(2845060957, 3481140489), new $Uint64(3414023389, 2725093992)]), $toNativeArray($kindUint64, [new $Uint64(3556326197, 1130200140), new $Uint64(4267529237, 185142018)]), $toNativeArray($kindUint64, [new $Uint64(3296445697, 1243245999), new $Uint64(2667205773, 652584673)]), $toNativeArray($kindUint64, [new $Uint64(899331649, 2627799323), new $Uint64(3334007216, 1889472666)]), $toNativeArray($kindUint64, [new $Uint64(3271648210, 63523682), new $Uint64(4167509020, 2361840832)]), $toNativeArray($kindUint64, [new $Uint64(2044780131, 1113444125), new $Uint64(2604693137, 3623634168)]), $toNativeArray($kindUint64, [new $Uint64(2555975164, 318063332), new $Uint64(3255866422, 1308317238)]), $toNativeArray($kindUint64, [new $Uint64(1047485307, 397579165), new $Uint64(4069833027, 3782880196)]), $toNativeArray($kindUint64, [new $Uint64(2802161964, 4006583362), new $Uint64(2543645642, 1827429210)]), $toNativeArray($kindUint64, [new $Uint64(1355218808, 713261907), new $Uint64(3179557053, 136802865)]), $toNativeArray($kindUint64, [new $Uint64(2767765334, 891577384), new $Uint64(3974446316, 1244745405)]), $toNativeArray($kindUint64, [new $Uint64(2266724245, 3778461337), new $Uint64(2484028947, 2925449526)]), $toNativeArray($kindUint64, [new $Uint64(685921659, 1501851199), new $Uint64(3105036184, 2583070084)]), $toNativeArray($kindUint64, [new $Uint64(857402074, 803572175), new $Uint64(3881295230, 3228837605)]), $toNativeArray($kindUint64, [new $Uint64(1072747208, 1575974433), new $Uint64(2425809519, 944281679)]), $toNativeArray($kindUint64, [new $Uint64(267192186, 1969968041), new $Uint64(3032261899, 106610275)]), $toNativeArray($kindUint64, [new $Uint64(3555215705, 314976404), new $Uint64(3790327373, 3354488315)]), $toNativeArray($kindUint64, [new $Uint64(1685138903, 2881214812), new $Uint64(2368954608, 2633426109)]), $toNativeArray($kindUint64, [new $Uint64(3180165453, 2527776691), new $Uint64(2961193260, 3291782636)]), $toNativeArray($kindUint64, [new $Uint64(3975206816, 4233462688), new $Uint64(3701491575, 4114728295)]), $toNativeArray($kindUint64, [new $Uint64(4095116996, 2645914180), new $Uint64(2313432234, 4182317920)]), $toNativeArray($kindUint64, [new $Uint64(823928949, 3307392725), new $Uint64(2891790293, 3080413753)]), $toNativeArray($kindUint64, [new $Uint64(2103653011, 913015435), new $Uint64(3614737867, 629291719)]), $toNativeArray($kindUint64, [new $Uint64(2925395868, 33763735), new $Uint64(2259211166, 4151403708)]), $toNativeArray($kindUint64, [new $Uint64(3656744835, 42204668), new $Uint64(2824013958, 3041770987)]), $toNativeArray($kindUint64, [new $Uint64(3497189219, 3273981307), new $Uint64(3530017448, 1654730086)]), $toNativeArray($kindUint64, [new $Uint64(1112001438, 1509367405), new $Uint64(2206260905, 1034206304)]), $toNativeArray($kindUint64, [new $Uint64(1390001797, 4034192904), new $Uint64(2757826131, 2366499704)]), $toNativeArray($kindUint64, [new $Uint64(1737502247, 1821515659), new $Uint64(3447282664, 1884382806)]), $toNativeArray($kindUint64, [new $Uint64(12197080, 2749060022), new $Uint64(2154551665, 1177739254)]), $toNativeArray($kindUint64, [new $Uint64(2162729998, 3436325028), new $Uint64(2693189581, 2545915891)]), $toNativeArray($kindUint64, [new $Uint64(1629670674, 2147922637), new $Uint64(3366486976, 4256136688)]), $toNativeArray($kindUint64, [new $Uint64(2037088343, 537419649), new $Uint64(4208108721, 1025203564)]), $toNativeArray($kindUint64, [new $Uint64(3420663862, 1946500016), new $Uint64(2630067950, 3325106787)]), $toNativeArray($kindUint64, [new $Uint64(3202088004, 285641372), new $Uint64(3287584938, 2008899836)]), $toNativeArray($kindUint64, [new $Uint64(4002610005, 357051716), new $Uint64(4109481173, 363641147)]), $toNativeArray($kindUint64, [new $Uint64(1964760341, 760028234), new $Uint64(2568425733, 764146629)]), $toNativeArray($kindUint64, [new $Uint64(3529692250, 2023777117), new $Uint64(3210532166, 2028925110)]), $toNativeArray($kindUint64, [new $Uint64(2264631665, 382237748), new $Uint64(4013165208, 388672740)]), $toNativeArray($kindUint64, [new $Uint64(3562878438, 2923253152), new $Uint64(2508228255, 242920462)]), $toNativeArray($kindUint64, [new $Uint64(2306114400, 1506582793), new $Uint64(3135285318, 3524876050)]), $toNativeArray($kindUint64, [new $Uint64(735159352, 1883228491), new $Uint64(3919106648, 2258611415)]), $toNativeArray($kindUint64, [new $Uint64(2070087331, 1177017807), new $Uint64(2449441655, 1411632134)]), $toNativeArray($kindUint64, [new $Uint64(440125516, 397530434), new $Uint64(3061802069, 690798344)]), $toNativeArray($kindUint64, [new $Uint64(550156895, 496913043), new $Uint64(3827252586, 1937239754)]), $toNativeArray($kindUint64, [new $Uint64(1417589883, 1921183388), new $Uint64(2392032866, 2284516670)]), $toNativeArray($kindUint64, [new $Uint64(3919471002, 1327737411), new $Uint64(2990041083, 708162189)]), $toNativeArray($kindUint64, [new $Uint64(1678113280, 3807155412), new $Uint64(3737551353, 4106428209)]), $toNativeArray($kindUint64, [new $Uint64(3733175360, 2379472132), new $Uint64(2335969596, 955904894)]), $toNativeArray($kindUint64, [new $Uint64(2518985552, 2974340165), new $Uint64(2919961995, 1194881118)]), $toNativeArray($kindUint64, [new $Uint64(1001248292, 3717925207), new $Uint64(3649952494, 419859574)]), $toNativeArray($kindUint64, [new $Uint64(3847005655, 176219606), new $Uint64(2281220308, 3483637705)]), $toNativeArray($kindUint64, [new $Uint64(1587531596, 3441499980), new $Uint64(2851525386, 59579836)]), $toNativeArray($kindUint64, [new $Uint64(1984414496, 6907679), new $Uint64(3564406732, 2221958443)]), $toNativeArray($kindUint64, [new $Uint64(703388148, 4317299), new $Uint64(2227754207, 3536207675)]), $toNativeArray($kindUint64, [new $Uint64(4100460657, 5396624), new $Uint64(2784692759, 3346517769)]), $toNativeArray($kindUint64, [new $Uint64(1904350349, 1080487604), new $Uint64(3480865949, 3109405388)]), $toNativeArray($kindUint64, [new $Uint64(3337702616, 1212175664), new $Uint64(2175541218, 2480249279)]), $toNativeArray($kindUint64, [new $Uint64(3098386446, 1515219580), new $Uint64(2719426523, 952827951)]), $toNativeArray($kindUint64, [new $Uint64(2799241233, 4041508124), new $Uint64(3399283154, 117293115)]), $toNativeArray($kindUint64, [new $Uint64(2425309718, 1830659683), new $Uint64(4249103942, 2294100042)]), $toNativeArray($kindUint64, [new $Uint64(2589560398, 70420478), new $Uint64(2655689964, 360070702)]), $toNativeArray($kindUint64, [new $Uint64(1089466849, 2235509245), new $Uint64(3319612455, 450088378)]), $toNativeArray($kindUint64, [new $Uint64(3509317209, 3868128380), new $Uint64(4149515568, 3783835944)]), $toNativeArray($kindUint64, [new $Uint64(2193323256, 806967502), new $Uint64(2593447230, 2364897465)]), $toNativeArray($kindUint64, [new $Uint64(3815395894, 1008709377), new $Uint64(3241809038, 808638183)]), $toNativeArray($kindUint64, [new $Uint64(3695503043, 3408370369), new $Uint64(4052261297, 3158281377)]), $toNativeArray($kindUint64, [new $Uint64(699076666, 1593360569), new $Uint64(2532663311, 363313125)]), $toNativeArray($kindUint64, [new $Uint64(1947587656, 4139184359), new $Uint64(3165829138, 3675366878)]), $toNativeArray($kindUint64, [new $Uint64(287000923, 879013153), new $Uint64(3957286423, 2446724950)]), $toNativeArray($kindUint64, [new $Uint64(3400601049, 12512308), new $Uint64(2473304014, 3139815829)]), $toNativeArray($kindUint64, [new $Uint64(1029525839, 1089382210), new $Uint64(3091630018, 1777286139)]), $toNativeArray($kindUint64, [new $Uint64(213165475, 287985938), new $Uint64(3864537523, 74124026)]), $toNativeArray($kindUint64, [new $Uint64(1206970245, 3938087595), new $Uint64(2415335951, 3804423900)]), $toNativeArray($kindUint64, [new $Uint64(1508712807, 1701384022), new $Uint64(3019169939, 3681788051)]), $toNativeArray($kindUint64, [new $Uint64(812149185, 1052988204), new $Uint64(3773962424, 3528493240)]), $toNativeArray($kindUint64, [new $Uint64(507593240, 3342472187), new $Uint64(2358726515, 2205308275)]), $toNativeArray($kindUint64, [new $Uint64(3855717022, 4178090234), new $Uint64(2948408144, 1682893519)]), $toNativeArray($kindUint64, [new $Uint64(3745904454, 3075129145), new $Uint64(3685510180, 2103616899)]), $toNativeArray($kindUint64, [new $Uint64(1804319372, 848213891), new $Uint64(2303443862, 3462244210)]), $toNativeArray($kindUint64, [new $Uint64(107915567, 1060267364), new $Uint64(2879304828, 2180321615)]), $toNativeArray($kindUint64, [new $Uint64(3356119931, 251592381), new $Uint64(3599131035, 2725402018)]), $toNativeArray($kindUint64, [new $Uint64(3171316780, 3915341622), new $Uint64(2249456897, 1166505349)]), $toNativeArray($kindUint64, [new $Uint64(742920504, 599209732), new $Uint64(2811821121, 2531873511)]), $toNativeArray($kindUint64, [new $Uint64(4149876102, 749012165), new $Uint64(3514776401, 4238583712)]), $toNativeArray($kindUint64, [new $Uint64(2593672563, 3689358075), new $Uint64(2196735251, 1038502084)]), $toNativeArray($kindUint64, [new $Uint64(3242090704, 3537955770), new $Uint64(2745919064, 224385781)]), $toNativeArray($kindUint64, [new $Uint64(831387909, 127477416), new $Uint64(3432398830, 280482227)]), $toNativeArray($kindUint64, [new $Uint64(4260460358, 1233088594), new $Uint64(4290498537, 2498086431)]), $toNativeArray($kindUint64, [new $Uint64(4273400459, 3991905843), new $Uint64(2681561585, 4245658579)]), $toNativeArray($kindUint64, [new $Uint64(4268008750, 3916140480), new $Uint64(3351951982, 2085847752)]), $toNativeArray($kindUint64, [new $Uint64(1040043642, 2747691952), new $Uint64(4189939978, 459826043)]), $toNativeArray($kindUint64, [new $Uint64(113156364, 2791049294), new $Uint64(2618712486, 1361133101)]), $toNativeArray($kindUint64, [new $Uint64(1215187279, 3488811618), new $Uint64(3273390607, 3848900024)]), $toNativeArray($kindUint64, [new $Uint64(1518984099, 3287272698), new $Uint64(4091738259, 3737383206)]), $toNativeArray($kindUint64, [new $Uint64(4170590534, 1517674524), new $Uint64(2557336412, 1798993591)]), $toNativeArray($kindUint64, [new $Uint64(4139496343, 4044576803), new $Uint64(3196670515, 2248741989)]), $toNativeArray($kindUint64, [new $Uint64(1953144957, 3981979180), new $Uint64(3995838144, 1737185663)]), $toNativeArray($kindUint64, [new $Uint64(2831328334, 3025607900), new $Uint64(2497398840, 1085741039)]), $toNativeArray($kindUint64, [new $Uint64(2465418594, 1634526227), new $Uint64(3121748550, 1357176299)]), $toNativeArray($kindUint64, [new $Uint64(2008031418, 4190641431), new $Uint64(3902185687, 3843954022)]), $toNativeArray($kindUint64, [new $Uint64(181277812, 3692892718), new $Uint64(2438866054, 4013084000)]), $toNativeArray($kindUint64, [new $Uint64(226597266, 321148602), new $Uint64(3048582568, 2868871352)]), $toNativeArray($kindUint64, [new $Uint64(283246582, 2548919401), new $Uint64(3810728210, 3586089190)]), $toNativeArray($kindUint64, [new $Uint64(3398254586, 519332801), new $Uint64(2381705131, 3315047567)]), $toNativeArray($kindUint64, [new $Uint64(3174076408, 2796649650), new $Uint64(2977131414, 3070067635)]), $toNativeArray($kindUint64, [new $Uint64(2893853686, 3495812062), new $Uint64(3721414268, 1690100896)]), $toNativeArray($kindUint64, [new $Uint64(1808658554, 1111140715), new $Uint64(2325883917, 3203796708)]), $toNativeArray($kindUint64, [new $Uint64(2260823192, 3536409542), new $Uint64(2907354897, 783520413)]), $toNativeArray($kindUint64, [new $Uint64(3899770815, 125544631), new $Uint64(3634193621, 2053142340)]), $toNativeArray($kindUint64, [new $Uint64(289873111, 1689078130), new $Uint64(2271371013, 1820084875)]), $toNativeArray($kindUint64, [new $Uint64(3583566861, 1037605839), new $Uint64(2839213766, 3348847917)]), $toNativeArray($kindUint64, [new $Uint64(1258233104, 2370749123), new $Uint64(3549017208, 2038576249)]), $toNativeArray($kindUint64, [new $Uint64(3470750250, 1481718202), new $Uint64(2218135755, 1274110155)]), $toNativeArray($kindUint64, [new $Uint64(3264695988, 3999631400), new $Uint64(2772669694, 518895870)]), $toNativeArray($kindUint64, [new $Uint64(1933386338, 704571954), new $Uint64(3465837117, 2796103486)]), $toNativeArray($kindUint64, [new $Uint64(134624637, 1514099295), new $Uint64(2166148198, 2284435591)]), $toNativeArray($kindUint64, [new $Uint64(3389506268, 2966365943), new $Uint64(2707685248, 708060840)]), $toNativeArray($kindUint64, [new $Uint64(4236882835, 3707957429), new $Uint64(3384606560, 885076050)]), $toNativeArray($kindUint64, [new $Uint64(3148619896, 3561204962), new $Uint64(4230758200, 1106345063)]), $toNativeArray($kindUint64, [new $Uint64(3578500171, 2225753101), new $Uint64(2644223875, 691465664)]), $toNativeArray($kindUint64, [new $Uint64(178157918, 1708449553), new $Uint64(3305279843, 4085557553)]), $toNativeArray($kindUint64, [new $Uint64(1296439221, 4283045589), new $Uint64(4131599804, 4033205117)]), $toNativeArray($kindUint64, [new $Uint64(1347145425, 3213774405), new $Uint64(2582249878, 373269550)]), $toNativeArray($kindUint64, [new $Uint64(3831415430, 795992534), new $Uint64(3227812347, 2614070585)]), $toNativeArray($kindUint64, [new $Uint64(1568043815, 3142474316), new $Uint64(4034765434, 2193846408)]), $toNativeArray($kindUint64, [new $Uint64(980027384, 3574659183), new $Uint64(2521728396, 2444895829)]), $toNativeArray($kindUint64, [new $Uint64(2298776055, 173356683), new $Uint64(3152160495, 3056119786)]), $toNativeArray($kindUint64, [new $Uint64(725986420, 3437921326), new $Uint64(3940200619, 2746407909)]), $toNativeArray($kindUint64, [new $Uint64(990612425, 1217181), new $Uint64(2462625387, 1179634031)]), $toNativeArray($kindUint64, [new $Uint64(164523707, 1075263300), new $Uint64(3078281734, 400800715)]), $toNativeArray($kindUint64, [new $Uint64(3426880106, 270337301), new $Uint64(3847852167, 2648484541)]), $toNativeArray($kindUint64, [new $Uint64(2678670978, 1242702637), new $Uint64(2404907604, 3265915574)]), $toNativeArray($kindUint64, [new $Uint64(1200855074, 3700861945), new $Uint64(3006134505, 4082394468)]), $toNativeArray($kindUint64, [new $Uint64(1501068843, 2478593783), new $Uint64(3757668132, 1881767613)]), $toNativeArray($kindUint64, [new $Uint64(1475038939, 1012250202), new $Uint64(2348542582, 3323588406)]), $toNativeArray($kindUint64, [new $Uint64(3991282322, 191570929), new $Uint64(2935678228, 2007001859)]), $toNativeArray($kindUint64, [new $Uint64(3915361078, 2386947309), new $Uint64(3669597785, 2508752324)]), $toNativeArray($kindUint64, [new $Uint64(299617026, 418100244), new $Uint64(2293498615, 4252324763)]), $toNativeArray($kindUint64, [new $Uint64(3595746754, 2670108953), new $Uint64(2866873269, 4241664129)]), $toNativeArray($kindUint64, [new $Uint64(1273457971, 1190152543), new $Uint64(3583591587, 2080854690)]), $toNativeArray($kindUint64, [new $Uint64(1869653056, 206974427), new $Uint64(2239744742, 763663269)]), $toNativeArray($kindUint64, [new $Uint64(3410808144, 258718034), new $Uint64(2799680927, 3102062734)]), $toNativeArray($kindUint64, [new $Uint64(2116026532, 323397543), new $Uint64(3499601159, 2803836594)]), $toNativeArray($kindUint64, [new $Uint64(2396258406, 2349607112), new $Uint64(2187250724, 3363010607)]), $toNativeArray($kindUint64, [new $Uint64(1921581184, 789525242), new $Uint64(2734063405, 4203763259)]), $toNativeArray($kindUint64, [new $Uint64(1328234656, 986906553), new $Uint64(3417579257, 2033478602)]), $toNativeArray($kindUint64, [new $Uint64(3807776968, 1233633192), new $Uint64(4271974071, 3615590076)]), $toNativeArray($kindUint64, [new $Uint64(232376957, 771020745), new $Uint64(2669983794, 3870356534)]), $toNativeArray($kindUint64, [new $Uint64(2437954844, 2037517755), new $Uint64(3337479743, 2690462019)]), $toNativeArray($kindUint64, [new $Uint64(1973701731, 2546897194), new $Uint64(4171849679, 2289335700)]), $toNativeArray($kindUint64, [new $Uint64(3381047230, 1054939834), new $Uint64(2607406049, 3041447548)]), $toNativeArray($kindUint64, [new $Uint64(4226309037, 3466158440), new $Uint64(3259257562, 580583963)]), $toNativeArray($kindUint64, [new $Uint64(4209144473, 1111472579), new $Uint64(4074071952, 2873213602)]), $toNativeArray($kindUint64, [new $Uint64(3704457119, 3379024922), new $Uint64(2546294970, 1795758501)]), $toNativeArray($kindUint64, [new $Uint64(1409345927, 3150039328), new $Uint64(3182868713, 97214479)]), $toNativeArray($kindUint64, [new $Uint64(687940585, 2863807336), new $Uint64(3978585891, 1195259923)]), $toNativeArray($kindUint64, [new $Uint64(4188059250, 179266849), new $Uint64(2486616182, 210166539)]), $toNativeArray($kindUint64, [new $Uint64(4161332238, 2371567209), new $Uint64(3108270227, 2410191822)]), $toNativeArray($kindUint64, [new $Uint64(3054181650, 816975364), new $Uint64(3885337784, 1938997954)]), $toNativeArray($kindUint64, [new $Uint64(2982605355, 1584351426), new $Uint64(2428336115, 1211873721)]), $toNativeArray($kindUint64, [new $Uint64(507031222, 906697459), new $Uint64(3035420144, 441100328)]), $toNativeArray($kindUint64, [new $Uint64(633789027, 3280855472), new $Uint64(3794275180, 551375410)]), $toNativeArray($kindUint64, [new $Uint64(1469859966, 1513663758), new $Uint64(2371421987, 2492093279)]), $toNativeArray($kindUint64, [new $Uint64(763583133, 4039563345), new $Uint64(2964277484, 2041374775)]), $toNativeArray($kindUint64, [new $Uint64(4175704389, 1828228709), new $Uint64(3705346855, 2551718468)]), $toNativeArray($kindUint64, [new $Uint64(462331595, 1679513855), new $Uint64(2315841784, 3205436779)]), $toNativeArray($kindUint64, [new $Uint64(3799139966, 1025650495), new $Uint64(2894802230, 4006795973)]), $toNativeArray($kindUint64, [new $Uint64(1527699485, 3429546767), new $Uint64(3618502788, 2861011319)]), $toNativeArray($kindUint64, [new $Uint64(2565424914, 2680337641), new $Uint64(2261564242, 3935615722)]), $toNativeArray($kindUint64, [new $Uint64(1059297495, 1202938404), new $Uint64(2826955303, 2772036005)]), $toNativeArray($kindUint64, [new $Uint64(2397863693, 429931181), new $Uint64(3533694129, 2391303182)]), $toNativeArray($kindUint64, [new $Uint64(424922984, 805577900), new $Uint64(2208558830, 4178919049)]), $toNativeArray($kindUint64, [new $Uint64(1604895554, 1006972375), new $Uint64(2760698538, 3076165163)]), $toNativeArray($kindUint64, [new $Uint64(932377618, 3406199117), new $Uint64(3450873173, 1697722806)]), $toNativeArray($kindUint64, [new $Uint64(3803961483, 3202616272), new $Uint64(2156795733, 1597947665)]), $toNativeArray($kindUint64, [new $Uint64(1533726382, 2929528516), new $Uint64(2695994666, 3071176406)]), $toNativeArray($kindUint64, [new $Uint64(4064641626, 1514426997), new $Uint64(3369993333, 1691486859)]), $toNativeArray($kindUint64, [new $Uint64(4007060208, 4040517394), new $Uint64(4212491666, 3188100398)]), $toNativeArray($kindUint64, [new $Uint64(1430670806, 2525323371), new $Uint64(2632807291, 3066304573)]), $toNativeArray($kindUint64, [new $Uint64(2862080332, 1009170566), new $Uint64(3291009114, 2759138892)]), $toNativeArray($kindUint64, [new $Uint64(3577600415, 1261463208), new $Uint64(4113761393, 1301439967)]), $toNativeArray($kindUint64, [new $Uint64(3846612995, 2399027241), new $Uint64(2571100870, 3497754539)]), $toNativeArray($kindUint64, [new $Uint64(3734524420, 1925042227), new $Uint64(3213876088, 2224709526)]), $toNativeArray($kindUint64, [new $Uint64(2520671877, 2406302784), new $Uint64(4017345110, 2780886908)]), $toNativeArray($kindUint64, [new $Uint64(3722903571, 2040810152), new $Uint64(2510840694, 664312493)]), $toNativeArray($kindUint64, [new $Uint64(1432403992, 1477270866), new $Uint64(3138550867, 2977874265)]), $toNativeArray($kindUint64, [new $Uint64(2864246814, 1846588582), new $Uint64(3923188584, 2648601007)]), $toNativeArray($kindUint64, [new $Uint64(3400766995, 80376040), new $Uint64(2451992865, 1655375629)]), $toNativeArray($kindUint64, [new $Uint64(1029733271, 3321695522), new $Uint64(3064991081, 3142961361)]), $toNativeArray($kindUint64, [new $Uint64(2360908413, 3078377578), new $Uint64(3831238852, 707476229)]), $toNativeArray($kindUint64, [new $Uint64(2012438670, 2460856898), new $Uint64(2394524282, 2589656291)]), $toNativeArray($kindUint64, [new $Uint64(1441806514, 928587475), new $Uint64(2993155353, 1089586716)]), $toNativeArray($kindUint64, [new $Uint64(1802258142, 3308217992), new $Uint64(3741444191, 2435725219)]), $toNativeArray($kindUint64, [new $Uint64(589540427, 993894421), new $Uint64(2338402619, 3132940998)]), $toNativeArray($kindUint64, [new $Uint64(2884409182, 168626202), new $Uint64(2923003274, 2842434423)]), $toNativeArray($kindUint64, [new $Uint64(2531769653, 2358266401), new $Uint64(3653754093, 1405559381)]), $toNativeArray($kindUint64, [new $Uint64(2119226945, 2010787412), new $Uint64(2283596308, 1415345525)]), $toNativeArray($kindUint64, [new $Uint64(3722775505, 3587226089), new $Uint64(2854495385, 1769181906)]), $toNativeArray($kindUint64, [new $Uint64(2505985734, 1262807140), new $Uint64(3568119231, 3285219207)]), $toNativeArray($kindUint64, [new $Uint64(3176853819, 4010479934), new $Uint64(2230074519, 3663874740)]), $toNativeArray($kindUint64, [new $Uint64(3971067274, 3939358094), new $Uint64(2787593149, 3506101601)]), $toNativeArray($kindUint64, [new $Uint64(1742608621, 2776713970), new $Uint64(3484491437, 1161401530)]), $toNativeArray($kindUint64, [new $Uint64(2162872212, 2272317143), new $Uint64(2177807148, 1262746868)]), $toNativeArray($kindUint64, [new $Uint64(2703590265, 2840396429), new $Uint64(2722258935, 1578433585)]), $toNativeArray($kindUint64, [new $Uint64(158262360, 329270064), new $Uint64(3402823669, 899300158)]), $toNativeArray($kindUint64, [new $Uint64(2345311598, 411587580), new $Uint64(4253529586, 2197867021)]), $toNativeArray($kindUint64, [new $Uint64(2002690660, 3478467709), new $Uint64(2658455991, 2447408712)]), $toNativeArray($kindUint64, [new $Uint64(2503363326, 53117341), new $Uint64(3323069989, 1985519066)]), $toNativeArray($kindUint64, [new $Uint64(981720509, 2213880324), new $Uint64(4153837486, 3555640657)]), $toNativeArray($kindUint64, [new $Uint64(3297929878, 1920546114), new $Uint64(2596148429, 1148533586)]), $toNativeArray($kindUint64, [new $Uint64(1974928700, 253198995), new $Uint64(3245185536, 2509408807)]), $toNativeArray($kindUint64, [new $Uint64(1394919051, 316498744), new $Uint64(4056481920, 3136761009)]), $toNativeArray($kindUint64, [new $Uint64(3556178966, 3955908099), new $Uint64(2535301200, 1960475630)]), $toNativeArray($kindUint64, [new $Uint64(2297740060, 2797401476), new $Uint64(3169126500, 2450594538)]), $toNativeArray($kindUint64, [new $Uint64(724691427, 3496751845), new $Uint64(3961408125, 3063243173)]), $toNativeArray($kindUint64, [new $Uint64(989803054, 1648598991), new $Uint64(2475880078, 2451397895)]), $toNativeArray($kindUint64, [new $Uint64(163511993, 4208232386), new $Uint64(3094850098, 916763721)]), $toNativeArray($kindUint64, [new $Uint64(1278131816, 2039065011), new $Uint64(3868562622, 3293438299)]), $toNativeArray($kindUint64, [new $Uint64(261961473, 1274415632), new $Uint64(2417851639, 984657113)]), $toNativeArray($kindUint64, [new $Uint64(1401193665, 2666761364), new $Uint64(3022314549, 157079567)]), $toNativeArray($kindUint64, [new $Uint64(677750258, 112226233), new $Uint64(3777893186, 1270091283)]), $toNativeArray($kindUint64, [new $Uint64(4181690295, 1143883219), new $Uint64(2361183241, 1867548875)]), $toNativeArray($kindUint64, [new $Uint64(4153371045, 356112200), new $Uint64(2951479051, 3408177918)]), $toNativeArray($kindUint64, [new $Uint64(3044230158, 1518882075), new $Uint64(3689348814, 3186480574)]), $toNativeArray($kindUint64, [new $Uint64(828902024, 4170526768), new $Uint64(2305843009, 917808535)]), $toNativeArray($kindUint64, [new $Uint64(4257353003, 918191165), new $Uint64(2882303761, 2221002492)]), $toNativeArray($kindUint64, [new $Uint64(1026723958, 73997132), new $Uint64(3602879701, 3849994940)]), $toNativeArray($kindUint64, [new $Uint64(2789186121, 3267473679), new $Uint64(2251799813, 2943117749)]), $toNativeArray($kindUint64, [new $Uint64(265257180, 863116627), new $Uint64(2814749767, 457671715)]), $toNativeArray($kindUint64, [new $Uint64(3552796947, 1078895784), new $Uint64(3518437208, 3793315115)]), $toNativeArray($kindUint64, [new $Uint64(1683627180, 137438953), new $Uint64(2199023255, 2370821947)]), $toNativeArray($kindUint64, [new $Uint64(1030792151, 171798691), new $Uint64(2748779069, 1889785610)]), $toNativeArray($kindUint64, [new $Uint64(3435973836, 3435973836), new $Uint64(3435973836, 3435973836)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(2147483648, 0)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(2684354560, 0)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(3355443200, 0)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(4194304000, 0)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(2621440000, 0)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(3276800000, 0)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(4096000000, 0)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(2560000000, 0)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(3200000000, 0)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(4000000000, 0)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(2500000000, 0)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(3125000000, 0)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(3906250000, 0)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(2441406250, 0)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(3051757812, 2147483648)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(3814697265, 2684354560)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(2384185791, 67108864)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(2980232238, 3305111552)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(3725290298, 1983905792)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(2328306436, 2313682944)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(2910383045, 2892103680)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(3637978807, 393904128)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(2273736754, 1856802816)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(2842170943, 173519872)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(3552713678, 3438125312)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(2220446049, 1075086496)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(2775557561, 2417599944)]), $toNativeArray($kindUint64, [new $Uint64(0, 0), new $Uint64(3469446951, 4095741754)]), $toNativeArray($kindUint64, [new $Uint64(1073741824, 0), new $Uint64(2168404344, 4170451332)]), $toNativeArray($kindUint64, [new $Uint64(1342177280, 0), new $Uint64(2710505431, 918096869)]), $toNativeArray($kindUint64, [new $Uint64(2751463424, 0), new $Uint64(3388131789, 73879262)]), $toNativeArray($kindUint64, [new $Uint64(1291845632, 0), new $Uint64(4235164736, 1166090902)]), $toNativeArray($kindUint64, [new $Uint64(4028628992, 0), new $Uint64(2646977960, 728806813)]), $toNativeArray($kindUint64, [new $Uint64(1814560768, 0), new $Uint64(3308722450, 911008517)]), $toNativeArray($kindUint64, [new $Uint64(3341942784, 0), new $Uint64(4135903062, 3286244294)]), $toNativeArray($kindUint64, [new $Uint64(1014972416, 0), new $Uint64(2584939414, 980160860)]), $toNativeArray($kindUint64, [new $Uint64(1268715520, 0), new $Uint64(3231174267, 3372684723)]), $toNativeArray($kindUint64, [new $Uint64(512152576, 0), new $Uint64(4038967834, 3142114080)]), $toNativeArray($kindUint64, [new $Uint64(320095360, 0), new $Uint64(2524354896, 3037563124)]), $toNativeArray($kindUint64, [new $Uint64(400119200, 0), new $Uint64(3155443620, 3796953905)]), $toNativeArray($kindUint64, [new $Uint64(1573890824, 0), new $Uint64(3944304526, 451225085)]), $toNativeArray($kindUint64, [new $Uint64(1520552677, 0), new $Uint64(2465190328, 3503241150)]), $toNativeArray($kindUint64, [new $Uint64(4048174494, 1073741824), new $Uint64(3081487911, 84084141)]), $toNativeArray($kindUint64, [new $Uint64(1838992645, 3489660928), new $Uint64(3851859888, 3326330649)]), $toNativeArray($kindUint64, [new $Uint64(3833724963, 2717908992), new $Uint64(2407412430, 2078956655)]), $toNativeArray($kindUint64, [new $Uint64(3718414380, 2323644416), new $Uint64(3009265538, 451212171)]), $toNativeArray($kindUint64, [new $Uint64(3574276151, 2904555520), new $Uint64(3761581922, 2711498862)]), $toNativeArray($kindUint64, [new $Uint64(1160180770, 3425959936), new $Uint64(2350988701, 2768428613)]), $toNativeArray($kindUint64, [new $Uint64(2523967787, 2134966272), new $Uint64(2938735877, 239310294)]), $toNativeArray($kindUint64, [new $Uint64(1007476086, 1594966016), new $Uint64(3673419846, 1372879692)]), $toNativeArray($kindUint64, [new $Uint64(2777156201, 4218079232), new $Uint64(2295887403, 4079275279)]), $toNativeArray($kindUint64, [new $Uint64(2397703428, 2051373568), new $Uint64(2869859254, 4025352275)]), $toNativeArray($kindUint64, [new $Uint64(1923387461, 2564216960), new $Uint64(3587324068, 2884206696)]), $toNativeArray($kindUint64, [new $Uint64(1202117163, 2139506512), new $Uint64(2242077542, 3950112833)]), $toNativeArray($kindUint64, [new $Uint64(2576388278, 1600641316), new $Uint64(2802596928, 2790157393)]), $toNativeArray($kindUint64, [new $Uint64(4294227171, 4148285293), new $Uint64(3503246160, 3487696741)]), $toNativeArray($kindUint64, [new $Uint64(3220762894, 2055807396), new $Uint64(2189528850, 2179810463)]), $toNativeArray($kindUint64, [new $Uint64(2952211794, 422275597), new $Uint64(2736911063, 577279431)]), $toNativeArray($kindUint64, [new $Uint64(2616522918, 2675328144), new $Uint64(3421138828, 3942824761)]), $toNativeArray($kindUint64, [new $Uint64(49428176, 1196676532), new $Uint64(4276423536, 633563656)]), $toNativeArray($kindUint64, [new $Uint64(30892610, 747922832), new $Uint64(2672764710, 395977285)]), $toNativeArray($kindUint64, [new $Uint64(1112357586, 3082387189), new $Uint64(3340955887, 2642455254)]), $toNativeArray($kindUint64, [new $Uint64(3537930631, 1705500338), new $Uint64(4176194859, 2229327243)]), $toNativeArray($kindUint64, [new $Uint64(1674335732, 2676550447), new $Uint64(2610121787, 856458615)]), $toNativeArray($kindUint64, [new $Uint64(1019177841, 3345688059), new $Uint64(3262652233, 4291798741)]), $toNativeArray($kindUint64, [new $Uint64(2347714126, 960884602), new $Uint64(4078315292, 2143522954)]), $toNativeArray($kindUint64, [new $Uint64(2541063152, 3821778348), new $Uint64(2548947057, 3487185494)]), $toNativeArray($kindUint64, [new $Uint64(1028845293, 482255639), new $Uint64(3186183822, 1137756396)]), $toNativeArray($kindUint64, [new $Uint64(1286056616, 1676561373), new $Uint64(3982729777, 3569679143)]), $toNativeArray($kindUint64, [new $Uint64(2414398121, 1047850858), new $Uint64(2489206111, 620436728)]), $toNativeArray($kindUint64, [new $Uint64(3017997651, 2383555396), new $Uint64(3111507638, 3996771382)]), $toNativeArray($kindUint64, [new $Uint64(1625013416, 1905702422), new $Uint64(3889384548, 2848480580)]), $toNativeArray($kindUint64, [new $Uint64(3163117033, 1191064013), new $Uint64(2430865342, 3927784010)]), $toNativeArray($kindUint64, [new $Uint64(1806412643, 2562571841), new $Uint64(3038581678, 2762246365)]), $toNativeArray($kindUint64, [new $Uint64(3331757628, 2129472977), new $Uint64(3798227098, 1305324308)]), $toNativeArray($kindUint64, [new $Uint64(4229832165, 3478404258), new $Uint64(2373891936, 1889569516)]), $toNativeArray($kindUint64, [new $Uint64(992322911, 1126779851), new $Uint64(2967364920, 2361961896)]), $toNativeArray($kindUint64, [new $Uint64(1240403639, 334732990), new $Uint64(3709206150, 2952452370)]), $toNativeArray($kindUint64, [new $Uint64(1848994098, 1819820855), new $Uint64(2318253844, 771540907)]), $toNativeArray($kindUint64, [new $Uint64(1237500799, 127292420), new $Uint64(2897817305, 964426134)]), $toNativeArray($kindUint64, [new $Uint64(3694359646, 3380340998), new $Uint64(3622271631, 2279274491)]), $toNativeArray($kindUint64, [new $Uint64(1772103867, 1038971299), new $Uint64(2263919769, 3035159293)]), $toNativeArray($kindUint64, [new $Uint64(3288871658, 224972300), new $Uint64(2829899712, 572723644)]), $toNativeArray($kindUint64, [new $Uint64(4111089572, 2428699024), new $Uint64(3537374640, 715904555)]), $toNativeArray($kindUint64, [new $Uint64(2032560070, 3665420538), new $Uint64(2210859150, 447440347)]), $toNativeArray($kindUint64, [new $Uint64(1466958264, 2434292024), new $Uint64(2763573937, 2706784082)]), $toNativeArray($kindUint64, [new $Uint64(3981181478, 3042865030), new $Uint64(3454467422, 162254630)]), $toNativeArray($kindUint64, [new $Uint64(1414496600, 828048820), new $Uint64(2159042138, 3322634616)]), $toNativeArray($kindUint64, [new $Uint64(1768120750, 1035061025), new $Uint64(2698802673, 2005809622)]), $toNativeArray($kindUint64, [new $Uint64(62667289, 3441309929), new $Uint64(3373503341, 3581003852)]), $toNativeArray($kindUint64, [new $Uint64(78334112, 1080411939), new $Uint64(4216879177, 1255029343)]), $toNativeArray($kindUint64, [new $Uint64(1659571556, 675257462), new $Uint64(2635549485, 3468747899)]), $toNativeArray($kindUint64, [new $Uint64(1000722621, 844071828), new $Uint64(3294436857, 1114709402)]), $toNativeArray($kindUint64, [new $Uint64(3398386924, 2128831609), new $Uint64(4118046071, 2467128576)]), $toNativeArray($kindUint64, [new $Uint64(2123991827, 3478003403), new $Uint64(2573778794, 3152568096)]), $toNativeArray($kindUint64, [new $Uint64(2654989784, 3273762430), new $Uint64(3217223493, 1793226472)]), $toNativeArray($kindUint64, [new $Uint64(3318737230, 4092203038), new $Uint64(4021529366, 3315274914)]), $toNativeArray($kindUint64, [new $Uint64(3147952593, 1483885074), new $Uint64(2513455854, 998304997)]), $toNativeArray($kindUint64, [new $Uint64(713715269, 2928598167), new $Uint64(3141819817, 3395364895)]), $toNativeArray($kindUint64, [new $Uint64(4113369559, 439522237), new $Uint64(3927274772, 1022980646)]), $toNativeArray($kindUint64, [new $Uint64(1497114150, 1885314134), new $Uint64(2454546732, 2786846552)]), $toNativeArray($kindUint64, [new $Uint64(1871392688, 209159020), new $Uint64(3068183415, 3483558190)]), $toNativeArray($kindUint64, [new $Uint64(191757212, 261448775), new $Uint64(3835229269, 3280705914)]), $toNativeArray($kindUint64, [new $Uint64(1193590081, 2310889132), new $Uint64(2397018293, 2587312108)]), $toNativeArray($kindUint64, [new $Uint64(1491987601, 3962353239), new $Uint64(2996272867, 12914663)]), $toNativeArray($kindUint64, [new $Uint64(791242678, 1731716077), new $Uint64(3745341083, 3237368801)]), $toNativeArray($kindUint64, [new $Uint64(3178881234, 8580724), new $Uint64(2340838177, 1486484588)]), $toNativeArray($kindUint64, [new $Uint64(3973601542, 2158209553), new $Uint64(2926047721, 2931847559)]), $toNativeArray($kindUint64, [new $Uint64(3893260104, 550278293), new $Uint64(3657559652, 443583977)]), $toNativeArray($kindUint64, [new $Uint64(822674829, 343923933), new $Uint64(2285974782, 2424723634)]), $toNativeArray($kindUint64, [new $Uint64(3175827184, 1503646741), new $Uint64(2857468478, 883420894)]), $toNativeArray($kindUint64, [new $Uint64(1822300332, 1879558426), new $Uint64(3571835597, 3251759766)]), $toNativeArray($kindUint64, [new $Uint64(65195883, 3322207664), new $Uint64(2232397248, 2569220766)]), $toNativeArray($kindUint64, [new $Uint64(2228978502, 3079017756), new $Uint64(2790496560, 3211525957)]), $toNativeArray($kindUint64, [new $Uint64(3859964952, 1701288547), new $Uint64(3488120700, 4014407446)]), $toNativeArray($kindUint64, [new $Uint64(1338736271, 1063305342), new $Uint64(2180075438, 361521006)]), $toNativeArray($kindUint64, [new $Uint64(3820903987, 255389853), new $Uint64(2725094297, 2599384905)]), $toNativeArray($kindUint64, [new $Uint64(1554904511, 3540462789), new $Uint64(3406367872, 28005660)]), $toNativeArray($kindUint64, [new $Uint64(1943630639, 3351836662), new $Uint64(4257959840, 35007075)]), $toNativeArray($kindUint64, [new $Uint64(677898237, 3705510650), new $Uint64(2661224900, 21879422)]), $toNativeArray($kindUint64, [new $Uint64(2994856445, 1410662840), new $Uint64(3326531125, 27349277)]), $toNativeArray($kindUint64, [new $Uint64(522345084, 2837070374), new $Uint64(4158163906, 1107928421)]), $toNativeArray($kindUint64, [new $Uint64(863336589, 3920652632), new $Uint64(2598852441, 1766197087)]), $toNativeArray($kindUint64, [new $Uint64(5428913, 1679590318), new $Uint64(3248565551, 3281488183)]), $toNativeArray($kindUint64, [new $Uint64(3228011613, 3173229722), new $Uint64(4060706939, 3028118404)]), $toNativeArray($kindUint64, [new $Uint64(4164990906, 2520139488), new $Uint64(2537941837, 1355703090)]), $toNativeArray($kindUint64, [new $Uint64(3058754985, 1002690712), new $Uint64(3172427296, 2768370687)]), $toNativeArray($kindUint64, [new $Uint64(2749701907, 2327105214), new $Uint64(3965534120, 3460463359)]), $toNativeArray($kindUint64, [new $Uint64(3329176428, 917569847), new $Uint64(2478458825, 2162789599)]), $toNativeArray($kindUint64, [new $Uint64(3087728711, 1146962308), new $Uint64(3098073531, 3777228823)]), $toNativeArray($kindUint64, [new $Uint64(2785919065, 359961061), new $Uint64(3872591914, 3647794205)]), $toNativeArray($kindUint64, [new $Uint64(2278070327, 2909330223), new $Uint64(2420369946, 3353613202)]), $toNativeArray($kindUint64, [new $Uint64(700104261, 2562920955), new $Uint64(3025462433, 2044532855)]), $toNativeArray($kindUint64, [new $Uint64(4096355798, 4277393018), new $Uint64(3781828041, 3629407892)]), $toNativeArray($kindUint64, [new $Uint64(412738726, 1599628812), new $Uint64(2363642526, 657767197)]), $toNativeArray($kindUint64, [new $Uint64(1589665231, 4147019663), new $Uint64(2954553157, 2969692644)]), $toNativeArray($kindUint64, [new $Uint64(1987081539, 4110032755), new $Uint64(3693191447, 490890333)]), $toNativeArray($kindUint64, [new $Uint64(1778796874, 2031899560), new $Uint64(2308244654, 1917419194)]), $toNativeArray($kindUint64, [new $Uint64(76012445, 392390802), new $Uint64(2885305818, 249290345)]), $toNativeArray($kindUint64, [new $Uint64(1168757380, 1564230326), new $Uint64(3606632272, 2459096579)]), $toNativeArray($kindUint64, [new $Uint64(193602450, 3125127602), new $Uint64(2254145170, 1536935362)]), $toNativeArray($kindUint64, [new $Uint64(2389486711, 1758925854), new $Uint64(2817681462, 4068652850)]), $toNativeArray($kindUint64, [new $Uint64(839374741, 1124915494), new $Uint64(3522101828, 2938332415)]), $toNativeArray($kindUint64, [new $Uint64(2135221949, 1239943096), new $Uint64(2201313642, 3983941407)]), $toNativeArray($kindUint64, [new $Uint64(1595285612, 2623670694), new $Uint64(2751642053, 2832443111)]), $toNativeArray($kindUint64, [new $Uint64(920365191, 3279588367), new $Uint64(3439552567, 319328417)]), $toNativeArray($kindUint64, [new $Uint64(3259582804, 3660355465), new $Uint64(2149720354, 1810192996)]), $toNativeArray($kindUint64, [new $Uint64(4074478506, 280477036), new $Uint64(2687150443, 115257597)]), $toNativeArray($kindUint64, [new $Uint64(1871872660, 2498079943), new $Uint64(3358938053, 3365297469)]), $toNativeArray($kindUint64, [new $Uint64(3413582649, 3122599929), new $Uint64(4198672567, 985396364)]), $toNativeArray($kindUint64, [new $Uint64(4280972804, 341012219), new $Uint64(2624170354, 2226485463)]), $toNativeArray($kindUint64, [new $Uint64(4277474181, 426265274), new $Uint64(3280212943, 635623181)]), $toNativeArray($kindUint64, [new $Uint64(2125617254, 1606573417), new $Uint64(4100266178, 4015754449)]), $toNativeArray($kindUint64, [new $Uint64(4012865343, 4225333857), new $Uint64(2562666361, 3583588354)]), $toNativeArray($kindUint64, [new $Uint64(2868598031, 4207925498), new $Uint64(3203332952, 1258259971)]), $toNativeArray($kindUint64, [new $Uint64(2512005715, 4186165048), new $Uint64(4004166190, 1572824964)]), $toNativeArray($kindUint64, [new $Uint64(3717487220, 2079482243), new $Uint64(2502603868, 4204241074)]), $toNativeArray($kindUint64, [new $Uint64(2499375377, 2599352804), new $Uint64(3128254836, 960334047)]), $toNativeArray($kindUint64, [new $Uint64(2050477398, 27965533), new $Uint64(3910318545, 1200417559)]), $toNativeArray($kindUint64, [new $Uint64(2892161109, 3238703930), new $Uint64(2443949090, 3434615534)]), $toNativeArray($kindUint64, [new $Uint64(1467717739, 827154441), new $Uint64(3054936363, 2145785770)]), $toNativeArray($kindUint64, [new $Uint64(3982130821, 4255168523), new $Uint64(3818670454, 1608490388)]), $toNativeArray($kindUint64, [new $Uint64(341348115, 3196351239), new $Uint64(2386669033, 4226531965)]), $toNativeArray($kindUint64, [new $Uint64(1500426968, 2921697224), new $Uint64(2983336292, 2061939484)]), $toNativeArray($kindUint64, [new $Uint64(1875533710, 3652121531), new $Uint64(3729170365, 2577424355)]), $toNativeArray($kindUint64, [new $Uint64(635337657, 1208834132), new $Uint64(2330731478, 2147761134)]), $toNativeArray($kindUint64, [new $Uint64(2941655719, 2584784490), new $Uint64(2913414348, 537217769)]), $toNativeArray($kindUint64, [new $Uint64(455844177, 2157238788), new $Uint64(3641767935, 671522212)]), $toNativeArray($kindUint64, [new $Uint64(2432386258, 4032628802), new $Uint64(2276104959, 2030314118)]), $toNativeArray($kindUint64, [new $Uint64(892999175, 2893302355), new $Uint64(2845131199, 1464150824)]), $toNativeArray($kindUint64, [new $Uint64(1116248969, 2542886120), new $Uint64(3556413999, 756446706)]), $toNativeArray($kindUint64, [new $Uint64(1771397429, 4273658385), new $Uint64(2222758749, 2083391927)]), $toNativeArray($kindUint64, [new $Uint64(1140504963, 2120847509), new $Uint64(2778448436, 3677981733)]), $toNativeArray($kindUint64, [new $Uint64(2499373028, 1577317563), new $Uint64(3473060546, 302509870)]), $toNativeArray($kindUint64, [new $Uint64(488366318, 3133307125), new $Uint64(2170662841, 1262810493)]), $toNativeArray($kindUint64, [new $Uint64(1684199722, 1769150258), new $Uint64(2713328551, 2652254940)]), $toNativeArray($kindUint64, [new $Uint64(2105249653, 63954174), new $Uint64(3391660689, 2241576851)]), $toNativeArray($kindUint64, [new $Uint64(1557820242, 1153684542), new $Uint64(4239575861, 3875712888)]), $toNativeArray($kindUint64, [new $Uint64(973637651, 1794794663), new $Uint64(2649734913, 2959191467)]), $toNativeArray($kindUint64, [new $Uint64(143305240, 1169751504), new $Uint64(3312168642, 477763862)]), $toNativeArray($kindUint64, [new $Uint64(2326615198, 1462189381), new $Uint64(4140210802, 2744688475)]), $toNativeArray($kindUint64, [new $Uint64(917263586, 4135093835), new $Uint64(2587631751, 2789172121)]), $toNativeArray($kindUint64, [new $Uint64(2220321307, 3021383645), new $Uint64(3234539689, 2412723327)]), $toNativeArray($kindUint64, [new $Uint64(1701659810, 2702987733), new $Uint64(4043174611, 4089645983)]), $toNativeArray($kindUint64, [new $Uint64(2674150117, 2763109157), new $Uint64(2526984132, 2019157827)]), $toNativeArray($kindUint64, [new $Uint64(2268945823, 232660974), new $Uint64(3158730165, 2523947284)]), $toNativeArray($kindUint64, [new $Uint64(2836182278, 3512051690), new $Uint64(3948412706, 4228675929)]), $toNativeArray($kindUint64, [new $Uint64(162001188, 1121290482), new $Uint64(2467757941, 3716664280)]), $toNativeArray($kindUint64, [new $Uint64(202501485, 1401613103), new $Uint64(3084697427, 1424604878)]), $toNativeArray($kindUint64, [new $Uint64(2400610504, 2825758202), new $Uint64(3855871784, 707014273)]), $toNativeArray($kindUint64, [new $Uint64(4184736125, 1766098876), new $Uint64(2409919865, 441883920)]), $toNativeArray($kindUint64, [new $Uint64(935952860, 3281365420), new $Uint64(3012399831, 1626096725)]), $toNativeArray($kindUint64, [new $Uint64(2243682899, 4101706775), new $Uint64(3765499789, 958879082)]), $toNativeArray($kindUint64, [new $Uint64(2476043636, 2026695822), new $Uint64(2353437368, 1136170338)]), $toNativeArray($kindUint64, [new $Uint64(947570897, 2533369778), new $Uint64(2941796710, 1420212923)]), $toNativeArray($kindUint64, [new $Uint64(110721797, 4240454046), new $Uint64(3677245887, 3922749802)]), $toNativeArray($kindUint64, [new $Uint64(1142942947, 3187154691), new $Uint64(2298278679, 4062331362)]), $toNativeArray($kindUint64, [new $Uint64(3576162332, 2910201539), new $Uint64(2872848349, 4004172378)]), $toNativeArray($kindUint64, [new $Uint64(2322719267, 3637751924), new $Uint64(3591060437, 1783990001)]), $toNativeArray($kindUint64, [new $Uint64(4136054102, 1736724041), new $Uint64(2244412773, 1651864662)]), $toNativeArray($kindUint64, [new $Uint64(3022583980, 23421403), new $Uint64(2805515966, 3138572652)]), $toNativeArray($kindUint64, [new $Uint64(3778229975, 29276754), new $Uint64(3506894958, 1775732167)]), $toNativeArray($kindUint64, [new $Uint64(3972006470, 1628910707), new $Uint64(2191809349, 36090780)]), $toNativeArray($kindUint64, [new $Uint64(670040791, 4183622032), new $Uint64(2739761686, 1118855300)]), $toNativeArray($kindUint64, [new $Uint64(837550989, 4155785716), new $Uint64(3424702107, 3546052773)]), $toNativeArray($kindUint64, [new $Uint64(2120680561, 1973506673), new $Uint64(4280877634, 3358824142)]), $toNativeArray($kindUint64, [new $Uint64(251683526, 3917796230), new $Uint64(2675548521, 3173006913)]), $toNativeArray($kindUint64, [new $Uint64(1388346232, 2749761640), new $Uint64(3344435652, 745033169)]), $toNativeArray($kindUint64, [new $Uint64(2809174614, 3437202050), new $Uint64(4180544565, 931291461)]), $toNativeArray($kindUint64, [new $Uint64(2292605046, 1074509457), new $Uint64(2612840353, 1118928075)]), $toNativeArray($kindUint64, [new $Uint64(1792014483, 3490620469), new $Uint64(3266050441, 2472401918)]), $toNativeArray($kindUint64, [new $Uint64(92534456, 3289533763), new $Uint64(4082563051, 4164244222)]), $toNativeArray($kindUint64, [new $Uint64(3279059507, 2055958602), new $Uint64(2551601907, 2065781726)]), $toNativeArray($kindUint64, [new $Uint64(1951340736, 1496206428), new $Uint64(3189502384, 1508485334)]), $toNativeArray($kindUint64, [new $Uint64(291692272, 1870258035), new $Uint64(3986877980, 1885606668)]), $toNativeArray($kindUint64, [new $Uint64(2329791318, 1168911272), new $Uint64(2491798737, 3325987815)]), $toNativeArray($kindUint64, [new $Uint64(1838497323, 3608622738), new $Uint64(3114748422, 936259297)]), $toNativeArray($kindUint64, [new $Uint64(3371863478, 3437036599), new $Uint64(3893435527, 3317807769)]), $toNativeArray($kindUint64, [new $Uint64(496801938, 1074406050), new $Uint64(2433397204, 3684242592)]), $toNativeArray($kindUint64, [new $Uint64(621002422, 3490491211), new $Uint64(3041746506, 310335944)]), $toNativeArray($kindUint64, [new $Uint64(776253028, 2215630365), new $Uint64(3802183132, 2535403578)]), $toNativeArray($kindUint64, [new $Uint64(1558899966, 3532252626), new $Uint64(2376364457, 3732110884)]), $toNativeArray($kindUint64, [new $Uint64(1948624958, 2267832135), new $Uint64(2970455572, 1443913133)]), $toNativeArray($kindUint64, [new $Uint64(3509523022, 687306521), new $Uint64(3713069465, 1804891416)]), $toNativeArray($kindUint64, [new $Uint64(2193451888, 3650792047), new $Uint64(2320668415, 3812411695)]), $toNativeArray($kindUint64, [new $Uint64(1668073037, 268522763), new $Uint64(2900835519, 3691772795)]), $toNativeArray($kindUint64, [new $Uint64(1011349472, 1409395278), new $Uint64(3626044399, 3540974170)]), $toNativeArray($kindUint64, [new $Uint64(1705835244, 880872049), new $Uint64(2266277749, 3823721592)]), $toNativeArray($kindUint64, [new $Uint64(2132294055, 1101090061), new $Uint64(2832847187, 1558426518)]), $toNativeArray($kindUint64, [new $Uint64(517883921, 302620752), new $Uint64(3541058984, 874291324)]), $toNativeArray($kindUint64, [new $Uint64(2471161098, 2873492530), new $Uint64(2213161865, 546432077)]), $toNativeArray($kindUint64, [new $Uint64(4162693197, 1444382015), new $Uint64(2766452331, 1756781920)]), $toNativeArray($kindUint64, [new $Uint64(908399200, 2879219342), new $Uint64(3458065414, 1122235577)]), $toNativeArray($kindUint64, [new $Uint64(3252104060, 1799512089), new $Uint64(2161290883, 3922622707)]), $toNativeArray($kindUint64, [new $Uint64(2991388251, 2249390111), new $Uint64(2701613604, 3829536560)]), $toNativeArray($kindUint64, [new $Uint64(3739235314, 1737995815), new $Uint64(3377017006, 491953404)]), $toNativeArray($kindUint64, [new $Uint64(379076847, 25011121), new $Uint64(4221271257, 2762425404)]), $toNativeArray($kindUint64, [new $Uint64(2384406677, 1626244686), new $Uint64(2638294536, 115903141)]), $toNativeArray($kindUint64, [new $Uint64(4054250170, 3106547682), new $Uint64(3297868170, 144878926)]), $toNativeArray($kindUint64, [new $Uint64(2920329065, 1735700955), new $Uint64(4122335212, 2328582306)]), $toNativeArray($kindUint64, [new $Uint64(2898947489, 3769167657), new $Uint64(2576459507, 3602847589)]), $toNativeArray($kindUint64, [new $Uint64(402458890, 1490234099), new $Uint64(3220574384, 3429817663)]), $toNativeArray($kindUint64, [new $Uint64(3724299084, 4010276272), new $Uint64(4025717980, 4287272078)]), $toNativeArray($kindUint64, [new $Uint64(1253945104, 358939022), new $Uint64(2516073738, 532061401)]), $toNativeArray($kindUint64, [new $Uint64(2641173204, 448673777), new $Uint64(3145092172, 2812560399)]), $toNativeArray($kindUint64, [new $Uint64(2227724681, 560842221), new $Uint64(3931365215, 3515700499)]), $toNativeArray($kindUint64, [new $Uint64(855457013, 3034880948), new $Uint64(2457103259, 3807925548)]), $toNativeArray($kindUint64, [new $Uint64(1069321267, 572375713), new $Uint64(3071379074, 3686165111)]), $toNativeArray($kindUint64, [new $Uint64(262909759, 3936695114), new $Uint64(3839223843, 2460222741)]), $toNativeArray($kindUint64, [new $Uint64(701189511, 4071047182), new $Uint64(2399514902, 1000768301)]), $toNativeArray($kindUint64, [new $Uint64(1950228713, 4015067154), new $Uint64(2999393627, 3398444024)]), $toNativeArray($kindUint64, [new $Uint64(2437785892, 1797608470), new $Uint64(3749242034, 3174313206)]), $toNativeArray($kindUint64, [new $Uint64(449874358, 3270988942), new $Uint64(2343276271, 3057687578)]), $toNativeArray($kindUint64, [new $Uint64(2709826596, 1941252529), new $Uint64(2929095339, 2748367648)]), $toNativeArray($kindUint64, [new $Uint64(3387283245, 2426565662), new $Uint64(3661369174, 2361717736)]), $toNativeArray($kindUint64, [new $Uint64(2117052028, 2053474450), new $Uint64(2288355734, 402331761)]), $toNativeArray($kindUint64, [new $Uint64(3720056859, 2566843063), new $Uint64(2860444667, 2650398349)]), $toNativeArray($kindUint64, [new $Uint64(1428845602, 2134812005), new $Uint64(3575555834, 2239256113)]), $toNativeArray($kindUint64, [new $Uint64(3577383061, 2407999327), new $Uint64(2234722396, 2473276894)]), $toNativeArray($kindUint64, [new $Uint64(2324245178, 4083740983), new $Uint64(2793402995, 3091596118)]), $toNativeArray($kindUint64, [new $Uint64(757822825, 2957192581), new $Uint64(3491753744, 2790753324)]), $toNativeArray($kindUint64, [new $Uint64(2621122914, 237632627), new $Uint64(2182346090, 1744220827)]), $toNativeArray($kindUint64, [new $Uint64(2202661818, 2444524431), new $Uint64(2727932613, 32792386)]), $toNativeArray($kindUint64, [new $Uint64(605843625, 908171891), new $Uint64(3409915766, 1114732307)]), $toNativeArray($kindUint64, [new $Uint64(3978530003, 2208956688), new $Uint64(4262394707, 3540899031)]), $toNativeArray($kindUint64, [new $Uint64(4097193988, 843727018), new $Uint64(2663996692, 1676190982)]), $toNativeArray($kindUint64, [new $Uint64(2974008837, 1054658773), new $Uint64(3329995865, 2095238728)]), $toNativeArray($kindUint64, [new $Uint64(3717511046, 2392065290), new $Uint64(4162494831, 3692790234)]), $toNativeArray($kindUint64, [new $Uint64(3397186228, 421298982), new $Uint64(2601559269, 3918606632)]), $toNativeArray($kindUint64, [new $Uint64(4246482785, 526623728), new $Uint64(3251949087, 1677032818)]), $toNativeArray($kindUint64, [new $Uint64(3160619833, 1732021484), new $Uint64(4064936359, 1022549199)]), $toNativeArray($kindUint64, [new $Uint64(3586000131, 3766867987), new $Uint64(2540585224, 2249705985)]), $toNativeArray($kindUint64, [new $Uint64(1261274692, 3634843160), new $Uint64(3175731530, 2812132482)]), $toNativeArray($kindUint64, [new $Uint64(3724077014, 248586654), new $Uint64(3969664413, 1367681954)]), $toNativeArray($kindUint64, [new $Uint64(3401289957, 3376592131), new $Uint64(2481040258, 1391672133)]), $toNativeArray($kindUint64, [new $Uint64(1030386975, 999514691), new $Uint64(3101300322, 3887073815)]), $toNativeArray($kindUint64, [new $Uint64(214241895, 175651540), new $Uint64(3876625403, 2711358621)]), $toNativeArray($kindUint64, [new $Uint64(670772096, 1720394949), new $Uint64(2422890877, 1157728226)]), $toNativeArray($kindUint64, [new $Uint64(2985948768, 2150493686), new $Uint64(3028613596, 2520902106)]), $toNativeArray($kindUint64, [new $Uint64(1584952312, 2688117107), new $Uint64(3785766995, 3151127633)]), $toNativeArray($kindUint64, [new $Uint64(3674949755, 1680073192), new $Uint64(2366104372, 1432583858)]), $toNativeArray($kindUint64, [new $Uint64(2446203546, 1026349666), new $Uint64(2957630465, 1790729823)]), $toNativeArray($kindUint64, [new $Uint64(1984012608, 3430420731), new $Uint64(3697038081, 3312154103)]), $toNativeArray($kindUint64, [new $Uint64(2850620616, 2144012957), new $Uint64(2310648801, 459483578)]), $toNativeArray($kindUint64, [new $Uint64(1415792122, 2680016196), new $Uint64(2888311001, 1648096297)]), $toNativeArray($kindUint64, [new $Uint64(2843481977, 1202536597), new $Uint64(3610388751, 3133862195)]), $toNativeArray($kindUint64, [new $Uint64(1240305323, 3435939933), new $Uint64(2256492969, 3569276608)]), $toNativeArray($kindUint64, [new $Uint64(1550381654, 3221183092), new $Uint64(2820616212, 1240370288)]), $toNativeArray($kindUint64, [new $Uint64(1937977068, 1878995217), new $Uint64(3525770265, 1550462860)]), $toNativeArray($kindUint64, [new $Uint64(3358719315, 3321855659), new $Uint64(2203606415, 3653393847)]), $toNativeArray($kindUint64, [new $Uint64(3124657320, 3078577749), new $Uint64(2754508019, 3493000485)]), $toNativeArray($kindUint64, [new $Uint64(684596178, 3848222187), new $Uint64(3443135024, 3292508783)]), $toNativeArray($kindUint64, [new $Uint64(2038485347, 3478880691), new $Uint64(2151959390, 2057817989)]), $toNativeArray($kindUint64, [new $Uint64(3621848508, 3274859039), new $Uint64(2689949238, 424788838)]), $toNativeArray($kindUint64, [new $Uint64(2379826987, 4093573799), new $Uint64(3362436547, 2678469696)]), $toNativeArray($kindUint64, [new $Uint64(2974783734, 4043225425), new $Uint64(4203045684, 2274345296)]), $toNativeArray($kindUint64, [new $Uint64(1859239834, 1453274067), new $Uint64(2626903552, 3568949458)]), $toNativeArray($kindUint64, [new $Uint64(176566144, 3964076232), new $Uint64(3283629441, 166219527)]), $toNativeArray($kindUint64, [new $Uint64(3441933153, 660127994), new $Uint64(4104536801, 1281516232)]), $toNativeArray($kindUint64, [new $Uint64(2151208220, 3096934556), new $Uint64(2565335500, 3485302205)]), $toNativeArray($kindUint64, [new $Uint64(3762752099, 3871168195), new $Uint64(3206669376, 61660460)]), $toNativeArray($kindUint64, [new $Uint64(408472828, 3765218420), new $Uint64(4008336720, 77075576)]), $toNativeArray($kindUint64, [new $Uint64(255295518, 205777864), new $Uint64(2505210450, 48172235)]), $toNativeArray($kindUint64, [new $Uint64(3540344869, 2404705978), new $Uint64(3131513062, 2207698941)]), $toNativeArray($kindUint64, [new $Uint64(1204205614, 4079624297), new $Uint64(3914391328, 612140029)]), $toNativeArray($kindUint64, [new $Uint64(1289499421, 1476023361), new $Uint64(2446494580, 382587518)]), $toNativeArray($kindUint64, [new $Uint64(3759357924, 2918771026), new $Uint64(3058118225, 478234397)]), $toNativeArray($kindUint64, [new $Uint64(1477971933, 3648463782), new $Uint64(3822647781, 1671534821)]), $toNativeArray($kindUint64, [new $Uint64(1460603370, 2817160776), new $Uint64(2389154863, 1581580175)]), $toNativeArray($kindUint64, [new $Uint64(752012389, 1373967322), new $Uint64(2986443579, 903233395)]), $toNativeArray($kindUint64, [new $Uint64(4161240958, 2791200977), new $Uint64(3733054474, 55299919)]), $toNativeArray($kindUint64, [new $Uint64(4211388335, 670758786), new $Uint64(2333159046, 1108304273)]), $toNativeArray($kindUint64, [new $Uint64(2043009946, 4059673955), new $Uint64(2916448807, 3532863990)]), $toNativeArray($kindUint64, [new $Uint64(406278785, 2927108796), new $Uint64(3645561009, 3342338164)]), $toNativeArray($kindUint64, [new $Uint64(2401407889, 218830261), new $Uint64(2278475631, 478348616)]), $toNativeArray($kindUint64, [new $Uint64(3001759861, 1347279650), new $Uint64(2848094538, 3819161242)]), $toNativeArray($kindUint64, [new $Uint64(1604716178, 2757841387), new $Uint64(3560118173, 2626467905)]), $toNativeArray($kindUint64, [new $Uint64(3687302171, 2797392691), new $Uint64(2225073858, 2178413352)]), $toNativeArray($kindUint64, [new $Uint64(314160418, 2422999040), new $Uint64(2781342323, 575533043)]), $toNativeArray($kindUint64, [new $Uint64(3613925995, 881265152), new $Uint64(3476677903, 3940641775)]), $toNativeArray($kindUint64, [new $Uint64(3869316483, 13919808), new $Uint64(2172923689, 4073513845)]), $toNativeArray($kindUint64, [new $Uint64(1615420131, 3238625232), new $Uint64(2716154612, 1870666835)]), $toNativeArray($kindUint64, [new $Uint64(945533340, 2974539716), new $Uint64(3395193265, 2338333544)]), $toNativeArray($kindUint64, [new $Uint64(1181916675, 3718174645), new $Uint64(4243991581, 3996658754)]), $toNativeArray($kindUint64, [new $Uint64(1812439746, 1786988241), new $Uint64(2652494738, 3034782633)]), $toNativeArray($kindUint64, [new $Uint64(3339291507, 86251653), new $Uint64(3315618423, 1645994643)]), $toNativeArray($kindUint64, [new $Uint64(3100372559, 3329040039), new $Uint64(4144523029, 983751480)]), $toNativeArray($kindUint64, [new $Uint64(1937732849, 3691262760), new $Uint64(2590326893, 1151715587)]), $toNativeArray($kindUint64, [new $Uint64(1348424238, 1392852978), new $Uint64(3237908616, 2513386308)]), $toNativeArray($kindUint64, [new $Uint64(1685530297, 3888549871), new $Uint64(4047385770, 3141732885)]), $toNativeArray($kindUint64, [new $Uint64(1590327348, 819730933), new $Uint64(2529616106, 3037324877)]), $toNativeArray($kindUint64, [new $Uint64(3061651009, 1024663666), new $Uint64(3162020133, 1649172448)]), $toNativeArray($kindUint64, [new $Uint64(3827063761, 2354571407), new $Uint64(3952525166, 3135207384)]), $toNativeArray($kindUint64, [new $Uint64(2391914850, 4155961689), new $Uint64(2470328229, 885762791)]), $toNativeArray($kindUint64, [new $Uint64(1916151739, 3047468464), new $Uint64(3087910286, 2180945313)]), $toNativeArray($kindUint64, [new $Uint64(3468931498, 2735593756), new $Uint64(3859887858, 578697993)]), $toNativeArray($kindUint64, [new $Uint64(557469450, 2783487921), new $Uint64(2412429911, 1435428070)]), $toNativeArray($kindUint64, [new $Uint64(2844320461, 1331876253), new $Uint64(3015537389, 720543263)]), $toNativeArray($kindUint64, [new $Uint64(2481658752, 2738587141), new $Uint64(3769421736, 1974420903)]), $toNativeArray($kindUint64, [new $Uint64(3161649456, 1711616963), new $Uint64(2355888585, 1234013064)]), $toNativeArray($kindUint64, [new $Uint64(3952061820, 2139521204), new $Uint64(2944860731, 2616258154)]), $toNativeArray($kindUint64, [new $Uint64(2792593627, 2674401505), new $Uint64(3681075914, 2196580869)]), $toNativeArray($kindUint64, [new $Uint64(2282241929, 1134630028), new $Uint64(2300672446, 2446604867)]), $toNativeArray($kindUint64, [new $Uint64(1779060587, 2492029360), new $Uint64(2875840558, 910772436)]), $toNativeArray($kindUint64, [new $Uint64(2223825734, 2041294876), new $Uint64(3594800697, 3285949193)]), $toNativeArray($kindUint64, [new $Uint64(4074245644, 202067473), new $Uint64(2246750436, 443105509)]), $toNativeArray($kindUint64, [new $Uint64(1871581583, 252584341), new $Uint64(2808438045, 553881887)]), $toNativeArray($kindUint64, [new $Uint64(1265735154, 3536955899), new $Uint64(3510547556, 1766094183)])]);
		powersOfTen = $toNativeArray($kindStruct, [new extFloat.ptr(new $Uint64(4203730336, 136053384), -1220, false), new extFloat.ptr(new $Uint64(3132023167, 2722021238), -1193, false), new extFloat.ptr(new $Uint64(2333539104, 810921078), -1166, false), new extFloat.ptr(new $Uint64(3477244234, 1573795306), -1140, false), new extFloat.ptr(new $Uint64(2590748842, 1432697645), -1113, false), new extFloat.ptr(new $Uint64(3860516611, 1025131999), -1087, false), new extFloat.ptr(new $Uint64(2876309015, 3348809418), -1060, false), new extFloat.ptr(new $Uint64(4286034428, 3200048207), -1034, false), new extFloat.ptr(new $Uint64(3193344495, 1097586188), -1007, false), new extFloat.ptr(new $Uint64(2379227053, 2424306748), -980, false), new extFloat.ptr(new $Uint64(3545324584, 827693699), -954, false), new extFloat.ptr(new $Uint64(2641472655, 2913388981), -927, false), new extFloat.ptr(new $Uint64(3936100983, 602835915), -901, false), new extFloat.ptr(new $Uint64(2932623761, 1081627501), -874, false), new extFloat.ptr(new $Uint64(2184974969, 1572261463), -847, false), new extFloat.ptr(new $Uint64(3255866422, 1308317239), -821, false), new extFloat.ptr(new $Uint64(2425809519, 944281679), -794, false), new extFloat.ptr(new $Uint64(3614737867, 629291719), -768, false), new extFloat.ptr(new $Uint64(2693189581, 2545915892), -741, false), new extFloat.ptr(new $Uint64(4013165208, 388672741), -715, false), new extFloat.ptr(new $Uint64(2990041083, 708162190), -688, false), new extFloat.ptr(new $Uint64(2227754207, 3536207675), -661, false), new extFloat.ptr(new $Uint64(3319612455, 450088378), -635, false), new extFloat.ptr(new $Uint64(2473304014, 3139815830), -608, false), new extFloat.ptr(new $Uint64(3685510180, 2103616900), -582, false), new extFloat.ptr(new $Uint64(2745919064, 224385782), -555, false), new extFloat.ptr(new $Uint64(4091738259, 3737383206), -529, false), new extFloat.ptr(new $Uint64(3048582568, 2868871352), -502, false), new extFloat.ptr(new $Uint64(2271371013, 1820084875), -475, false), new extFloat.ptr(new $Uint64(3384606560, 885076051), -449, false), new extFloat.ptr(new $Uint64(2521728396, 2444895829), -422, false), new extFloat.ptr(new $Uint64(3757668132, 1881767613), -396, false), new extFloat.ptr(new $Uint64(2799680927, 3102062735), -369, false), new extFloat.ptr(new $Uint64(4171849679, 2289335700), -343, false), new extFloat.ptr(new $Uint64(3108270227, 2410191823), -316, false), new extFloat.ptr(new $Uint64(2315841784, 3205436779), -289, false), new extFloat.ptr(new $Uint64(3450873173, 1697722806), -263, false), new extFloat.ptr(new $Uint64(2571100870, 3497754540), -236, false), new extFloat.ptr(new $Uint64(3831238852, 707476230), -210, false), new extFloat.ptr(new $Uint64(2854495385, 1769181907), -183, false), new extFloat.ptr(new $Uint64(4253529586, 2197867022), -157, false), new extFloat.ptr(new $Uint64(3169126500, 2450594539), -130, false), new extFloat.ptr(new $Uint64(2361183241, 1867548876), -103, false), new extFloat.ptr(new $Uint64(3518437208, 3793315116), -77, false), new extFloat.ptr(new $Uint64(2621440000, 0), -50, false), new extFloat.ptr(new $Uint64(3906250000, 0), -24, false), new extFloat.ptr(new $Uint64(2910383045, 2892103680), 3, false), new extFloat.ptr(new $Uint64(2168404344, 4170451332), 30, false), new extFloat.ptr(new $Uint64(3231174267, 3372684723), 56, false), new extFloat.ptr(new $Uint64(2407412430, 2078956656), 83, false), new extFloat.ptr(new $Uint64(3587324068, 2884206696), 109, false), new extFloat.ptr(new $Uint64(2672764710, 395977285), 136, false), new extFloat.ptr(new $Uint64(3982729777, 3569679143), 162, false), new extFloat.ptr(new $Uint64(2967364920, 2361961896), 189, false), new extFloat.ptr(new $Uint64(2210859150, 447440347), 216, false), new extFloat.ptr(new $Uint64(3294436857, 1114709402), 242, false), new extFloat.ptr(new $Uint64(2454546732, 2786846552), 269, false), new extFloat.ptr(new $Uint64(3657559652, 443583978), 295, false), new extFloat.ptr(new $Uint64(2725094297, 2599384906), 322, false), new extFloat.ptr(new $Uint64(4060706939, 3028118405), 348, false), new extFloat.ptr(new $Uint64(3025462433, 2044532855), 375, false), new extFloat.ptr(new $Uint64(2254145170, 1536935362), 402, false), new extFloat.ptr(new $Uint64(3358938053, 3365297469), 428, false), new extFloat.ptr(new $Uint64(2502603868, 4204241075), 455, false), new extFloat.ptr(new $Uint64(3729170365, 2577424355), 481, false), new extFloat.ptr(new $Uint64(2778448436, 3677981733), 508, false), new extFloat.ptr(new $Uint64(4140210802, 2744688476), 534, false), new extFloat.ptr(new $Uint64(3084697427, 1424604878), 561, false), new extFloat.ptr(new $Uint64(2298278679, 4062331362), 588, false), new extFloat.ptr(new $Uint64(3424702107, 3546052773), 614, false), new extFloat.ptr(new $Uint64(2551601907, 2065781727), 641, false), new extFloat.ptr(new $Uint64(3802183132, 2535403578), 667, false), new extFloat.ptr(new $Uint64(2832847187, 1558426518), 694, false), new extFloat.ptr(new $Uint64(4221271257, 2762425404), 720, false), new extFloat.ptr(new $Uint64(3145092172, 2812560400), 747, false), new extFloat.ptr(new $Uint64(2343276271, 3057687578), 774, false), new extFloat.ptr(new $Uint64(3491753744, 2790753324), 800, false), new extFloat.ptr(new $Uint64(2601559269, 3918606633), 827, false), new extFloat.ptr(new $Uint64(3876625403, 2711358621), 853, false), new extFloat.ptr(new $Uint64(2888311001, 1648096297), 880, false), new extFloat.ptr(new $Uint64(2151959390, 2057817989), 907, false), new extFloat.ptr(new $Uint64(3206669376, 61660461), 933, false), new extFloat.ptr(new $Uint64(2389154863, 1581580175), 960, false), new extFloat.ptr(new $Uint64(3560118173, 2626467905), 986, false), new extFloat.ptr(new $Uint64(2652494738, 3034782633), 1013, false), new extFloat.ptr(new $Uint64(3952525166, 3135207385), 1039, false), new extFloat.ptr(new $Uint64(2944860731, 2616258155), 1066, false)]);
		uint64pow10 = $toNativeArray($kindUint64, [new $Uint64(0, 1), new $Uint64(0, 10), new $Uint64(0, 100), new $Uint64(0, 1000), new $Uint64(0, 10000), new $Uint64(0, 100000), new $Uint64(0, 1000000), new $Uint64(0, 10000000), new $Uint64(0, 100000000), new $Uint64(0, 1000000000), new $Uint64(2, 1410065408), new $Uint64(23, 1215752192), new $Uint64(232, 3567587328), new $Uint64(2328, 1316134912), new $Uint64(23283, 276447232), new $Uint64(232830, 2764472320), new $Uint64(2328306, 1874919424), new $Uint64(23283064, 1569325056), new $Uint64(232830643, 2808348672), new $Uint64(2328306436, 2313682944)]);
		float32info = new floatInfo.ptr(23, 8, -127);
		float64info = new floatInfo.ptr(52, 11, -1023);
		isPrint16 = new sliceType$4([32, 126, 161, 887, 890, 895, 900, 1366, 1369, 1418, 1421, 1479, 1488, 1514, 1519, 1524, 1542, 1563, 1566, 1805, 1808, 1866, 1869, 1969, 1984, 2042, 2045, 2093, 2096, 2139, 2142, 2154, 2208, 2247, 2259, 2444, 2447, 2448, 2451, 2482, 2486, 2489, 2492, 2500, 2503, 2504, 2507, 2510, 2519, 2519, 2524, 2531, 2534, 2558, 2561, 2570, 2575, 2576, 2579, 2617, 2620, 2626, 2631, 2632, 2635, 2637, 2641, 2641, 2649, 2654, 2662, 2678, 2689, 2745, 2748, 2765, 2768, 2768, 2784, 2787, 2790, 2801, 2809, 2828, 2831, 2832, 2835, 2873, 2876, 2884, 2887, 2888, 2891, 2893, 2901, 2903, 2908, 2915, 2918, 2935, 2946, 2954, 2958, 2965, 2969, 2975, 2979, 2980, 2984, 2986, 2990, 3001, 3006, 3010, 3014, 3021, 3024, 3024, 3031, 3031, 3046, 3066, 3072, 3129, 3133, 3149, 3157, 3162, 3168, 3171, 3174, 3183, 3191, 3257, 3260, 3277, 3285, 3286, 3294, 3299, 3302, 3314, 3328, 3407, 3412, 3427, 3430, 3478, 3482, 3517, 3520, 3526, 3530, 3530, 3535, 3551, 3558, 3567, 3570, 3572, 3585, 3642, 3647, 3675, 3713, 3773, 3776, 3789, 3792, 3801, 3804, 3807, 3840, 3948, 3953, 4058, 4096, 4295, 4301, 4301, 4304, 4685, 4688, 4701, 4704, 4749, 4752, 4789, 4792, 4805, 4808, 4885, 4888, 4954, 4957, 4988, 4992, 5017, 5024, 5109, 5112, 5117, 5120, 5788, 5792, 5880, 5888, 5908, 5920, 5942, 5952, 5971, 5984, 6003, 6016, 6109, 6112, 6121, 6128, 6137, 6144, 6157, 6160, 6169, 6176, 6264, 6272, 6314, 6320, 6389, 6400, 6443, 6448, 6459, 6464, 6464, 6468, 6509, 6512, 6516, 6528, 6571, 6576, 6601, 6608, 6618, 6622, 6683, 6686, 6780, 6783, 6793, 6800, 6809, 6816, 6829, 6832, 6848, 6912, 6987, 6992, 7036, 7040, 7155, 7164, 7223, 7227, 7241, 7245, 7304, 7312, 7354, 7357, 7367, 7376, 7418, 7424, 7957, 7960, 7965, 7968, 8005, 8008, 8013, 8016, 8061, 8064, 8147, 8150, 8175, 8178, 8190, 8208, 8231, 8240, 8286, 8304, 8305, 8308, 8348, 8352, 8383, 8400, 8432, 8448, 8587, 8592, 9254, 9280, 9290, 9312, 11123, 11126, 11507, 11513, 11559, 11565, 11565, 11568, 11623, 11631, 11632, 11647, 11670, 11680, 11858, 11904, 12019, 12032, 12245, 12272, 12283, 12289, 12438, 12441, 12543, 12549, 12771, 12784, 40956, 40960, 42124, 42128, 42182, 42192, 42539, 42560, 42743, 42752, 42943, 42946, 42954, 42997, 43052, 43056, 43065, 43072, 43127, 43136, 43205, 43214, 43225, 43232, 43347, 43359, 43388, 43392, 43481, 43486, 43574, 43584, 43597, 43600, 43609, 43612, 43714, 43739, 43766, 43777, 43782, 43785, 43790, 43793, 43798, 43808, 43883, 43888, 44013, 44016, 44025, 44032, 55203, 55216, 55238, 55243, 55291, 63744, 64109, 64112, 64217, 64256, 64262, 64275, 64279, 64285, 64449, 64467, 64831, 64848, 64911, 64914, 64967, 65008, 65021, 65024, 65049, 65056, 65131, 65136, 65276, 65281, 65470, 65474, 65479, 65482, 65487, 65490, 65495, 65498, 65500, 65504, 65518, 65532, 65533]);
		isNotPrint16 = new sliceType$4([173, 907, 909, 930, 1328, 1424, 1757, 2111, 2143, 2229, 2274, 2436, 2473, 2481, 2526, 2564, 2601, 2609, 2612, 2615, 2621, 2653, 2692, 2702, 2706, 2729, 2737, 2740, 2758, 2762, 2816, 2820, 2857, 2865, 2868, 2910, 2948, 2961, 2971, 2973, 3017, 3085, 3089, 3113, 3141, 3145, 3159, 3213, 3217, 3241, 3252, 3269, 3273, 3295, 3312, 3341, 3345, 3397, 3401, 3456, 3460, 3506, 3516, 3541, 3543, 3715, 3717, 3723, 3748, 3750, 3781, 3783, 3912, 3992, 4029, 4045, 4294, 4681, 4695, 4697, 4745, 4785, 4799, 4801, 4823, 4881, 5760, 5901, 5997, 6001, 6431, 6751, 7674, 8024, 8026, 8028, 8030, 8117, 8133, 8156, 8181, 8335, 11158, 11311, 11359, 11558, 11687, 11695, 11703, 11711, 11719, 11727, 11735, 11743, 11930, 12352, 12592, 12687, 12831, 43470, 43519, 43815, 43823, 64311, 64317, 64319, 64322, 64325, 65107, 65127, 65141, 65511]);
		isPrint32 = new sliceType$5([65536, 65613, 65616, 65629, 65664, 65786, 65792, 65794, 65799, 65843, 65847, 65948, 65952, 65952, 66000, 66045, 66176, 66204, 66208, 66256, 66272, 66299, 66304, 66339, 66349, 66378, 66384, 66426, 66432, 66499, 66504, 66517, 66560, 66717, 66720, 66729, 66736, 66771, 66776, 66811, 66816, 66855, 66864, 66915, 66927, 66927, 67072, 67382, 67392, 67413, 67424, 67431, 67584, 67589, 67592, 67640, 67644, 67644, 67647, 67742, 67751, 67759, 67808, 67829, 67835, 67867, 67871, 67897, 67903, 67903, 67968, 68023, 68028, 68047, 68050, 68102, 68108, 68149, 68152, 68154, 68159, 68168, 68176, 68184, 68192, 68255, 68288, 68326, 68331, 68342, 68352, 68405, 68409, 68437, 68440, 68466, 68472, 68497, 68505, 68508, 68521, 68527, 68608, 68680, 68736, 68786, 68800, 68850, 68858, 68903, 68912, 68921, 69216, 69293, 69296, 69297, 69376, 69415, 69424, 69465, 69552, 69579, 69600, 69622, 69632, 69709, 69714, 69743, 69759, 69825, 69840, 69864, 69872, 69881, 69888, 69959, 69968, 70006, 70016, 70132, 70144, 70206, 70272, 70313, 70320, 70378, 70384, 70393, 70400, 70412, 70415, 70416, 70419, 70468, 70471, 70472, 70475, 70477, 70480, 70480, 70487, 70487, 70493, 70499, 70502, 70508, 70512, 70516, 70656, 70753, 70784, 70855, 70864, 70873, 71040, 71093, 71096, 71133, 71168, 71236, 71248, 71257, 71264, 71276, 71296, 71352, 71360, 71369, 71424, 71450, 71453, 71467, 71472, 71487, 71680, 71739, 71840, 71922, 71935, 71942, 71945, 71945, 71948, 71992, 71995, 72006, 72016, 72025, 72096, 72103, 72106, 72151, 72154, 72164, 72192, 72263, 72272, 72354, 72384, 72440, 72704, 72773, 72784, 72812, 72816, 72847, 72850, 72886, 72960, 73014, 73018, 73031, 73040, 73049, 73056, 73112, 73120, 73129, 73440, 73464, 73648, 73648, 73664, 73713, 73727, 74649, 74752, 74868, 74880, 75075, 77824, 78894, 82944, 83526, 92160, 92728, 92736, 92777, 92782, 92783, 92880, 92909, 92912, 92917, 92928, 92997, 93008, 93047, 93053, 93071, 93760, 93850, 93952, 94026, 94031, 94087, 94095, 94111, 94176, 94180, 94192, 94193, 94208, 100343, 100352, 101589, 101632, 101640, 110592, 110878, 110928, 110930, 110948, 110951, 110960, 111355, 113664, 113770, 113776, 113788, 113792, 113800, 113808, 113817, 113820, 113823, 118784, 119029, 119040, 119078, 119081, 119154, 119163, 119272, 119296, 119365, 119520, 119539, 119552, 119638, 119648, 119672, 119808, 119967, 119970, 119970, 119973, 119974, 119977, 120074, 120077, 120134, 120138, 120485, 120488, 120779, 120782, 121483, 121499, 121519, 122880, 122904, 122907, 122922, 123136, 123180, 123184, 123197, 123200, 123209, 123214, 123215, 123584, 123641, 123647, 123647, 124928, 125124, 125127, 125142, 125184, 125259, 125264, 125273, 125278, 125279, 126065, 126132, 126209, 126269, 126464, 126500, 126503, 126523, 126530, 126530, 126535, 126548, 126551, 126564, 126567, 126619, 126625, 126651, 126704, 126705, 126976, 127019, 127024, 127123, 127136, 127150, 127153, 127221, 127232, 127405, 127462, 127490, 127504, 127547, 127552, 127560, 127568, 127569, 127584, 127589, 127744, 128727, 128736, 128748, 128752, 128764, 128768, 128883, 128896, 128984, 128992, 129003, 129024, 129035, 129040, 129095, 129104, 129113, 129120, 129159, 129168, 129197, 129200, 129201, 129280, 129619, 129632, 129645, 129648, 129652, 129656, 129658, 129664, 129670, 129680, 129704, 129712, 129718, 129728, 129730, 129744, 129750, 129792, 129994, 130032, 130041, 131072, 173789, 173824, 177972, 177984, 178205, 178208, 183969, 183984, 191456, 194560, 195101, 196608, 201546, 917760, 917999]);
		isNotPrint32 = new sliceType$4([12, 39, 59, 62, 399, 926, 2057, 2102, 2134, 2291, 2564, 2580, 2584, 3711, 3754, 4285, 4405, 4576, 4626, 4743, 4745, 4750, 4766, 4868, 4905, 4913, 4916, 4922, 5212, 6420, 6423, 6454, 7177, 7223, 7336, 7431, 7434, 7483, 7486, 7526, 7529, 7567, 7570, 9327, 27231, 27482, 27490, 54357, 54429, 54445, 54458, 54460, 54468, 54534, 54549, 54557, 54586, 54591, 54597, 54609, 55968, 57351, 57378, 57381, 60932, 60960, 60963, 60968, 60979, 60984, 60986, 61000, 61002, 61004, 61008, 61011, 61016, 61018, 61020, 61022, 61024, 61027, 61035, 61043, 61048, 61053, 61055, 61066, 61092, 61098, 61632, 61648, 63865, 63948, 64403]);
		isGraphic = new sliceType$4([160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8239, 8287, 12288]);
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["internal/race"] = (function() {
	var $pkg = {}, $init, Acquire, Release, ReleaseMerge, Disable, Enable, ReadRange, WriteRange;
	Acquire = function(addr) {
		var addr;
	};
	$pkg.Acquire = Acquire;
	Release = function(addr) {
		var addr;
	};
	$pkg.Release = Release;
	ReleaseMerge = function(addr) {
		var addr;
	};
	$pkg.ReleaseMerge = ReleaseMerge;
	Disable = function() {
	};
	$pkg.Disable = Disable;
	Enable = function() {
	};
	$pkg.Enable = Enable;
	ReadRange = function(addr, len) {
		var addr, len;
	};
	$pkg.ReadRange = ReadRange;
	WriteRange = function(addr, len) {
		var addr, len;
	};
	$pkg.WriteRange = WriteRange;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["sync/atomic"] = (function() {
	var $pkg = {}, $init, js, Value, ptrType, CompareAndSwapInt32, CompareAndSwapUint64, AddInt32, LoadInt32, LoadUint64, StoreInt32, StoreUint32;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	Value = $pkg.Value = $newType(0, $kindStruct, "atomic.Value", true, "sync/atomic", true, function(v_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.v = $ifaceNil;
			return;
		}
		this.v = v_;
	});
	ptrType = $ptrType(Value);
	CompareAndSwapInt32 = function(addr, old, new$1) {
		var addr, new$1, old;
		if (addr.$get() === old) {
			addr.$set(new$1);
			return true;
		}
		return false;
	};
	$pkg.CompareAndSwapInt32 = CompareAndSwapInt32;
	CompareAndSwapUint64 = function(addr, old, new$1) {
		var addr, new$1, old, x;
		if ((x = addr.$get(), (x.$high === old.$high && x.$low === old.$low))) {
			addr.$set(new$1);
			return true;
		}
		return false;
	};
	$pkg.CompareAndSwapUint64 = CompareAndSwapUint64;
	AddInt32 = function(addr, delta) {
		var addr, delta, new$1;
		new$1 = addr.$get() + delta >> 0;
		addr.$set(new$1);
		return new$1;
	};
	$pkg.AddInt32 = AddInt32;
	LoadInt32 = function(addr) {
		var addr;
		return addr.$get();
	};
	$pkg.LoadInt32 = LoadInt32;
	LoadUint64 = function(addr) {
		var addr;
		return addr.$get();
	};
	$pkg.LoadUint64 = LoadUint64;
	StoreInt32 = function(addr, val) {
		var addr, val;
		addr.$set(val);
	};
	$pkg.StoreInt32 = StoreInt32;
	StoreUint32 = function(addr, val) {
		var addr, val;
		addr.$set(val);
	};
	$pkg.StoreUint32 = StoreUint32;
	Value.ptr.prototype.Load = function() {
		var v, x;
		x = $ifaceNil;
		v = this;
		x = v.v;
		return x;
	};
	Value.prototype.Load = function() { return this.$val.Load(); };
	Value.ptr.prototype.Store = function(x) {
		var v, x;
		v = this;
		if ($interfaceIsEqual(x, $ifaceNil)) {
			$panic(new $String("sync/atomic: store of nil value into Value"));
		}
		if (!($interfaceIsEqual(v.v, $ifaceNil)) && !(x.constructor === v.v.constructor)) {
			$panic(new $String("sync/atomic: store of inconsistently typed value into Value"));
		}
		v.v = x;
	};
	Value.prototype.Store = function(x) { return this.$val.Store(x); };
	ptrType.methods = [{prop: "Load", name: "Load", pkg: "", typ: $funcType([], [$emptyInterface], false)}, {prop: "Store", name: "Store", pkg: "", typ: $funcType([$emptyInterface], [], false)}];
	Value.init("sync/atomic", [{prop: "v", name: "v", embedded: false, exported: false, typ: $emptyInterface, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["sync"] = (function() {
	var $pkg = {}, $init, js, race, atomic, Pool, Mutex, Locker, notifyList, RWMutex, rlocker, ptrType, chanType, sliceType, ptrType$5, ptrType$10, ptrType$11, sliceType$3, ptrType$13, funcType, ptrType$18, semWaiters, semAwoken, expunged, runtime_SemacquireMutex, runtime_Semrelease, runtime_notifyListCheck, runtime_canSpin, runtime_nanotime, throw$1, init, runtime_doSpin;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	race = $packages["internal/race"];
	atomic = $packages["sync/atomic"];
	Pool = $pkg.Pool = $newType(0, $kindStruct, "sync.Pool", true, "sync", true, function(store_, New_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.store = sliceType$3.nil;
			this.New = $throwNilPointerError;
			return;
		}
		this.store = store_;
		this.New = New_;
	});
	Mutex = $pkg.Mutex = $newType(0, $kindStruct, "sync.Mutex", true, "sync", true, function(state_, sema_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.state = 0;
			this.sema = 0;
			return;
		}
		this.state = state_;
		this.sema = sema_;
	});
	Locker = $pkg.Locker = $newType(8, $kindInterface, "sync.Locker", true, "sync", true, null);
	notifyList = $pkg.notifyList = $newType(0, $kindStruct, "sync.notifyList", true, "sync", false, function(wait_, notify_, lock_, head_, tail_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.wait = 0;
			this.notify = 0;
			this.lock = 0;
			this.head = 0;
			this.tail = 0;
			return;
		}
		this.wait = wait_;
		this.notify = notify_;
		this.lock = lock_;
		this.head = head_;
		this.tail = tail_;
	});
	RWMutex = $pkg.RWMutex = $newType(0, $kindStruct, "sync.RWMutex", true, "sync", true, function(w_, writerSem_, readerSem_, readerCount_, readerWait_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.w = new Mutex.ptr(0, 0);
			this.writerSem = 0;
			this.readerSem = 0;
			this.readerCount = 0;
			this.readerWait = 0;
			return;
		}
		this.w = w_;
		this.writerSem = writerSem_;
		this.readerSem = readerSem_;
		this.readerCount = readerCount_;
		this.readerWait = readerWait_;
	});
	rlocker = $pkg.rlocker = $newType(0, $kindStruct, "sync.rlocker", true, "sync", false, function(w_, writerSem_, readerSem_, readerCount_, readerWait_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.w = new Mutex.ptr(0, 0);
			this.writerSem = 0;
			this.readerSem = 0;
			this.readerCount = 0;
			this.readerWait = 0;
			return;
		}
		this.w = w_;
		this.writerSem = writerSem_;
		this.readerSem = readerSem_;
		this.readerCount = readerCount_;
		this.readerWait = readerWait_;
	});
	ptrType = $ptrType($Uint32);
	chanType = $chanType($Bool, false, false);
	sliceType = $sliceType(chanType);
	ptrType$5 = $ptrType($Int32);
	ptrType$10 = $ptrType(rlocker);
	ptrType$11 = $ptrType(RWMutex);
	sliceType$3 = $sliceType($emptyInterface);
	ptrType$13 = $ptrType(Pool);
	funcType = $funcType([], [$emptyInterface], false);
	ptrType$18 = $ptrType(Mutex);
	Pool.ptr.prototype.Get = function() {
		var _r, p, x, x$1, x$2, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; p = $f.p; x = $f.x; x$1 = $f.x$1; x$2 = $f.x$2; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		p = this;
		/* */ if (p.store.$length === 0) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (p.store.$length === 0) { */ case 1:
			/* */ if (!(p.New === $throwNilPointerError)) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (!(p.New === $throwNilPointerError)) { */ case 3:
				_r = p.New(); /* */ $s = 5; case 5: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				$s = -1; return _r;
			/* } */ case 4:
			$s = -1; return $ifaceNil;
		/* } */ case 2:
		x$2 = (x = p.store, x$1 = p.store.$length - 1 >> 0, ((x$1 < 0 || x$1 >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + x$1]));
		p.store = $subslice(p.store, 0, (p.store.$length - 1 >> 0));
		$s = -1; return x$2;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Pool.ptr.prototype.Get }; } $f._r = _r; $f.p = p; $f.x = x; $f.x$1 = x$1; $f.x$2 = x$2; $f.$s = $s; $f.$r = $r; return $f;
	};
	Pool.prototype.Get = function() { return this.$val.Get(); };
	Pool.ptr.prototype.Put = function(x) {
		var p, x;
		p = this;
		if ($interfaceIsEqual(x, $ifaceNil)) {
			return;
		}
		p.store = $append(p.store, x);
	};
	Pool.prototype.Put = function(x) { return this.$val.Put(x); };
	runtime_SemacquireMutex = function(s, lifo, skipframes) {
		var _entry, _entry$1, _entry$2, _entry$3, _entry$4, _key, _key$1, _key$2, _r, ch, lifo, s, skipframes, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _entry$1 = $f._entry$1; _entry$2 = $f._entry$2; _entry$3 = $f._entry$3; _entry$4 = $f._entry$4; _key = $f._key; _key$1 = $f._key$1; _key$2 = $f._key$2; _r = $f._r; ch = $f.ch; lifo = $f.lifo; s = $f.s; skipframes = $f.skipframes; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ if (((s.$get() - (_entry = semAwoken[ptrType.keyFor(s)], _entry !== undefined ? _entry.v : 0) >>> 0)) === 0) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (((s.$get() - (_entry = semAwoken[ptrType.keyFor(s)], _entry !== undefined ? _entry.v : 0) >>> 0)) === 0) { */ case 1:
			ch = new $Chan($Bool, 0);
			if (lifo) {
				_key = s; (semWaiters || $throwRuntimeError("assignment to entry in nil map"))[ptrType.keyFor(_key)] = { k: _key, v: $appendSlice(new sliceType([ch]), (_entry$1 = semWaiters[ptrType.keyFor(s)], _entry$1 !== undefined ? _entry$1.v : sliceType.nil)) };
			} else {
				_key$1 = s; (semWaiters || $throwRuntimeError("assignment to entry in nil map"))[ptrType.keyFor(_key$1)] = { k: _key$1, v: $append((_entry$2 = semWaiters[ptrType.keyFor(s)], _entry$2 !== undefined ? _entry$2.v : sliceType.nil), ch) };
			}
			_r = $recv(ch); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_r[0];
			_key$2 = s; (semAwoken || $throwRuntimeError("assignment to entry in nil map"))[ptrType.keyFor(_key$2)] = { k: _key$2, v: (_entry$3 = semAwoken[ptrType.keyFor(s)], _entry$3 !== undefined ? _entry$3.v : 0) - (1) >>> 0 };
			if ((_entry$4 = semAwoken[ptrType.keyFor(s)], _entry$4 !== undefined ? _entry$4.v : 0) === 0) {
				delete semAwoken[ptrType.keyFor(s)];
			}
		/* } */ case 2:
		s.$set(s.$get() - (1) >>> 0);
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: runtime_SemacquireMutex }; } $f._entry = _entry; $f._entry$1 = _entry$1; $f._entry$2 = _entry$2; $f._entry$3 = _entry$3; $f._entry$4 = _entry$4; $f._key = _key; $f._key$1 = _key$1; $f._key$2 = _key$2; $f._r = _r; $f.ch = ch; $f.lifo = lifo; $f.s = s; $f.skipframes = skipframes; $f.$s = $s; $f.$r = $r; return $f;
	};
	runtime_Semrelease = function(s, handoff, skipframes) {
		var _entry, _entry$1, _key, _key$1, ch, handoff, s, skipframes, w, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _entry$1 = $f._entry$1; _key = $f._key; _key$1 = $f._key$1; ch = $f.ch; handoff = $f.handoff; s = $f.s; skipframes = $f.skipframes; w = $f.w; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		s.$set(s.$get() + (1) >>> 0);
		w = (_entry = semWaiters[ptrType.keyFor(s)], _entry !== undefined ? _entry.v : sliceType.nil);
		if (w.$length === 0) {
			$s = -1; return;
		}
		ch = (0 >= w.$length ? ($throwRuntimeError("index out of range"), undefined) : w.$array[w.$offset + 0]);
		w = $subslice(w, 1);
		_key = s; (semWaiters || $throwRuntimeError("assignment to entry in nil map"))[ptrType.keyFor(_key)] = { k: _key, v: w };
		if (w.$length === 0) {
			delete semWaiters[ptrType.keyFor(s)];
		}
		_key$1 = s; (semAwoken || $throwRuntimeError("assignment to entry in nil map"))[ptrType.keyFor(_key$1)] = { k: _key$1, v: (_entry$1 = semAwoken[ptrType.keyFor(s)], _entry$1 !== undefined ? _entry$1.v : 0) + (1) >>> 0 };
		$r = $send(ch, true); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: runtime_Semrelease }; } $f._entry = _entry; $f._entry$1 = _entry$1; $f._key = _key; $f._key$1 = _key$1; $f.ch = ch; $f.handoff = handoff; $f.s = s; $f.skipframes = skipframes; $f.w = w; $f.$s = $s; $f.$r = $r; return $f;
	};
	runtime_notifyListCheck = function(size) {
		var size;
	};
	runtime_canSpin = function(i) {
		var i;
		return false;
	};
	runtime_nanotime = function() {
		return $mul64($internalize(new ($global.Date)().getTime(), $Int64), new $Int64(0, 1000000));
	};
	throw$1 = function(s) {
		var s;
		$throwRuntimeError($externalize(s, $String));
	};
	Mutex.ptr.prototype.Lock = function() {
		var m, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; m = $f.m; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		m = this;
		if (atomic.CompareAndSwapInt32((m.$ptr_state || (m.$ptr_state = new ptrType$5(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), 0, 1)) {
			if (false) {
				race.Acquire((m));
			}
			$s = -1; return;
		}
		$r = m.lockSlow(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Mutex.ptr.prototype.Lock }; } $f.m = m; $f.$s = $s; $f.$r = $r; return $f;
	};
	Mutex.prototype.Lock = function() { return this.$val.Lock(); };
	Mutex.ptr.prototype.lockSlow = function() {
		var awoke, delta, iter, m, new$1, old, queueLifo, starving, waitStartTime, x, x$1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; awoke = $f.awoke; delta = $f.delta; iter = $f.iter; m = $f.m; new$1 = $f.new$1; old = $f.old; queueLifo = $f.queueLifo; starving = $f.starving; waitStartTime = $f.waitStartTime; x = $f.x; x$1 = $f.x$1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		m = this;
		waitStartTime = new $Int64(0, 0);
		starving = false;
		awoke = false;
		iter = 0;
		old = m.state;
		/* while (true) { */ case 1:
			/* */ if (((old & 5) === 1) && runtime_canSpin(iter)) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (((old & 5) === 1) && runtime_canSpin(iter)) { */ case 3:
				if (!awoke && ((old & 2) === 0) && !(((old >> 3 >> 0) === 0)) && atomic.CompareAndSwapInt32((m.$ptr_state || (m.$ptr_state = new ptrType$5(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), old, old | 2)) {
					awoke = true;
				}
				runtime_doSpin();
				iter = iter + (1) >> 0;
				old = m.state;
				/* continue; */ $s = 1; continue;
			/* } */ case 4:
			new$1 = old;
			if ((old & 4) === 0) {
				new$1 = new$1 | (1);
			}
			if (!(((old & 5) === 0))) {
				new$1 = new$1 + (8) >> 0;
			}
			if (starving && !(((old & 1) === 0))) {
				new$1 = new$1 | (4);
			}
			if (awoke) {
				if ((new$1 & 2) === 0) {
					throw$1("sync: inconsistent mutex state");
				}
				new$1 = (new$1 & ~(2)) >> 0;
			}
			/* */ if (atomic.CompareAndSwapInt32((m.$ptr_state || (m.$ptr_state = new ptrType$5(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), old, new$1)) { $s = 5; continue; }
			/* */ $s = 6; continue;
			/* if (atomic.CompareAndSwapInt32((m.$ptr_state || (m.$ptr_state = new ptrType$5(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), old, new$1)) { */ case 5:
				if ((old & 5) === 0) {
					/* break; */ $s = 2; continue;
				}
				queueLifo = !((waitStartTime.$high === 0 && waitStartTime.$low === 0));
				if ((waitStartTime.$high === 0 && waitStartTime.$low === 0)) {
					waitStartTime = runtime_nanotime();
				}
				$r = runtime_SemacquireMutex((m.$ptr_sema || (m.$ptr_sema = new ptrType(function() { return this.$target.sema; }, function($v) { this.$target.sema = $v; }, m))), queueLifo, 1); /* */ $s = 8; case 8: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
				starving = starving || (x = (x$1 = runtime_nanotime(), new $Int64(x$1.$high - waitStartTime.$high, x$1.$low - waitStartTime.$low)), (x.$high > 0 || (x.$high === 0 && x.$low > 1000000)));
				old = m.state;
				if (!(((old & 4) === 0))) {
					if (!(((old & 3) === 0)) || ((old >> 3 >> 0) === 0)) {
						throw$1("sync: inconsistent mutex state");
					}
					delta = -7;
					if (!starving || ((old >> 3 >> 0) === 1)) {
						delta = delta - (4) >> 0;
					}
					atomic.AddInt32((m.$ptr_state || (m.$ptr_state = new ptrType$5(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), delta);
					/* break; */ $s = 2; continue;
				}
				awoke = true;
				iter = 0;
				$s = 7; continue;
			/* } else { */ case 6:
				old = m.state;
			/* } */ case 7:
		/* } */ $s = 1; continue; case 2:
		if (false) {
			race.Acquire((m));
		}
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Mutex.ptr.prototype.lockSlow }; } $f.awoke = awoke; $f.delta = delta; $f.iter = iter; $f.m = m; $f.new$1 = new$1; $f.old = old; $f.queueLifo = queueLifo; $f.starving = starving; $f.waitStartTime = waitStartTime; $f.x = x; $f.x$1 = x$1; $f.$s = $s; $f.$r = $r; return $f;
	};
	Mutex.prototype.lockSlow = function() { return this.$val.lockSlow(); };
	Mutex.ptr.prototype.Unlock = function() {
		var m, new$1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; m = $f.m; new$1 = $f.new$1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		m = this;
		if (false) {
			$unused(m.state);
			race.Release((m));
		}
		new$1 = atomic.AddInt32((m.$ptr_state || (m.$ptr_state = new ptrType$5(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), -1);
		/* */ if (!((new$1 === 0))) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!((new$1 === 0))) { */ case 1:
			$r = m.unlockSlow(new$1); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 2:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Mutex.ptr.prototype.Unlock }; } $f.m = m; $f.new$1 = new$1; $f.$s = $s; $f.$r = $r; return $f;
	};
	Mutex.prototype.Unlock = function() { return this.$val.Unlock(); };
	Mutex.ptr.prototype.unlockSlow = function(new$1) {
		var m, new$1, old, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; m = $f.m; new$1 = $f.new$1; old = $f.old; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		m = this;
		if ((((new$1 + 1 >> 0)) & 1) === 0) {
			throw$1("sync: unlock of unlocked mutex");
		}
		/* */ if ((new$1 & 4) === 0) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if ((new$1 & 4) === 0) { */ case 1:
			old = new$1;
			/* while (true) { */ case 4:
				if (((old >> 3 >> 0) === 0) || !(((old & 7) === 0))) {
					$s = -1; return;
				}
				new$1 = ((old - 8 >> 0)) | 2;
				/* */ if (atomic.CompareAndSwapInt32((m.$ptr_state || (m.$ptr_state = new ptrType$5(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), old, new$1)) { $s = 6; continue; }
				/* */ $s = 7; continue;
				/* if (atomic.CompareAndSwapInt32((m.$ptr_state || (m.$ptr_state = new ptrType$5(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), old, new$1)) { */ case 6:
					$r = runtime_Semrelease((m.$ptr_sema || (m.$ptr_sema = new ptrType(function() { return this.$target.sema; }, function($v) { this.$target.sema = $v; }, m))), false, 1); /* */ $s = 8; case 8: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
					$s = -1; return;
				/* } */ case 7:
				old = m.state;
			/* } */ $s = 4; continue; case 5:
			$s = 3; continue;
		/* } else { */ case 2:
			$r = runtime_Semrelease((m.$ptr_sema || (m.$ptr_sema = new ptrType(function() { return this.$target.sema; }, function($v) { this.$target.sema = $v; }, m))), true, 1); /* */ $s = 9; case 9: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 3:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Mutex.ptr.prototype.unlockSlow }; } $f.m = m; $f.new$1 = new$1; $f.old = old; $f.$s = $s; $f.$r = $r; return $f;
	};
	Mutex.prototype.unlockSlow = function(new$1) { return this.$val.unlockSlow(new$1); };
	init = function() {
		var n;
		n = new notifyList.ptr(0, 0, 0, 0, 0);
		runtime_notifyListCheck(20);
	};
	runtime_doSpin = function() {
		$throwRuntimeError("native function not implemented: sync.runtime_doSpin");
	};
	RWMutex.ptr.prototype.RLock = function() {
		var rw, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; rw = $f.rw; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		rw = this;
		if (false) {
			$unused(rw.w.state);
			race.Disable();
		}
		/* */ if (atomic.AddInt32((rw.$ptr_readerCount || (rw.$ptr_readerCount = new ptrType$5(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw))), 1) < 0) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (atomic.AddInt32((rw.$ptr_readerCount || (rw.$ptr_readerCount = new ptrType$5(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw))), 1) < 0) { */ case 1:
			$r = runtime_SemacquireMutex((rw.$ptr_readerSem || (rw.$ptr_readerSem = new ptrType(function() { return this.$target.readerSem; }, function($v) { this.$target.readerSem = $v; }, rw))), false, 0); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 2:
		if (false) {
			race.Enable();
			race.Acquire(((rw.$ptr_readerSem || (rw.$ptr_readerSem = new ptrType(function() { return this.$target.readerSem; }, function($v) { this.$target.readerSem = $v; }, rw)))));
		}
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: RWMutex.ptr.prototype.RLock }; } $f.rw = rw; $f.$s = $s; $f.$r = $r; return $f;
	};
	RWMutex.prototype.RLock = function() { return this.$val.RLock(); };
	RWMutex.ptr.prototype.RUnlock = function() {
		var r, rw, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; r = $f.r; rw = $f.rw; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		rw = this;
		if (false) {
			$unused(rw.w.state);
			race.ReleaseMerge(((rw.$ptr_writerSem || (rw.$ptr_writerSem = new ptrType(function() { return this.$target.writerSem; }, function($v) { this.$target.writerSem = $v; }, rw)))));
			race.Disable();
		}
		r = atomic.AddInt32((rw.$ptr_readerCount || (rw.$ptr_readerCount = new ptrType$5(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw))), -1);
		/* */ if (r < 0) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (r < 0) { */ case 1:
			$r = rw.rUnlockSlow(r); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 2:
		if (false) {
			race.Enable();
		}
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: RWMutex.ptr.prototype.RUnlock }; } $f.r = r; $f.rw = rw; $f.$s = $s; $f.$r = $r; return $f;
	};
	RWMutex.prototype.RUnlock = function() { return this.$val.RUnlock(); };
	RWMutex.ptr.prototype.rUnlockSlow = function(r) {
		var r, rw, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; r = $f.r; rw = $f.rw; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		rw = this;
		if (((r + 1 >> 0) === 0) || ((r + 1 >> 0) === -1073741824)) {
			race.Enable();
			throw$1("sync: RUnlock of unlocked RWMutex");
		}
		/* */ if (atomic.AddInt32((rw.$ptr_readerWait || (rw.$ptr_readerWait = new ptrType$5(function() { return this.$target.readerWait; }, function($v) { this.$target.readerWait = $v; }, rw))), -1) === 0) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (atomic.AddInt32((rw.$ptr_readerWait || (rw.$ptr_readerWait = new ptrType$5(function() { return this.$target.readerWait; }, function($v) { this.$target.readerWait = $v; }, rw))), -1) === 0) { */ case 1:
			$r = runtime_Semrelease((rw.$ptr_writerSem || (rw.$ptr_writerSem = new ptrType(function() { return this.$target.writerSem; }, function($v) { this.$target.writerSem = $v; }, rw))), false, 1); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 2:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: RWMutex.ptr.prototype.rUnlockSlow }; } $f.r = r; $f.rw = rw; $f.$s = $s; $f.$r = $r; return $f;
	};
	RWMutex.prototype.rUnlockSlow = function(r) { return this.$val.rUnlockSlow(r); };
	RWMutex.ptr.prototype.Lock = function() {
		var r, rw, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; r = $f.r; rw = $f.rw; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		rw = this;
		if (false) {
			$unused(rw.w.state);
			race.Disable();
		}
		$r = rw.w.Lock(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		r = atomic.AddInt32((rw.$ptr_readerCount || (rw.$ptr_readerCount = new ptrType$5(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw))), -1073741824) + 1073741824 >> 0;
		/* */ if (!((r === 0)) && !((atomic.AddInt32((rw.$ptr_readerWait || (rw.$ptr_readerWait = new ptrType$5(function() { return this.$target.readerWait; }, function($v) { this.$target.readerWait = $v; }, rw))), r) === 0))) { $s = 2; continue; }
		/* */ $s = 3; continue;
		/* if (!((r === 0)) && !((atomic.AddInt32((rw.$ptr_readerWait || (rw.$ptr_readerWait = new ptrType$5(function() { return this.$target.readerWait; }, function($v) { this.$target.readerWait = $v; }, rw))), r) === 0))) { */ case 2:
			$r = runtime_SemacquireMutex((rw.$ptr_writerSem || (rw.$ptr_writerSem = new ptrType(function() { return this.$target.writerSem; }, function($v) { this.$target.writerSem = $v; }, rw))), false, 0); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 3:
		if (false) {
			race.Enable();
			race.Acquire(((rw.$ptr_readerSem || (rw.$ptr_readerSem = new ptrType(function() { return this.$target.readerSem; }, function($v) { this.$target.readerSem = $v; }, rw)))));
			race.Acquire(((rw.$ptr_writerSem || (rw.$ptr_writerSem = new ptrType(function() { return this.$target.writerSem; }, function($v) { this.$target.writerSem = $v; }, rw)))));
		}
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: RWMutex.ptr.prototype.Lock }; } $f.r = r; $f.rw = rw; $f.$s = $s; $f.$r = $r; return $f;
	};
	RWMutex.prototype.Lock = function() { return this.$val.Lock(); };
	RWMutex.ptr.prototype.Unlock = function() {
		var i, r, rw, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; i = $f.i; r = $f.r; rw = $f.rw; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		rw = this;
		if (false) {
			$unused(rw.w.state);
			race.Release(((rw.$ptr_readerSem || (rw.$ptr_readerSem = new ptrType(function() { return this.$target.readerSem; }, function($v) { this.$target.readerSem = $v; }, rw)))));
			race.Disable();
		}
		r = atomic.AddInt32((rw.$ptr_readerCount || (rw.$ptr_readerCount = new ptrType$5(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw))), 1073741824);
		if (r >= 1073741824) {
			race.Enable();
			throw$1("sync: Unlock of unlocked RWMutex");
		}
		i = 0;
		/* while (true) { */ case 1:
			/* if (!(i < ((r >> 0)))) { break; } */ if(!(i < ((r >> 0)))) { $s = 2; continue; }
			$r = runtime_Semrelease((rw.$ptr_readerSem || (rw.$ptr_readerSem = new ptrType(function() { return this.$target.readerSem; }, function($v) { this.$target.readerSem = $v; }, rw))), false, 0); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			i = i + (1) >> 0;
		/* } */ $s = 1; continue; case 2:
		$r = rw.w.Unlock(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		if (false) {
			race.Enable();
		}
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: RWMutex.ptr.prototype.Unlock }; } $f.i = i; $f.r = r; $f.rw = rw; $f.$s = $s; $f.$r = $r; return $f;
	};
	RWMutex.prototype.Unlock = function() { return this.$val.Unlock(); };
	RWMutex.ptr.prototype.RLocker = function() {
		var rw;
		rw = this;
		return ($pointerOfStructConversion(rw, ptrType$10));
	};
	RWMutex.prototype.RLocker = function() { return this.$val.RLocker(); };
	rlocker.ptr.prototype.Lock = function() {
		var r, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; r = $f.r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		r = this;
		$r = ($pointerOfStructConversion(r, ptrType$11)).RLock(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: rlocker.ptr.prototype.Lock }; } $f.r = r; $f.$s = $s; $f.$r = $r; return $f;
	};
	rlocker.prototype.Lock = function() { return this.$val.Lock(); };
	rlocker.ptr.prototype.Unlock = function() {
		var r, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; r = $f.r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		r = this;
		$r = ($pointerOfStructConversion(r, ptrType$11)).RUnlock(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: rlocker.ptr.prototype.Unlock }; } $f.r = r; $f.$s = $s; $f.$r = $r; return $f;
	};
	rlocker.prototype.Unlock = function() { return this.$val.Unlock(); };
	ptrType$13.methods = [{prop: "Get", name: "Get", pkg: "", typ: $funcType([], [$emptyInterface], false)}, {prop: "Put", name: "Put", pkg: "", typ: $funcType([$emptyInterface], [], false)}];
	ptrType$18.methods = [{prop: "Lock", name: "Lock", pkg: "", typ: $funcType([], [], false)}, {prop: "lockSlow", name: "lockSlow", pkg: "sync", typ: $funcType([], [], false)}, {prop: "Unlock", name: "Unlock", pkg: "", typ: $funcType([], [], false)}, {prop: "unlockSlow", name: "unlockSlow", pkg: "sync", typ: $funcType([$Int32], [], false)}];
	ptrType$11.methods = [{prop: "RLock", name: "RLock", pkg: "", typ: $funcType([], [], false)}, {prop: "RUnlock", name: "RUnlock", pkg: "", typ: $funcType([], [], false)}, {prop: "rUnlockSlow", name: "rUnlockSlow", pkg: "sync", typ: $funcType([$Int32], [], false)}, {prop: "Lock", name: "Lock", pkg: "", typ: $funcType([], [], false)}, {prop: "Unlock", name: "Unlock", pkg: "", typ: $funcType([], [], false)}, {prop: "RLocker", name: "RLocker", pkg: "", typ: $funcType([], [Locker], false)}];
	ptrType$10.methods = [{prop: "Lock", name: "Lock", pkg: "", typ: $funcType([], [], false)}, {prop: "Unlock", name: "Unlock", pkg: "", typ: $funcType([], [], false)}];
	Pool.init("sync", [{prop: "store", name: "store", embedded: false, exported: false, typ: sliceType$3, tag: ""}, {prop: "New", name: "New", embedded: false, exported: true, typ: funcType, tag: ""}]);
	Mutex.init("sync", [{prop: "state", name: "state", embedded: false, exported: false, typ: $Int32, tag: ""}, {prop: "sema", name: "sema", embedded: false, exported: false, typ: $Uint32, tag: ""}]);
	Locker.init([{prop: "Lock", name: "Lock", pkg: "", typ: $funcType([], [], false)}, {prop: "Unlock", name: "Unlock", pkg: "", typ: $funcType([], [], false)}]);
	notifyList.init("sync", [{prop: "wait", name: "wait", embedded: false, exported: false, typ: $Uint32, tag: ""}, {prop: "notify", name: "notify", embedded: false, exported: false, typ: $Uint32, tag: ""}, {prop: "lock", name: "lock", embedded: false, exported: false, typ: $Uintptr, tag: ""}, {prop: "head", name: "head", embedded: false, exported: false, typ: $UnsafePointer, tag: ""}, {prop: "tail", name: "tail", embedded: false, exported: false, typ: $UnsafePointer, tag: ""}]);
	RWMutex.init("sync", [{prop: "w", name: "w", embedded: false, exported: false, typ: Mutex, tag: ""}, {prop: "writerSem", name: "writerSem", embedded: false, exported: false, typ: $Uint32, tag: ""}, {prop: "readerSem", name: "readerSem", embedded: false, exported: false, typ: $Uint32, tag: ""}, {prop: "readerCount", name: "readerCount", embedded: false, exported: false, typ: $Int32, tag: ""}, {prop: "readerWait", name: "readerWait", embedded: false, exported: false, typ: $Int32, tag: ""}]);
	rlocker.init("sync", [{prop: "w", name: "w", embedded: false, exported: false, typ: Mutex, tag: ""}, {prop: "writerSem", name: "writerSem", embedded: false, exported: false, typ: $Uint32, tag: ""}, {prop: "readerSem", name: "readerSem", embedded: false, exported: false, typ: $Uint32, tag: ""}, {prop: "readerCount", name: "readerCount", embedded: false, exported: false, typ: $Int32, tag: ""}, {prop: "readerWait", name: "readerWait", embedded: false, exported: false, typ: $Int32, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = race.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = atomic.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		semWaiters = {};
		semAwoken = {};
		expunged = (new Uint8Array(8));
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
