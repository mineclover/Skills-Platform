import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";

/** Each visit gets a new token, including A → B → A. Older visits cannot publish. */
export function createContextGate() {
  let key: string | undefined;
  let context = 0;
  let request = 0;
  return {
    enter(nextKey: string) {
      if (key !== nextKey) {
        key = nextKey;
        context += 1;
        request += 1;
      }
      return context;
    },
    isCurrent(token: number) { return token === context; },
    start(token: number) {
      if (token !== context) return () => false;
      const ticket = ++request;
      return () => token === context && ticket === request;
    },
  };
}

function useMounted() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return mounted;
}

/** Hide previous-context values in the transition render, before effects run. */
export function useContextValue<T>(key: string, initial: T) {
  const gate = useRef(createContextGate()).current;
  const token = gate.enter(key);
  const mounted = useMounted();
  const initialValue = useRef(initial).current;
  const [snapshot, setSnapshot] = useState({ token, value: initialValue });
  const setValue = useCallback((next: SetStateAction<T>) => {
    if (!mounted.current || !gate.isCurrent(token)) return;
    setSnapshot((previous) => {
      if (!mounted.current || !gate.isCurrent(token)) return previous;
      const value = previous.token === token ? previous.value : initialValue;
      return { token, value: typeof next === "function" ? (next as (value: T) => T)(value) : next };
    });
  }, [gate, token, mounted, initialValue]);
  return [snapshot.token === token ? snapshot.value : initialValue, setValue] as const;
}

/** Reject late responses both across contexts and from overlapping refreshes. */
export function useLatestRequest(key: string) {
  const gate = useRef(createContextGate()).current;
  const token = gate.enter(key);
  const mounted = useMounted();
  return useCallback(() => {
    const current = gate.start(token);
    return () => mounted.current && current();
  }, [gate, token, mounted]);
}
