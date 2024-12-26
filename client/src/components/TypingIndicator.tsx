import React from "react";
import { motion } from "framer-motion";
import styles from "./TypingIndicator.module.css";

export function TypingIndicator() {
  return (
    <div className={styles.typingIndicator}>
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          transition: { repeat: Infinity, duration: 0.75 }
        }}
        className={styles.dot}
      />
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          transition: { repeat: Infinity, duration: 0.75, delay: 0.25 }
        }}
        className={styles.dot}
      />
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          transition: { repeat: Infinity, duration: 0.75, delay: 0.5 }
        }}
        className={styles.dot}
      />
    </div>
  );
}

