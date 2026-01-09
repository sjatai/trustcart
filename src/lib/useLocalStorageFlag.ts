"use client";

import { useEffect, useState } from "react";

export function useLocalStorageFlag(
  key: string,
  defaultValue: boolean
): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState<boolean>(defaultValue);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) {
        window.localStorage.setItem(key, defaultValue ? "true" : "false");
        setValue(defaultValue);
        return;
      }
      setValue(raw === "true");
    } catch {
      setValue(defaultValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setAndPersist = (v: boolean) => {
    setValue(v);
    try {
      window.localStorage.setItem(key, v ? "true" : "false");
    } catch {}
  };

  return [value, setAndPersist];
}


