import { CreateChatCompletionRequestMessage } from "openai";

const OPENAI_API_ENDPOINT = "https://api.openai.com/v1/chat/completions";

export async function getChatCompletion(messages: CreateChatCompletionRequestMessage[]) {
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
      content: `You are a friendly conversation assistant helping users craft natural, engaging messages for a friendship matching platform. 
      Your task is to create a natural, friendly message based on a conversation topic, considering both users' personality traits.
      The message should be casual, warm, and authentic - as if it's coming from a real person who wants to make friends.`
    },
    {
      role: "user",
      content: `Given these personality traits:
      Your traits: ${Object.entries(userPersonality)
        .map(([trait, score]) => `${trait}: ${score * 100}%`)
        .join(", ")}
      Match's traits: ${Object.entries(matchPersonality)
        .map(([trait, score]) => `${trait}: ${score * 100}%`)
        .join(", ")}
      
      Please craft a natural, friendly message based on this conversation starter: "${suggestion}"
      The message should be personal, engaging, and true to my personality traits.`
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
