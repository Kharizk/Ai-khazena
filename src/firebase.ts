import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, browserLocalPersistence, inMemoryPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

let auth;
try {
  auth = getAuth(app);
} catch (e) {
  try {
    auth = initializeAuth(app, { persistence: inMemoryPersistence });
  } catch (e2) {
    auth = null;
  }
}
export { auth };

let db;
try {
  db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
} catch (e) {
  db = null;
}
export { db };
