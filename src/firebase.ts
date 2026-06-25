/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection as originalCollection, 
  doc as originalDoc, 
  setDoc as originalSetDoc, 
  getDoc as originalGetDoc, 
  getDocs as originalGetDocs, 
  updateDoc as originalUpdateDoc, 
  deleteDoc as originalDeleteDoc, 
  query as originalQuery, 
  where, 
  orderBy,
  onSnapshot as originalOnSnapshot,
  Firestore
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously as originalSignInAnonymously, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  Auth,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App
const app = initializeApp({
  apiKey: firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket,
  messagingSenderId: firebaseConfig.messagingSenderId,
  appId: firebaseConfig.appId,
});

// Initialize Firestore with custom databaseId if specified
const db: Firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');

// Initialize Auth
const auth: Auth = getAuth(app);

// Standardized Firestore Error Handling based on firebase-integration skill
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// State to track if we should fall back to Local Storage
let isLocalFallback = false;

export function enableLocalFallback() {
  isLocalFallback = true;
}

export function disableLocalFallback() {
  isLocalFallback = false;
}

export function getLocalFallbackStatus() {
  return isLocalFallback;
}

// Wrapping functions to support Local Fallback

export function collection(firestore: any, path: string, ...pathSegments: string[]) {
  const ref = originalCollection(firestore, path, ...pathSegments);
  (ref as any).__collectionPath = path;
  return ref;
}

export function doc(firestoreOrCollection: any, path?: string, ...pathSegments: string[]) {
  let ref;
  if (typeof firestoreOrCollection === 'string') {
    ref = originalDoc(db, firestoreOrCollection, ...pathSegments);
  } else {
    if (path === undefined) {
      ref = originalDoc(firestoreOrCollection);
    } else {
      ref = originalDoc(firestoreOrCollection, path, ...pathSegments);
    }
  }
  return ref;
}

export function query(q: any, ...queryConstraints: any[]) {
  const ref = originalQuery(q, ...queryConstraints);
  (ref as any).__collectionPath = q.path || q.__collectionPath;
  return ref;
}

// Active Snapshot Listeners Registry
type SnapshotCallback = (snapshot: any) => void;
type SnapshotErrorCallback = (error: any) => void;

const activeListeners = new Set<{
  path: string;
  isQuery: boolean;
  callback: SnapshotCallback;
  errorCallback?: SnapshotErrorCallback;
}>();

function getMockSnapshot(path: string, isQuery: boolean) {
  if (!isQuery) {
    // Document snapshot
    const parts = path.split('/');
    const collectionName = parts[0];
    const docId = parts[1];

    let data: any = null;
    if (collectionName === 'userStats') {
      const statsStr = localStorage.getItem(`zerohour_userStats_${docId}`);
      data = statsStr ? JSON.parse(statsStr) : null;
    } else if (collectionName === 'settings') {
      const settingsStr = localStorage.getItem(`zerohour_settings_${docId}`);
      data = settingsStr ? JSON.parse(settingsStr) : null;
    } else if (collectionName === 'tasks') {
      const tasksStr = localStorage.getItem('zerohour_tasks');
      const tasks = tasksStr ? JSON.parse(tasksStr) : [];
      data = tasks.find((t: any) => t.id === docId) || null;
    }

    return {
      exists: () => data !== null,
      data: () => data,
      id: docId,
    };
  } else {
    // Collection / Query Snapshot
    let docs: any[] = [];
    if (path === 'tasks') {
      const tasksStr = localStorage.getItem('zerohour_tasks');
      let tasks = tasksStr ? JSON.parse(tasksStr) : [];
      tasks = tasks.filter((t: any) => t.userId === 'local-guest');
      // Sort desc by createdAt
      tasks.sort((a: any, b: any) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      docs = tasks.map((task: any) => ({
        exists: () => true,
        data: () => task,
        id: task.id,
      }));
    }

    return {
      empty: docs.length === 0,
      size: docs.length,
      docs,
      forEach: (callback: any) => {
        docs.forEach(callback);
      },
    };
  }
}

function notifyListeners(collectionPath: string) {
  for (const listener of activeListeners) {
    if (listener.path === collectionPath || listener.path.startsWith(collectionPath + '/')) {
      try {
        const snap = getMockSnapshot(listener.path, listener.isQuery);
        listener.callback(snap);
      } catch (err) {
        if (listener.errorCallback) listener.errorCallback(err);
      }
    }
  }
}

export function onSnapshot(
  ref: any,
  callback: SnapshotCallback,
  errorCallback?: SnapshotErrorCallback
) {
  if (!isLocalFallback) {
    const path = ref.path || ref.__collectionPath || null;
    const opType = ref.path ? OperationType.GET : OperationType.LIST;
    return originalOnSnapshot(
      ref,
      callback,
      (error) => {
        if (errorCallback) {
          try {
            handleFirestoreError(error, opType, path);
          } catch (wrappedErr) {
            errorCallback(wrappedErr);
          }
        } else {
          handleFirestoreError(error, opType, path);
        }
      }
    );
  }

  const path = ref.path || ref.__collectionPath;
  const isQuery = !ref.path && !!ref.__collectionPath;

  const listener = { path, isQuery, callback, errorCallback };
  activeListeners.add(listener);

  // Deliver initial snapshot
  setTimeout(() => {
    try {
      const snap = getMockSnapshot(path, isQuery);
      callback(snap);
    } catch (err) {
      if (errorCallback) errorCallback(err);
    }
  }, 0);

  return () => {
    activeListeners.delete(listener);
  };
}

export async function setDoc(docRef: any, data: any, options?: any) {
  if (!isLocalFallback) {
    try {
      return await originalSetDoc(docRef, data, options);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, docRef.path || null);
    }
  }

  const path = docRef.path;
  const parts = path.split('/');
  const collectionName = parts[0];
  const docId = parts[1];

  if (collectionName === 'userStats') {
    localStorage.setItem(`zerohour_userStats_${docId}`, JSON.stringify(data));
  } else if (collectionName === 'settings') {
    localStorage.setItem(`zerohour_settings_${docId}`, JSON.stringify(data));
  } else if (collectionName === 'tasks') {
    const tasksStr = localStorage.getItem('zerohour_tasks');
    let tasks = tasksStr ? JSON.parse(tasksStr) : [];
    tasks = tasks.filter((t: any) => t.id !== docId);
    tasks.push(data);
    localStorage.setItem('zerohour_tasks', JSON.stringify(tasks));
  }

  notifyListeners(collectionName);
}

export async function updateDoc(docRef: any, data: any) {
  if (!isLocalFallback) {
    try {
      return await originalUpdateDoc(docRef, data);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, docRef.path || null);
    }
  }

  const path = docRef.path;
  const parts = path.split('/');
  const collectionName = parts[0];
  const docId = parts[1];

  if (collectionName === 'userStats') {
    const statsStr = localStorage.getItem(`zerohour_userStats_${docId}`);
    const existing = statsStr ? JSON.parse(statsStr) : {};
    const updated = { ...existing, ...data };
    localStorage.setItem(`zerohour_userStats_${docId}`, JSON.stringify(updated));
  } else if (collectionName === 'settings') {
    const settingsStr = localStorage.getItem(`zerohour_settings_${docId}`);
    const existing = settingsStr ? JSON.parse(settingsStr) : {};
    const updated = { ...existing, ...data };
    localStorage.setItem(`zerohour_settings_${docId}`, JSON.stringify(updated));
  } else if (collectionName === 'tasks') {
    const tasksStr = localStorage.getItem('zerohour_tasks');
    let tasks = tasksStr ? JSON.parse(tasksStr) : [];
    tasks = tasks.map((t: any) => {
      if (t.id === docId) {
        return { ...t, ...data };
      }
      return t;
    });
    localStorage.setItem('zerohour_tasks', JSON.stringify(tasks));
  }

  notifyListeners(collectionName);
}

export async function deleteDoc(docRef: any) {
  if (!isLocalFallback) {
    try {
      return await originalDeleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, docRef.path || null);
    }
  }

  const path = docRef.path;
  const parts = path.split('/');
  const collectionName = parts[0];
  const docId = parts[1];

  if (collectionName === 'tasks') {
    const tasksStr = localStorage.getItem('zerohour_tasks');
    let tasks = tasksStr ? JSON.parse(tasksStr) : [];
    tasks = tasks.filter((t: any) => t.id !== docId);
    localStorage.setItem('zerohour_tasks', JSON.stringify(tasks));
  }

  notifyListeners(collectionName);
}

export async function getDoc(docRef: any) {
  if (!isLocalFallback) {
    try {
      return await originalGetDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, docRef.path || null);
    }
  }

  const path = docRef.path;
  const parts = path.split('/');
  const collectionName = parts[0];
  const docId = parts[1];

  let data: any = null;
  if (collectionName === 'userStats') {
    const statsStr = localStorage.getItem(`zerohour_userStats_${docId}`);
    data = statsStr ? JSON.parse(statsStr) : null;
  } else if (collectionName === 'settings') {
    const settingsStr = localStorage.getItem(`zerohour_settings_${docId}`);
    data = settingsStr ? JSON.parse(settingsStr) : null;
  } else if (collectionName === 'tasks') {
    const tasksStr = localStorage.getItem('zerohour_tasks');
    const tasks = tasksStr ? JSON.parse(tasksStr) : [];
    data = tasks.find((t: any) => t.id === docId) || null;
  }

  return {
    exists: () => data !== null,
    data: () => data,
    id: docId,
  };
}

export async function getDocs(queryRef: any) {
  if (!isLocalFallback) {
    try {
      return await originalGetDocs(queryRef);
    } catch (error) {
      const path = queryRef.path || queryRef.__collectionPath || null;
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  const collectionPath = queryRef.path || queryRef.__collectionPath;
  let docs: any[] = [];

  if (collectionPath === 'tasks') {
    const tasksStr = localStorage.getItem('zerohour_tasks');
    const tasks = tasksStr ? JSON.parse(tasksStr) : [];
    docs = tasks
      .filter((t: any) => t.userId === 'local-guest')
      .map((t: any) => ({
        exists: () => true,
        data: () => t,
        id: t.id,
      }));
  }

  return {
    empty: docs.length === 0,
    size: docs.length,
    docs,
    forEach: (callback: any) => {
      docs.forEach(callback);
    },
  };
}

export async function signInAnonymously(authObj: any) {
  return originalSignInAnonymously(authObj);
}

export {
  app,
  db,
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  where,
  orderBy,
  signInWithPopup,
  GoogleAuthProvider,
};
