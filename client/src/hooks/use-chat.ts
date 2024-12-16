import { useQuery, useMutation } from "@tanstack/react-query";

export function useChat() {
  const getSuggestions = async (matchId: number) => {
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
        credentials: "include",
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Failed to get suggestions");
      }

      const data = await res.json();
      return data;
    } catch (error) {
      console.error("Error getting suggestions:", error);
      return { suggestions: [
        "Tell me more about your interests!",
        "What do you like to do for fun?",
        "Have you traveled anywhere interesting lately?"
      ]};
    }
  };

  const getEventSuggestions = async (matchId: number) => {
    try {
      console.log("Fetching event suggestions for matchId:", matchId);
      const res = await fetch(`/api/event-suggestions/${matchId}`, {
        credentials: "include",
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Event suggestions API error:", errorText);
        throw new Error(errorText || "Failed to get event suggestions");
      }

      const data = await res.json();
      console.log("Received event suggestions:", data);
      return data;
    } catch (error) {
      console.error("Error fetching event suggestions:", error);
      // Return fallback suggestions in the exact same format as the API
      return {
        suggestions: [
          {
            title: "Coffee Chat",
            description: "Meet at a local café for a relaxed conversation over coffee or tea.",
            compatibility: 85
          },
          {
            title: "Nature Walk",
            description: "Take a refreshing walk in a nearby park or nature trail.",
            compatibility: 80
          },
          {
            title: "Board Game Café",
            description: "Visit a board game café and enjoy some friendly competition.",
            compatibility: 75
          }
        ]
      };
    }
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
