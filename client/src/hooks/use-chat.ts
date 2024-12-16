import { useQuery, useMutation } from "@tanstack/react-query";

export function useChat() {
  const getSuggestions = async (matchId: number) => {
    try {
      console.log("Fetching suggestions for matchId:", matchId);
      const res = await fetch(`/api/suggest/${matchId}`, {
        credentials: "include",
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Suggestions API error:", errorText);
        throw new Error(errorText || "Failed to get suggestions");
      }

      const data = await res.json();
      console.log("Received suggestions:", data);
      return data;
    } catch (error) {
      console.error("Error getting suggestions:", error);
      return {
        suggestions: [
          "Tell me more about your interests!",
          "What do you like to do for fun?",
          "Have you traveled anywhere interesting lately?"
        ]
      };
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
    try {
      console.log("Crafting message for suggestion:", suggestion);
      const res = await fetch(`/api/craft-message/${matchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestion }),
        credentials: "include",
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Craft message API error:", errorText);
        throw new Error(errorText || "Failed to craft message");
      }

      const data = await res.json();
      console.log("Received crafted message:", data);
      return data;
    } catch (error) {
      console.error("Error crafting message:", error);
      return { message: suggestion };
    }
  };

  return {
    getSuggestions,
    getEventSuggestions,
    craftMessage,
  };
}
