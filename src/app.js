import express from 'express';
import { engine } from 'express-handlebars';
import helmet from 'helmet';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sessionMiddleware } from './session.js';
import { prepareBook, ValidationError } from './books.js';
import { authenticate, accountVersion } from './auth.js';

export function createApp({ config, books, store, health = async () => {} }) {
  const app = express();
  if (config.production) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.engine('handlebars', engine({ helpers: { money: value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value) } }));
  app.set('view engine', 'handlebars');
  app.set('views', fileURLToPath(new URL('../views', import.meta.url)));
  app.use('/static', express.static(fileURLToPath(new URL('../public', import.meta.url))));
  app.get('/healthz', async (_req, res) => {
    try { await health(); res.json({ status: 'ok' }); }
    catch { res.status(503).json({ status: 'unavailable' }); }
  });
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));
  app.use(sessionMiddleware(config, store));
  app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const save = req => new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
  const view = { studentName: config.studentName, studentId: config.studentId, prefix: config.prefix, vat: config.vat };
  const csrfValid = req => typeof req.body?._csrf === 'string' && /^[a-f0-9]{64}$/.test(req.body._csrf)
    && typeof req.session.csrf === 'string' && timingSafeEqual(Buffer.from(req.body._csrf), Buffer.from(req.session.csrf));
  app.get('/login', async (req, res) => {
    req.session.csrf ??= randomBytes(32).toString('hex');
    await save(req);
    res.render('login', { ...view, csrf: req.session.csrf });
  });
  app.post('/login', async (req, res) => {
    if (!csrfValid(req)) return res.status(403).render('error', { ...view, message: 'Phiên không hợp lệ. Vui lòng mở lại trang đăng nhập.' });
    const user = await authenticate(config.accounts, req.body.username, req.body.password);
    if (!user) return res.status(401).render('login', { ...view, csrf: req.session.csrf, error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
    await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
    req.session.user = user;
    req.session.csrf = randomBytes(32).toString('hex');
    req.session.startedAt = new Date().toISOString();
    await save(req);
    res.redirect(303, '/');
  });
  app.use((req, res, next) => {
    const user = req.session.user;
    const account = config.accounts.find(a => a.username === user?.username && a.role === user?.role);
    if (!account || user.version !== accountVersion(account)) {
      return req.method === 'GET' ? res.redirect('/login') : res.status(401).render('error', { ...view, message: 'Bạn cần đăng nhập để thực hiện thao tác này.' });
    }
    next();
  });
  app.post('/logout', async (req, res) => {
    if (!csrfValid(req)) return res.sendStatus(403);
    await new Promise((resolve, reject) => req.session.destroy(err => err ? reject(err) : resolve()));
    res.clearCookie('books.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure: config.production });
    res.redirect(303, '/login');
  });
  app.get('/', async (req, res) => {
    req.session.csrf ??= randomBytes(32).toString('hex');
    req.session.startedAt ??= new Date().toISOString();
    const canRead = req.session.user.role === 'reader';
    const list = canRead ? await books.list() : [];
    await save(req);
    res.render('home', { ...view, user: req.session.user, canRead, canWrite: !canRead, books: list, csrf: req.session.csrf,
      startedAt: req.session.startedAt, saved: req.query.saved === '1' });
  });
  app.post('/books', async (req, res) => {
    if (req.session.user.role !== 'writer') return res.status(403).render('error', { ...view, message: 'Tài khoản Reader chỉ được xem sách.' });
    const supplied = typeof req.body._csrf === 'string' ? req.body._csrf : '';
    const expected = req.session.csrf || '';
    if (!expected || !/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      return res.status(403).render('error', { ...view, message: 'Phiên không hợp lệ. Quay lại trang chủ rồi thử lại.' });
    }
    try {
      const book = prepareBook(req.body, config);
      await books.add(book);
      res.redirect(303, '/?saved=1');
    } catch (error) {
      if (error instanceof ValidationError || error.code === 11000) {
        return res.status(error.code === 11000 ? 409 : 400).render('error', {
          ...config, message: error.code === 11000 ? 'Mã sách đã tồn tại. Hãy dùng mã khác.' : error.message,
        });
      }
      throw error;
    }
  });
  app.use((_req, res) => res.status(404).render('error', { ...view, message: 'Không tìm thấy trang.' }));
  app.use((error, _req, res, _next) => {
    const badRequest = error.status === 413 || error.status === 400;
    console.error(badRequest ? 'Invalid request body' : 'Request failed; check Atlas availability and permissions');
    res.status(badRequest ? error.status : 503).render('error', { ...view,
      message: badRequest ? 'Dữ liệu gửi lên không hợp lệ hoặc quá lớn.' : 'Dịch vụ tạm thời không khả dụng. Vui lòng thử lại sau.' });
  });
  return app;
}
