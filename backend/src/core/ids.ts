import { randomBytes, randomUUID } from 'node:crypto';

export function uuid(): string {
  return randomUUID();
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I

/** Codigo curto legivel para pareamento de canais (ex.: Telegram). */
export function pairingCode(length = 6): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

export function token(bytes = 48): string {
  return randomBytes(bytes).toString('hex');
}
