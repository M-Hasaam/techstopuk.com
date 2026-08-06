"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface LayoutTextFlipProps {
  text?: string;
  words: string[];
  duration?: number;
  className?: string;
  wordClassName?: string;
}

export function LayoutTextFlip({
  text,
  words,
  duration = 2200,
  className = "",
  wordClassName = "",
}: LayoutTextFlipProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!words || words.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % words.length);
    }, duration);
    return () => clearInterval(timer);
  }, [words, duration]);

  return (
    <span className={`inline-flex items-center gap-1.5 align-baseline ${className}`}>
      {text && <span>{text}</span>}
      <span className="relative inline-flex overflow-hidden h-[1.15em] align-baseline">
        <AnimatePresence mode="wait">
          <motion.span
            key={words[index]}
            initial={{ y: "100%", opacity: 0, rotateX: -60 }}
            animate={{ y: "0%", opacity: 1, rotateX: 0 }}
            exit={{ y: "-100%", opacity: 0, rotateX: 60 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className={`inline-block font-black ${wordClassName}`}
          >
            {words[index]}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  );
}
