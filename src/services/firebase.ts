import { initializeApp, getApp, getApps } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  getDoc,
  serverTimestamp
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { GameState } from '../types';

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
  }
}

export const isFirebaseConfigured = !!(firebaseConfig && firebaseConfig.apiKey);

let dbInstance: any = null;

if (isFirebaseConfigured) {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId || undefined);
  } catch (error) {
    console.error('Failed to initialize Firebase app or Firestore:', error);
  }
}

export const db = dbInstance;

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
    },
    operationType,
    path
  };
  console.error('Firestore Error Details: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function createRoom(
  roomId: string, 
  games: GameState[], 
  currentGameIndex: number, 
  activeTeam: 'blue' | 'red'
): Promise<void> {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase is not configured for collaborative draft.');
  }

  const normalizedId = roomId.toUpperCase().trim();
  const path = `rooms/${normalizedId}`;
  
  try {
    await setDoc(doc(db, 'rooms', normalizedId), {
      roomId: normalizedId,
      games,
      currentGameIndex,
      activeTeam,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateRoom(
  roomId: string, 
  updates: Partial<{ games: GameState[], currentGameIndex: number, activeTeam: 'blue' | 'red' }>
): Promise<void> {
  if (!isFirebaseConfigured || !db) return;

  const normalizedId = roomId.toUpperCase().trim();
  const path = `rooms/${normalizedId}`;

  try {
    await updateDoc(doc(db, 'rooms', normalizedId), {
      ...updates,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function listenToRoom(
  roomId: string, 
  onUpdate: (data: { games: GameState[], currentGameIndex: number, activeTeam: 'blue' | 'red' }) => void,
  onError: (error: any) => void
) {
  if (!isFirebaseConfigured || !db) {
    onError(new Error('Firebase not configured'));
    return () => {};
  }

  const normalizedId = roomId.toUpperCase().trim();
  const docRef = doc(db, 'rooms', normalizedId);

  return onSnapshot(
    docRef, 
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        onUpdate({
          games: data.games || [],
          currentGameIndex: data.currentGameIndex ?? 0,
          activeTeam: data.activeTeam || 'blue'
        });
      } else {
        onError(new Error('Phòng không tồn tại'));
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, `rooms/${normalizedId}`);
      onError(error);
    }
  );
}

export async function checkRoomExists(roomId: string): Promise<boolean> {
  if (!isFirebaseConfigured || !db) return false;
  const normalizedId = roomId.toUpperCase().trim();
  try {
    const docSnap = await getDoc(doc(db, 'rooms', normalizedId));
    return docSnap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `rooms/${normalizedId}`);
    return false;
  }
}
