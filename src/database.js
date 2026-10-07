import { MongoClient } from 'mongodb';
import { createBooksRepository } from './books.js';

export async function connectDatabases(config) {
  const options = { maxPoolSize: 10, serverSelectionTimeoutMS: 10000 };
  const clients = [config.readUri, config.writeUri, config.sessionUri].map(uri => new MongoClient(uri, options));
  const results = await Promise.allSettled(clients.map(client => client.connect()));
  if (results.some(result => result.status === 'rejected')) {
    await Promise.allSettled(clients.map(client => client.close()));
    throw new Error('Không thể kết nối Atlas. Kiểm tra URI, quyền và Network Access.');
  }
  const [reader, writer, sessionClient] = clients;
  return {
    books: createBooksRepository(reader.db(config.dbName), writer.db(config.dbName)),
    sessionClient,
    health: () => Promise.all(clients.map(client => client.db(config.dbName).command({ ping: 1 }))),
    close: () => Promise.allSettled(clients.map(client => client.close())),
  };
}
