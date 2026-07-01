import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, browserLocalPersistence, inMemoryPersistence } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

let auth;
try {
  auth = getAuth(app);
} catch (e) {
  try {
    auth = initializeAuth(app, { persistence: browserLocalPersistence });
  } catch (e2) {
    auth = null;
  }
}
export { auth };

let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  }, firebaseConfig.firestoreDatabaseId);
} catch (e) {
  try {
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  } catch (e2) {
    db = null;
  }
}
export { db };
