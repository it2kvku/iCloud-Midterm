import { loadConfig } from './config.js';
import { connectDatabases } from './database.js';
import { createSessionStore } from './session.js';
import { createApp } from './app.js';

let database;
try {
  const config = loadConfig();
  database = await connectDatabases(config);
  const store = createSessionStore(config, database.sessionClient);
  const app = createApp({ config, books: database.books, store, health: database.health });
  const server = app.listen(config.port, '0.0.0.0', () => console.log(`Books app listening on port ${config.port}`));
  server.on('error', async () => { console.error('Cannot start HTTP server'); await database.close(); process.exit(1); });
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => process.exit(1), 10000); timeout.unref();
    server.close(async () => { await database.close(); clearTimeout(timeout); process.exit(0); });
  };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
} catch (error) {
  // Configuration errors contain only field names; database errors are sanitized.
  console.error(error.message);
  if (database) await database.close();
  process.exitCode = 1;
}
