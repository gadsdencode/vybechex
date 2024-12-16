interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const OPENAI_API_ENDPOINT = "https://api.openai.com/v1/chat/completions";

export async function getChatCompletion(messages: ChatMessage[]) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const response = await fetch(OPENAI_API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages,
      temperature: 0.7,
      max_tokens: 150,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

export async function craftMessageFromSuggestion(
  suggestion: string,
  userPersonality: Record<string, number>,
  matchPersonality: Record<string, number>
) {
  const messages = [
    {
      role: "system",
      content: `You are a friendly conversation assistant crafting natural messages for a friendship matching platform.
      Create a warm, authentic message that sounds like it's coming from a real person who wants to make friends.
      Consider personality traits to adapt the tone and style of the message:
      - High extraversion: More enthusiastic, energetic tone
      - Low extraversion: More thoughtful, measured approach
      - High communication: More detailed, expressive language
      - High openness: More creative, curious phrasing
      - High values: More emphasis on shared interests and beliefs
      The message should be 2-3 sentences long, friendly but not overly familiar.`
    },
    {
      role: "user",
      content: `Here are the personality traits to consider:
      
      My traits:
      ${Object.entries(userPersonality)
        .map(([trait, score]) => `${trait}: ${Math.round(score * 100)}%`)
        .join("\n")}
      
      Their traits:
      ${Object.entries(matchPersonality)
        .map(([trait, score]) => `${trait}: ${Math.round(score * 100)}%`)
        .join("\n")}
      
      Please craft a natural, friendly message based on this conversation starter: "${suggestion}"
      Make it feel authentic and aligned with my personality traits while being mindful of their traits.`
    }
  ];

  try {
    const response = await getChatCompletion(messages);
    return response.replace(/^["']|["']$/g, ''); // Remove any quotes if present
  } catch (error) {
    console.error("Error crafting message:", error);
    return suggestion; // Fallback to original suggestion if API fails
  }
}

export interface EventSuggestion {
  title: string;
  description: string;
  compatibility: number; // 0-100 score of how well this matches both users
}

export async function generateEventSuggestions(
  userPersonality: Record<string, number>,
  matchPersonality: Record<string, number>
): Promise<EventSuggestion[]> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are an event planning assistant helping to suggest activities for potential friends to do together.
      Consider both users' personality traits when making suggestions.
      Focus on activities that would help build genuine connections.
      Keep suggestions practical and specific to their traits.
      Return exactly 3 suggestions, each with a title and detailed description.`
    },
    {
      role: "user",
      content: `Generate event suggestions for two users with these personality traits:

      User 1 traits:
      ${Object.entries(userPersonality)
        .map(([trait, score]) => `${trait}: ${Math.round(score * 100)}%`)
        .join("\n")}
      
      User 2 traits:
      ${Object.entries(matchPersonality)
        .map(([trait, score]) => `${trait}: ${Math.round(score * 100)}%`)
        .join("\n")}
      
      Suggest 3 activities they might enjoy together based on their compatibility and traits.
      Consider their extraversion levels, communication styles, and other traits.
      Format each suggestion with a title and detailed description.`
    }
  ];

  try {
    const completion = await getChatCompletion(messages);
    
    // Parse the completion into structured suggestions
    const suggestions = completion
      .split(/\d\./)
      .filter(Boolean)
      .map(suggestion => {
        const [title, ...descriptionParts] = suggestion.trim().split('\n');
        const description = descriptionParts.join('\n').trim();
        
        // Calculate compatibility score based on relevant traits
        const compatibilityFactors = {
          extraversion: 1 - Math.abs(userPersonality.extraversion - matchPersonality.extraversion),
          communication: 1 - Math.abs(userPersonality.communication - matchPersonality.communication),
          openness: 1 - Math.abs(userPersonality.openness - matchPersonality.openness),
        };
        
        const compatibility = Math.round(
          (Object.values(compatibilityFactors).reduce((sum, score) => sum + score, 0) / 
          Object.keys(compatibilityFactors).length) * 100
        );

        return {
          title: title.replace(/^[-*]\s*/, ''),
          description: description,
          compatibility
        };
      })
      .slice(0, 3);

    return suggestions;
  } catch (error) {
    console.error("Error generating event suggestions:", error);
    // Fallback suggestions if OpenAI API fails
    return [
      {
        title: "Coffee and Conversation",
        description: "Meet at a local café for casual conversation and getting to know each other better.",
        compatibility: 80
      },
      {
        title: "Local Park Walk",
        description: "Take a relaxing walk in a nearby park while discussing shared interests.",
        compatibility: 75
      },
      {
        title: "Board Game Café Visit",
        description: "Visit a board game café and enjoy some friendly competition while chatting.",
        compatibility: 70
      }
    ];
  }
}

export async function generateConversationSuggestions(
  userPersonality: Record<string, number>,
  matchPersonality: Record<string, number>,
  chatHistory: { content: string; senderId: number }[],
  currentUserId: number
) {
  // Create a personality description based on traits
  const userTraits = Object.entries(userPersonality)
    .map(([trait, score]) => `${trait}: ${score * 100}%`)
    .join(", ");
  const matchTraits = Object.entries(matchPersonality)
    .map(([trait, score]) => `${trait}: ${score * 100}%`)
    .join(", ");

  // Format chat history
  const formattedHistory = chatHistory
    .map((msg) => `${msg.senderId === currentUserId ? "You" : "Match"}: ${msg.content}`)
    .join("\n");

  const messages: CreateChatCompletionRequestMessage[] = [
    {
      role: "system",
      content: `You are a conversation coach helping users on a friend matching platform. 
      Generate 3 natural, context-aware conversation suggestions that would help build a meaningful friendship.
      Consider both users' personality traits when making suggestions.
      Make suggestions casual and friendly, avoiding overly formal language.`,
    },
    {
      role: "user",
      content: `Your personality traits: ${userTraits}
      Match's personality traits: ${matchTraits}
      
      Recent chat history:
      ${formattedHistory || "No messages yet"}
      
      Generate 3 conversation suggestions that would help build rapport with this potential friend.`,
    },
  ];

  try {
    const completion = await getChatCompletion(messages);
    // Split the completion into individual suggestions and clean them up
    const suggestions = completion
      .split(/\d\./)
      .filter(Boolean)
      .map((s) => s.trim())
      .slice(0, 3);

    return suggestions;
  } catch (error) {
    console.error("Error generating suggestions:", error);
    // Fallback suggestions if OpenAI API fails
    return [
      "Tell me more about your interests!",
      "What do you like to do for fun?",
      "Have you traveled anywhere interesting lately?",
    ];
  }
}
