import {useEffect, useState} from 'react';
import {getDocValue, setDocValue, subscribe} from './localDb';
import type {Profile} from '../types';

const PATH = 'profile';

const EMPTY_PROFILE: Profile = {
  height: null,
  current_weight: null,
  goals: {target_weight: null, target_body_fat: null},
  notes: '',
};

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(() => getDocValue(PATH, EMPTY_PROFILE));

  useEffect(() => {
    setProfile(getDocValue(PATH, EMPTY_PROFILE));
    return subscribe(PATH, () => setProfile(getDocValue(PATH, EMPTY_PROFILE)));
  }, []);

  function updateProfile(patch: Partial<Profile>) {
    setDocValue(PATH, {...getDocValue(PATH, EMPTY_PROFILE), ...patch});
  }

  return {profile, loading: false, updateProfile};
}
