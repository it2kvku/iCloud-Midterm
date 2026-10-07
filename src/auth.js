import { randomBytes, scrypt as derive, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(derive);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export const validHash = hash => /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash || '');
export const accountVersion = account => createHash('sha256').update(account.username + ':' + account.passwordHash).digest('hex');
export async function authenticate(accounts, username, password) {
  if (typeof username !== 'string' || typeof password !== 'string' || username.length > 100 || password.length > 256) return null;
  const account = accounts.find(a => a.username === username);
  const [, salt, expected] = (account || accounts[0]).passwordHash.split(':');
  const actual = await scrypt(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex')) && account
    ? { username: account.username, role: account.role, version: accountVersion(account) } : null;
}
