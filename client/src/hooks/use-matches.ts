import { useQuery, useMutation } from "@tanstack/react-query";
import type { User, Match, Message } from "@db/schema";

export function useMatches() {
  const { data: matches, isLoading } = useQuery<User[]>({
    queryKey: ["/api/matches"],
  });

  const sendMessage = useMutation({
    mutationFn: async ({ matchId, content }: { matchId: number, content: string }) => {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, content }),
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to send message");
      }

      return res.json();
    },
  });

  const getMessages = async (matchId: number) => {
    const res = await fetch(`/api/messages/${matchId}`, {
      credentials: "include",
    });

    if (!res.ok) {
      throw new Error("Failed to fetch messages");
    }

    return res.json() as Promise<Message[]>;
  };

  return {
    matches,
    isLoading,
    sendMessage: sendMessage.mutateAsync,
    getMessages,
  };
}
