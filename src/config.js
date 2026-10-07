export function loadConfig(env = process.env) {
  const required = ['STUDENT_NAME', 'STUDENT_ID', 'MONGODB_READ_URI', 'MONGODB_WRITE_URI', 'MONGODB_SESSION_URI', 'SESSION_SECRET'];
  for (const key of required) if (!env[key]?.trim()) throw new Error(`Thiếu biến môi trường ${key}`);
  const id = env.STUDENT_ID.trim();
  if (!/^[A-Za-z0-9]*\d{3}$/.test(id)) throw new Error('MSSV phải kết thúc bằng ít nhất 3 chữ số');
  if (env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET cần ít nhất 32 ký tự');
  const uris = [env.MONGODB_READ_URI, env.MONGODB_WRITE_URI, env.MONGODB_SESSION_URI];
  const users = uris.map(uri => {
    let url;
    try { url = new URL(uri); } catch { throw new Error('URI MongoDB không hợp lệ'); }
    if (!['mongodb:', 'mongodb+srv:'].includes(url.protocol) || !url.username || !url.password) throw new Error('URI MongoDB cần tài khoản và mật khẩu');
    return url.username;
  });
  if (new Set(users).size !== 3) throw new Error('Cần ba tài khoản độc lập cho đọc, ghi và session');
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT không hợp lệ');
  return {
    studentName: env.STUDENT_NAME.trim(), studentId: id, dbName: `DB_${id}`,
    prefix: id.slice(-3), vat: Number(id.at(-1)) + 6,
    readUri: uris[0], writeUri: uris[1], sessionUri: uris[2],
    sessionSecret: env.SESSION_SECRET, production: env.NODE_ENV === 'production', port,
  };
}
