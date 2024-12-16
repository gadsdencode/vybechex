import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { Message, User } from "@db/schema";

interface ChatMessageProps {
  message: Message;
  currentUser: User;
  className?: string;
}

export function ChatMessage({ message, currentUser, className }: ChatMessageProps) {
  const isCurrentUser = message.senderId === currentUser.id;
  
  return (
    <div
      className={cn(
        "flex",
        isCurrentUser ? "justify-end" : "justify-start",
        className
      )}
    >
      <Card
        className={cn(
          "max-w-[80%] p-4",
          isCurrentUser
            ? "bg-primary text-primary-foreground"
            : "bg-card text-card-foreground",
        )}
      >
        <div className="space-y-1">
          <p className="text-sm break-words">{message.content}</p>
          <p className="text-xs opacity-70">
            {format(new Date(message.createdAt), "HH:mm")}
          </p>
        </div>
      </Card>
    </div>
  );
}
