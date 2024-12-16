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

  return {
    getSuggestions,
  };
}
