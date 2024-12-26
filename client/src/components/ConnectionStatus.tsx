import { motion } from "framer-motion";
import styles from "./ConnectionStatus.module.css";

interface ConnectionStatusProps {
  isConnected: boolean;
}

export function ConnectionStatus({ isConnected }: ConnectionStatusProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`${styles.connectionStatus} ${
        isConnected ? styles.connected : styles.disconnected
      }`}
    >
      {isConnected ? "Connected" : "Disconnected"}
    </motion.div>
  );
}

