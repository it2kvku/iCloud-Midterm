import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import session from 'express-session';
import { createApp } from '../src/app.js';

// Test double only: production always uses MongoStore. Shared across two app instances.
class SharedTestStore extends session.Store {
  rows = new Map();
  get(id, cb) { cb(null, this.rows.has(id) ? JSON.parse(this.rows.get(id)) : null); }
  set(id, data, cb) { this.rows.set(id, JSON.stringify(data)); cb?.(); }
  destroy(id, cb) { this.rows.delete(id); cb?.(); }
  touch(id, data, cb) { this.set(id, data, cb); }
}
const config = { studentName: 'Tran Van Lam', studentId: '23IT139', prefix: '139', vat: 14, sessionSecret: 's'.repeat(48), production: false };
function fixture() {
  const store = new SharedTestStore(); const saved = [];
  const books = { list: async () => saved, add: async book => { saved.push(book); } };
  return { store, saved, options: { config, store, books } };
}
test('hai instance dùng chung session; render footer; lưu giá server tính', async () => {
  const { options, saved } = fixture();
  const first = createApp(options), second = createApp(options);
  const page = await request(first).get('/').expect(200);
  assert.match(page.text, /Tran Van Lam/); assert.match(page.text, /23IT139/); assert.match(page.text, /14%/);
  const cookie = page.headers['set-cookie'][0].split(';')[0];
  assert.match(page.headers['set-cookie'][0], /HttpOnly/);
  const csrf = page.text.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
  await request(second).post('/books').set('Cookie', cookie).type('form').send({ _csrf: csrf, code: '139-1', title: '<script>bad()</script>', author: 'Lam', price: '100000', total: '1' }).expect(303);
  assert.equal(saved[0].total, 114000);
  const result = await request(first).get('/').set('Cookie', cookie).expect(200);
  assert.match(result.text, /&lt;script&gt;/); assert.doesNotMatch(result.text, /<script>bad/);
  assert.match(result.text, new RegExp(csrf));
});
test('CSRF và tiền tố sai bị từ chối trước khi ghi', async () => {
  const { options, saved } = fixture(); const app = createApp(options);
  await request(app).post('/books').type('form').send({ code: '139-1' }).expect(403);
  const page = await request(app).get('/'); const cookie = page.headers['set-cookie'][0].split(';')[0];
  const csrf = page.text.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
  await request(app).post('/books').set('Cookie', cookie).type('form').send({ _csrf: 'é'.repeat(64) }).expect(403);
  await request(app).post('/books').set('Cookie', cookie).type('form').send({ _csrf: csrf, code: '138-1', title: 'Cloud', author: 'Lam', price: '10' }).expect(400);
  assert.equal(saved.length, 0);
});
test('DB lỗi và trùng mã trả thông báo an toàn', async () => {
  const { options } = fixture(); const app = createApp(options);
  const page = await request(app).get('/'); const cookie = page.headers['set-cookie'][0].split(';')[0];
  const csrf = page.text.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
  options.books.add = async () => { throw Object.assign(new Error('sensitive URI'), { code: 11000 }); };
  await request(app).post('/books').set('Cookie', cookie).type('form').send({ _csrf: csrf, code: '139-1', title: 'Cloud', author: 'Lam', price: '10' }).expect(409);
  options.books.list = async () => { throw new Error('sensitive URI'); };
  const failed = await request(app).get('/').expect(503); assert.doesNotMatch(failed.text, /sensitive URI/);
});
test('health không tạo session; cookie production yêu cầu HTTPS', async () => {
  const { options, store } = fixture();
  await request(createApp(options)).get('/healthz').expect(200); assert.equal(store.rows.size, 0);
  const page = await request(createApp({ ...options, config: { ...config, production: true } })).get('/').set('X-Forwarded-Proto', 'https').expect(200);
  assert.match(page.headers['set-cookie'][0], /Secure/);
  await request(createApp({ ...options, health: async () => { throw new Error(); } })).get('/healthz').expect(503);
});
