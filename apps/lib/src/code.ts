import { codeWords } from './code-words.ts';

const textEncoder = new TextEncoder();

type BinaryLike = ArrayBuffer | ArrayBufferView;

export function toUint8Array(value: unknown): Uint8Array<ArrayBuffer> {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.byteLength);
    bytes.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    return bytes;
  }

  throw new Error(`Unsupported binary payload: ${Object.prototype.toString.call(value)}`);
}

function hashToIndex(bytes: Uint8Array, modulo: number) {
  let value = 0;
  for (const byte of bytes) {
    value = (value * 256 + byte) % modulo;
  }
  return value;
}

export function normalizeCode(code: string) {
  let normalized = code.trim();
  if (!normalized) {
    return '';
  }

  if (/^[a-z]+:\/\//i.test(normalized)) {
    try {
      normalized = new URL(normalized).host;
    } catch {
      return '';
    }
  }

  return normalized.replace(/\/+$/, '').replace(/\.$/, '').toLowerCase();
}

export function isDomainCode(code: string) {
  const normalized = normalizeCode(code);
  return normalized.includes('.') || normalized === 'localhost' || normalized.startsWith('[');
}

export function wordFromSha256Hash(hash: BinaryLike) {
  const bytes = toUint8Array(hash);
  if (bytes.byteLength === 0) {
    throw new Error('SHA-256 hash must not be empty');
  }

  return codeWords[hashToIndex(bytes, codeWords.length)]!;
}

export async function sha256Text(text: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(text)));
}

export function sha256Hex(hash: BinaryLike) {
  return Array.from(toUint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256HexFromText(text: string) {
  return sha256Hex(await sha256Text(text));
}

export async function codeFromProof(proof: string) {
  return wordFromSha256Hash(await sha256Text(proof));
}

export function createRandomProof(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return sha256Hex(bytes);
}
