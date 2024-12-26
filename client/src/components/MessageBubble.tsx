import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import styles from "./MessageBubble.module.css";

interface MessageBubbleProps {
  message: {
    id: number;
    content: string;
    createdAt: string;
    sender: {
      id: number;
      username: string;
      name: string;
      avatar: string;
    };
  };
  currentUserId: number | undefined;
  isLastMessage: boolean;
}

export function MessageBubble({ message, currentUserId, isLastMessage }: MessageBubbleProps) {
  const isCurrentUser = message.sender.id === currentUserId;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex ${isCurrentUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[80%] rounded-lg p-3 ${
          isCurrentUser ? styles.currentUserMessage : styles.otherUserMessage
        } ${isLastMessage ? styles.lastMessage : ""}`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium">
            {message.sender.name || message.sender.username}
          </span>
          <span className="text-xs opacity-70">
            {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
          </span>
        </div>
        <p className="text-sm whitespace-pre-wrap break-words">
          {message.content}
        </p>
      </div>
    </motion.div>
  );
}

