import session from 'express-session';
import MongoStore from 'connect-mongo';

export function createSessionStore(config, sessionClient) {
  // TTL index is provisioned by an administrator, not the runtime account.
  const store = MongoStore.create({
    client: sessionClient, dbName: config.dbName, collectionName: 'sessions',
    autoRemove: 'disabled', ttl: 86400,
  });
  store.on('error', () => console.error('Atlas session store unavailable'));
  return store;
}

export function sessionMiddleware(config, store) {
  if (!store) throw new Error('Bắt buộc cấu hình MongoDB session store');
  return session({
    name: 'books.sid', secret: config.sessionSecret, store,
    resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, secure: config.production, sameSite: 'lax', maxAge: 86400000 },
  });
}
