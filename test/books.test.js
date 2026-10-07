import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareBook, createBooksRepository } from '../src/books.js';
import { loadConfig } from '../src/config.js';

const config = { prefix: '139', vat: 15 };
const input = { code: '139-001', title: 'Cloud', author: 'Lam', price: '100000' };
test('tính VAT phía server, bỏ qua số thuế client gửi', () => {
  const book = prepareBook({ ...input, vat: 0, total: 1 }, config);
  assert.equal(book.total, 115000);
  assert.equal(book.tax, 15000);
  assert.equal(book.vat, 15);
});
test('từ chối sai tiền tố, giá lỗi, dữ liệu dạng object', () => {
  for (const change of [{ code: '138-1' }, { price: '-1' }, { price: '1e3' }, { price: '1.5' }, { title: { $ne: '' } }, { code: ['139'] }]) {
    assert.throws(() => prepareBook({ ...input, ...change }, config));
  }
});
test('đọc và ghi đi qua đúng kết nối, insert không cần find', async () => {
  const calls = [];
  const cursor = { sort() { return this; }, limit() { return this; }, async toArray() { return []; } };
  const repo = createBooksRepository(
    { collection(name) { assert.equal(name, 'books'); return { find() { calls.push('read'); return cursor; } }; } },
    { collection(name) { assert.equal(name, 'books'); return { async insertOne() { calls.push('write'); } }; } },
  );
  await repo.list(); await repo.add(prepareBook(input, config));
  assert.deepEqual(calls, ['read', 'write']);
});
test('cấu hình suy ra tên DB, tiền tố và VAT từ MSSV', () => {
  const env = { STUDENT_NAME: 'Tran Van Lam', STUDENT_ID: '23IT139', SESSION_SECRET: 'x'.repeat(48), WEB_READER_USERNAME: 'reader', WEB_WRITER_USERNAME: 'writer', WEB_READER_PASSWORD_HASH: 'scrypt:' + 'a'.repeat(32) + ':' + 'b'.repeat(128), WEB_WRITER_PASSWORD_HASH: 'scrypt:' + 'c'.repeat(32) + ':' + 'd'.repeat(128),
    MONGODB_READ_URI: 'mongodb://reader:secret@localhost', MONGODB_WRITE_URI: 'mongodb://writer:secret@localhost', MONGODB_SESSION_URI: 'mongodb://session:secret@localhost' };
  const c = loadConfig(env);
  assert.equal(c.dbName, 'DB_23IT139'); assert.equal(c.prefix, '139'); assert.equal(c.vat, 15);
  assert.throws(() => loadConfig({ ...env, MONGODB_WRITE_URI: env.MONGODB_READ_URI }));
});
