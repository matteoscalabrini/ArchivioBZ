// The login of the edit mode: one password, the author's. This file holds only what is made of it:
// the hash kept in the environment, the check of a typed password against it, and the session
// cookie that proves a login for 30 days. It reads no file and touches no database, so the
// handlers, the local server and the tests use the same functions. Counting failed logins is the
// handlers' work, with the store.
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'archivio_edit';
export const SESSION_MS = 2592000000;

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

const derive = (password, salt) => new Promise((resolve, reject) => {
  scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { N, r: R, p: P }, (error, key) => (error ? reject(error) : resolve(key)));
});

// `scrypt$N$r$p$<salt base64>$<hash base64>`, a new random salt each time.
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

// True only when `password` gives the stored hash, compared in constant time. Anything that is not
// a hash this file made (missing, other costs, wrong lengths) is simply false.
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  if (parts[1] !== String(N) || parts[2] !== String(R) || parts[3] !== String(P)) return false;
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  if (salt.length !== 16 || expected.length !== KEY_LENGTH) return false;
  return timingSafeEqual(await derive(password, salt), expected);
}

const sign = (expiry, secret) => createHmac('sha256', secret).update(expiry).digest('base64url');

// `<expiry ms>.<HMAC-SHA256 of the expiry, base64url>`: the moment the login ends, and proof that
// the server made it.
export function makeSession(secret, now = Date.now()) {
  const expiry = String(now + SESSION_MS);
  return `${expiry}.${sign(expiry, secret)}`;
}

// Whether the cookie header holds a session that this secret signed and that has not ended.
export function readSession(cookieHeader, secret, now = Date.now()) {
  if (typeof cookieHeader !== 'string' || typeof secret !== 'string' || secret === '') return false;
  const pair = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
  if (!pair) return false;
  const value = pair.slice(COOKIE.length + 1);
  const dot = value.indexOf('.');
  if (dot < 1) return false;
  const expiry = value.slice(0, dot);
  if (!/^\d+$/.test(expiry)) return false;
  const given = Buffer.from(value.slice(dot + 1));
  const wanted = Buffer.from(sign(expiry, secret));
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return false;
  return Number(expiry) > now;
}

// `Secure` is left out only by the local server, which runs on plain http.
const cookie = (value, maxAge, secure) => `${COOKIE}=${value}; Path=/; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Strict; Max-Age=${maxAge}`;

export const sessionCookie = (value, { secure = true } = {}) => cookie(value, SESSION_MS / 1000, secure);
export const clearedCookie = ({ secure = true } = {}) => cookie('', 0, secure);
