import {useEffect, useState} from 'react';
import {doc, onSnapshot, setDoc} from 'firebase/firestore';
import {db} from './firebase';
import type {Profile} from '../types';

const EMPTY_PROFILE: Profile = {
  height: null,
  current_weight: null,
  goals: {target_weight: null, target_body_fat: null},
  notes: '',
};

export function useProfile(uid: string | null) {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    const ref = doc(db, 'users', uid, 'profile', 'main');
    const unsubscribe = onSnapshot(ref, (snap) => {
      setProfile(snap.exists() ? {...EMPTY_PROFILE, ...snap.data() as Profile} : EMPTY_PROFILE);
      setLoading(false);
    });
    return unsubscribe;
  }, [uid]);

  async function updateProfile(patch: Partial<Profile>) {
    if (!uid) return;
    const ref = doc(db, 'users', uid, 'profile', 'main');
    await setDoc(ref, {...profile, ...patch}, {merge: true});
  }

  return {profile, loading, updateProfile};
}
