import {initializeApp, type FirebaseApp} from 'firebase/app';
import {getAuth, signInAnonymously, onAuthStateChanged, type Auth, type User} from 'firebase/auth';
import {getFirestore, type Firestore} from 'firebase/firestore';
import {getFunctions, type Functions} from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId,
);

// .env.local が無い/不正な場合でもアプリ全体をクラッシュさせず、
// App側で設定案内画面を出せるよう初期化失敗を握りつぶす。
let initializedApp: FirebaseApp | undefined;
let initializedAuth: Auth | undefined;
let initializedDb: Firestore | undefined;
let initializedFunctions: Functions | undefined;
let initError: unknown;

if (isFirebaseConfigured) {
  try {
    initializedApp = initializeApp(firebaseConfig);
    initializedAuth = getAuth(initializedApp);
    initializedDb = getFirestore(initializedApp);
    initializedFunctions = getFunctions(initializedApp, 'asia-northeast1');
  } catch (err) {
    initError = err;
  }
}

export const app = initializedApp;

// db/functions は認証成功後の画面（Firebase設定済みの場合のみ到達する）でしか使われないため、
// 呼び出し側の型を煩雑にしないよう non-null として export する。
export const db = initializedDb as Firestore;
export const functions = initializedFunctions as Functions;

// 本人専用アプリのためログイン画面は設けず、匿名認証を自動的に行う（10-1）。
// Firebase未設定または初期化失敗の場合は onError を呼び、呼び出し側で案内表示に切り替える。
export function ensureAnonymousAuth(
  onReady: (user: User) => void,
  onError: (err: unknown) => void,
): () => void {
  const auth = initializedAuth;
  if (!auth) {
    onError(initError ?? new Error('Firebase設定（.env.local）が見つかりません'));
    return () => {};
  }
  const unsubscribe = onAuthStateChanged(
    auth,
    (user) => {
      if (user) {
        onReady(user);
      } else {
        signInAnonymously(auth).catch(onError);
      }
    },
    onError,
  );
  return unsubscribe;
}
