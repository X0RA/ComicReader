import { db } from '../lib/dexieDB';
import * as downloads from '../lib/downloads';
import * as maintenance from '../lib/archiveMaintenance';
import * as archives from '../lib/archiveStore';
import * as bookmarks from '../lib/bookmarks';
Object.assign(window, { storageTest: { db, ...downloads, ...maintenance, ...archives, ...bookmarks } });
