// ============================================================
// src/utils/base64.ts
// Cross-platform base64 decoder.
// atob() is NOT available on Android React Native.
// Use this everywhere instead.
// ============================================================

/**
 * Decode a base64 string to UTF-8 text.
 * Works on iOS, Android, and web.
 */
export function decodeBase64(base64: string): string {
  // Strip newlines GitHub API adds every 60 chars
  const clean = base64.replace(/\s/g, '');

  // React Native global — available on both iOS and Android
  if (typeof global.atob === 'function') {
    return decodeURIComponent(
      global.atob(clean)
        .split('')
        .map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
  }

  // Manual fallback decoder (pure JS, no native needed)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;

  while (i < clean.length) {
    const a = chars.indexOf(clean[i++]);
    const b = chars.indexOf(clean[i++]);
    const c = chars.indexOf(clean[i++]);
    const d = chars.indexOf(clean[i++]);

    const bitmap = (a << 18) | (b << 12) | (c << 6) | d;
    result += String.fromCharCode((bitmap >> 16) & 0xff);
    if (c !== 64) result += String.fromCharCode((bitmap >> 8) & 0xff);
    if (d !== 64) result += String.fromCharCode(bitmap & 0xff);
  }

  // Handle UTF-8 multi-byte characters
  try {
    return decodeURIComponent(
      result.split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
    );
  } catch {
    return result;
  }
}

/**
 * Encode a UTF-8 string to base64.
 */
export function encodeBase64(str: string): string {
  if (typeof global.btoa === 'function') {
    return global.btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode(parseInt(p1, 16))
      )
    );
  }
  // Buffer fallback (available in React Native Hermes)
  return Buffer.from(str, 'utf-8').toString('base64');
}
