"use client";
import { useEffect, useState } from "react";
import { localDay, nextLocalMidnight } from "@/lib/domain/daily-events";

export function useLocalDay() {
  const [day, setDay] = useState(() => localDay());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function check() {
      clearTimeout(timer);
      setDay(localDay());
      timer = setTimeout(
        check,
        Math.max(
          1,
          Date.parse(nextLocalMidnight(new Date())) - Date.now() + 50,
        ),
      );
    }
    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return day;
}
