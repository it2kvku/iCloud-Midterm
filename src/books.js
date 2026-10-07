export class ValidationError extends Error {}

export function prepareBook(input, config) {
  const code = typeof input.code === 'string' ? input.code.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const author = typeof input.author === 'string' ? input.author.trim() : '';
  if (!code.startsWith(config.prefix) || !/^[A-Za-z0-9_-]{3,40}$/.test(code)) {
    throw new ValidationError(`Mã sách phải bắt đầu bằng ${config.prefix}, dài tối đa 40 ký tự, chỉ gồm chữ, số, _ hoặc -.`);
  }
  if (!title || title.length > 200 || !author || author.length > 120) throw new ValidationError('Tên sách (tối đa 200 ký tự) và tác giả (tối đa 120 ký tự) là bắt buộc.');
  const rawPrice = typeof input.price === 'string' ? input.price.trim() : '';
  if (!/^\d{1,9}$/.test(rawPrice) || Number(rawPrice) < 1) throw new ValidationError('Giá phải là số nguyên từ 1 đến 999.999.999 đồng.');
  const price = Number(rawPrice);
  const tax = Math.round(price * config.vat / 100);
  return { code, title, author, price, vat: config.vat, tax, total: price + tax, createdAt: new Date() };
}

export function createBooksRepository(readDb, writeDb) {
  return {
    list: () => readDb.collection('books').find({}).sort({ createdAt: -1 }).limit(100).toArray(),
    add: book => writeDb.collection('books').insertOne(book),
  };
}
