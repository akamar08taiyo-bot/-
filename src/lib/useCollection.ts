import {useEffect, useState} from 'react';
import {
  collection,
  onSnapshot,
  query,
  type QueryConstraint,
} from 'firebase/firestore';
import {db} from './firebase';

// Subscribes to users/{uid}/{path} and returns typed docs (id included) plus loading state.
export function useCollection<T>(
  uid: string | null,
  path: string,
  ...constraints: QueryConstraint[]
): {data: T[]; loading: boolean} {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    const ref = collection(db, 'users', uid, path);
    const q = constraints.length ? query(ref, ...constraints) : ref;
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setData(
          snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}) as T),
        );
        setLoading(false);
      },
      (err) => {
        console.error(`users/${uid}/${path} の購読に失敗しました`, err);
        setLoading(false);
      },
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, path]);

  return {data, loading};
}
