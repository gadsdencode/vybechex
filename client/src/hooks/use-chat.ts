import { useQuery, useMutation } from "@tanstack/react-query";

export function useChat() {
  const getSuggestions = async (matchId: number) => {
    const res = await fetch("/api/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId }),
      credentials: "include",
    });

    if (!res.ok) {
      throw new Error("Failed to get suggestions");
    }

    return res.json();
  };

  const getEventSuggestions = async (matchId: number) => {
    const res = await fetch(`/api/event-suggestions/${matchId}`, {
      credentials: "include",
    });

    if (!res.ok) {
      throw new Error("Failed to get event suggestions");
    }

    return res.json();
  };

  const craftMessage = async (matchId: number, suggestion: string) => {
    const res = await fetch("/api/craft-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, suggestion }),
      credentials: "include",
    });

    if (!res.ok) {
      throw new Error("Failed to craft message");
    }

    return res.json();
  };

  return {
    getSuggestions,
    getEventSuggestions,
    craftMessage,
  };
}
