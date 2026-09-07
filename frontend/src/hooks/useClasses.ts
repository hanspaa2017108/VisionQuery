"use client";

import { useEffect, useState } from "react";
import { resolveClasses } from "@/lib/api";

export function useClasses(prompt: string) {
  const [promptClasses, setPromptClasses] = useState<string[]>([]);
  const [classesBusy, setClassesBusy] = useState(false);

  useEffect(() => {
    const p = (prompt || "").trim();
    if (!p) {
      setPromptClasses([]);
      return;
    }

    const controller = new AbortController();
    setClassesBusy(true);

    const t = setTimeout(async () => {
      try {
        const data = await resolveClasses(p, { signal: controller.signal });
        const classes = Array.isArray(data?.classes) ? data.classes : [];
        setPromptClasses(classes);
      } catch {
        setPromptClasses([]);
      } finally {
        setClassesBusy(false);
      }
    }, 450);

    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [prompt]);

  // Fallback: if no LLM classes, comma-split the prompt
  const displayClasses =
    promptClasses.length > 0
      ? promptClasses
      : (prompt || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 10);

  return { promptClasses, displayClasses, classesBusy };
}
