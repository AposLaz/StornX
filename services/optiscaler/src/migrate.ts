import { Database } from '@stornx/platform/database.js';
import { settings } from '@stornx/platform/settings.js';
import { migration } from './journal.js';

const db = new Database(settings('optiscaler'));

try {
  await db.transaction((tx) => tx.query(migration));
} finally {
  await db.pool.end();
}
