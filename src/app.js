import express from 'express';
import { engine } from 'express-handlebars';
import helmet from 'helmet';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sessionMiddleware } from './session.js';
import { prepareBook, ValidationError } from './books.js';

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
  app.get('/', async (req, res) => {
    req.session.csrf ??= randomBytes(32).toString('hex');
    req.session.startedAt ??= new Date().toISOString();
    const list = await books.list();
    await save(req);
    res.render('home', { ...config, books: list, csrf: req.session.csrf,
      startedAt: req.session.startedAt, saved: req.query.saved === '1' });
  });
  app.post('/books', async (req, res) => {
    const supplied = typeof req.body._csrf === 'string' ? req.body._csrf : '';
    const expected = req.session.csrf || '';
    if (!expected || !/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      return res.status(403).render('error', { ...config, message: 'Phiên không hợp lệ. Quay lại trang chủ rồi thử lại.' });
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
  app.use((_req, res) => res.status(404).render('error', { ...config, message: 'Không tìm thấy trang.' }));
  app.use((error, _req, res, _next) => {
    const badRequest = error.status === 413 || error.status === 400;
    console.error(badRequest ? 'Invalid request body' : 'Request failed; check Atlas availability and permissions');
    res.status(badRequest ? error.status : 503).render('error', { ...config,
      message: badRequest ? 'Dữ liệu gửi lên không hợp lệ hoặc quá lớn.' : 'Dịch vụ tạm thời không khả dụng. Vui lòng thử lại sau.' });
  });
  return app;
}
