import {useEffect, useState} from 'react';
import {getCollection, subscribe} from './localDb';

// この端末のlocalStorage（health-app:{path}）を購読する。
export function useCollection<T>(path: string): {data: T[]; loading: boolean} {
  const [data, setData] = useState<T[]>(() => getCollection<T>(path));

  useEffect(() => {
    setData(getCollection<T>(path));
    return subscribe(path, () => setData(getCollection<T>(path)));
  }, [path]);

  return {data, loading: false};
}
