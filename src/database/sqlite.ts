import SQLite from 'react-native-sqlite-storage';

SQLite.enablePromise(true);

const DATABASE_NAME = 'medreminder.db';
let dbInstance: SQLite.SQLiteDatabase | null = null;

export const getDBConnection = async () => {
  if (dbInstance) {
    return dbInstance;
  }

  const db = await SQLite.openDatabase({
    name: DATABASE_NAME,
    location: 'default',
  });

  // Enforce foreign key constraints
  await db.executeSql('PRAGMA foreign_keys = ON;');

  // Save the original close method
  const originalClose = db.close.bind(db);

  // Override close to be a no-op to prevent consumers from closing the shared singleton
  db.close = async () => {
    return Promise.resolve();
  };

  // Attach the original close method in case we ever need to perform a hard close
  (db as SQLite.SQLiteDatabase & { _realClose?: typeof originalClose })._realClose = originalClose;

  dbInstance = db;
  return dbInstance;
};

export const initDatabase = async () => {
  let db: SQLite.SQLiteDatabase | null = null;
  try {
    db = await getDBConnection();
    
    // Create Medication Table
    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS Medication (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        dose TEXT NOT NULL,
        unit TEXT NOT NULL,
        color TEXT NOT NULL,
        notes TEXT,
        foodInstruction TEXT,
        createdAt TEXT NOT NULL
      );
    `);

    // Create Treatment Table
    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS Treatment (
        id TEXT PRIMARY KEY,
        medicationId TEXT NOT NULL,
        frequencyType TEXT NOT NULL,
        intervalHours INTEGER,
        timesPerDay INTEGER,
        daysOfWeek TEXT,
        startDate TEXT NOT NULL,
        startTime TEXT NOT NULL DEFAULT '08:00',
        endDate TEXT,
        isIndefinite INTEGER NOT NULL DEFAULT 1,
        active INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (medicationId) REFERENCES Medication(id) ON DELETE CASCADE
      );
    `);

    // Create TreatmentSchedule Table
    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS TreatmentSchedule (
        id TEXT PRIMARY KEY,
        treatmentId TEXT NOT NULL,
        hour INTEGER NOT NULL,
        minute INTEGER NOT NULL,
        FOREIGN KEY (treatmentId) REFERENCES Treatment(id) ON DELETE CASCADE
      );
    `);

    // Create DoseEvent Table
    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS DoseEvent (
        id TEXT PRIMARY KEY,
        treatmentId TEXT NOT NULL,
        scheduledAt TEXT NOT NULL,
        takenAt TEXT,
        status TEXT NOT NULL,
        snoozedUntil TEXT,
        notificationId TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (treatmentId) REFERENCES Treatment(id) ON DELETE CASCADE
      );
    `);

    // --- MIGRATIONS ---
    // Try adding the new columns if the app was already installed.
    // SQLite doesn't have "ADD COLUMN IF NOT EXISTS" so we catch the error if it already exists.
    try {
      await db.executeSql('ALTER TABLE Medication ADD COLUMN foodInstruction TEXT;');
      console.log('[Database] Migrated Medication table to add foodInstruction');
    } catch (e) { /* Ignore if column exists */ }

    try {
      await db.executeSql("ALTER TABLE Treatment ADD COLUMN startTime TEXT NOT NULL DEFAULT '08:00';");
      console.log('[Database] Migrated Treatment table to add startTime');
    } catch (e) { /* Ignore if column exists */ }
    // -------------------

    console.log('[Database] Database tables initialized successfully.');
  } catch (error) {
    console.error('[Database] Failed to initialize database:', error);
    throw error;
  } finally {
    if (db) {
      await db.close();
    }
  }
};
