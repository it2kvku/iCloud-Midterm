// Run with an ADMINISTRATIVE account in mongosh, never with runtime users.
// mongosh "<Atlas URI supplied privately>" --file scripts/atlas-init.mongodb.js
const target = db.getSiblingDB('DB_23IT139');
if (!target.getCollectionNames().includes('books')) target.createCollection('books');
if (!target.getCollectionNames().includes('sessions')) target.createCollection('sessions');
target.books.createIndex({ code: 1 }, { unique: true, name: 'unique_book_code' });
target.books.createIndex({ createdAt: -1 }, { name: 'recent_books' });
target.sessions.createIndex({ expires: 1 }, { expireAfterSeconds: 0, name: 'session_expiry' });
print('Initialized books and sessions collections and indexes.');
