/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';

/**
 * 管理每秒递增计时器的自定义 Hook
 * @param isActive - 计时器是否应该运行
 * @param resetKey - 一个键，更改时将重置计时器为 0 并重新启动间隔
 * @returns 经过的时间（秒）
 */
export const useTimer = (isActive: boolean, resetKey: unknown) => {
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const prevResetKeyRef = useRef(resetKey);
  const prevIsActiveRef = useRef(isActive);

  useEffect(() => {
    let shouldResetTime = false;

    if (prevResetKeyRef.current !== resetKey) {
      shouldResetTime = true;
      prevResetKeyRef.current = resetKey;
    }

    if (prevIsActiveRef.current === false && isActive) {
      // Transitioned from inactive to active
      shouldResetTime = true;
    }

    if (shouldResetTime) {
      setElapsedTime(0);
    }
    prevIsActiveRef.current = isActive;

    // Manage interval
    if (isActive) {
      // Clear previous interval unconditionally before starting a new one
      // This handles resetKey changes while active, ensuring a fresh interval start.
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isActive, resetKey]);

  return elapsedTime;
};
