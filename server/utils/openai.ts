import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const OPENAI_API_ENDPOINT = "https://api.openai.com/v1/chat/completions";

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function getChatCompletion(messages: ChatCompletionMessageParam[]) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  try {
    const completion = await openaiClient.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages,
      temperature: 0.7,
      max_tokens: 150,
    });

    return completion.choices[0].message.content;
  } catch (error) {
    throw new Error(`OpenAI API error: ${error}`);
  }
}

export async function craftMessageFromSuggestion(
  suggestion: string,
  userPersonality: Record<string, number>,
  matchPersonality: Record<string, number>
) {
  const messages = [
    {
      role: "system" as const,
      content: `You are a friendly conversation assistant helping users craft natural, engaging messages for a friendship matching platform. 
      Your task is to create a natural, friendly message based on a conversation topic, considering both users' personality traits.
      The message should be casual, warm, and authentic - as if it's coming from a real person who wants to make friends.`
    },
    {
      role: "user" as const,
      content: `Given these personality traits:
      Your traits: ${Object.entries(userPersonality || {})
        .map(([trait, score]) => `${trait}: ${Math.round(score * 100)}%`)
        .join(", ") || "No traits available"}
      Match's traits: ${Object.entries(matchPersonality || {})
        .map(([trait, score]) => `${trait}: ${Math.round(score * 100)}%`)
        .join(", ") || "No traits available"}
      
      Please craft a natural, friendly message based on this conversation starter: "${suggestion}"
      The message should be personal, engaging, and true to my personality traits.`
    }
  ];

  try {
    const response = await getChatCompletion(messages);
    return response!.replace(/^["']|["']$/g, ''); // Remove any quotes if present
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
  const userTraits = Object.entries(userPersonality || {})
    .map(([trait, score]) => `${trait}: ${Math.round(score * 100)}%`)
    .join(", ") || "No traits available";
  const matchTraits = Object.entries(matchPersonality || {})
    .map(([trait, score]) => `${trait}: ${Math.round(score * 100)}%`)
    .join(", ") || "No traits available";

  // Format chat history
  const formattedHistory = chatHistory
    .map((msg) => `${msg.senderId === currentUserId ? "You" : "Match"}: ${msg.content}`)
    .join("\n");

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system" as const,
      content: `You are a conversation coach helping users on a friend matching platform. 
      Generate 3 natural, context-aware conversation suggestions that would help build a meaningful friendship.
      Consider both users' personality traits when making suggestions.
      Make suggestions casual and friendly, avoiding overly formal language.`,
    },
    {
      role: "user" as const,
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
    const suggestions = completion!
      .split(/\d\./)
      .filter(Boolean)
      .map((s: string) => s.trim())
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

export async function generateEventSuggestions(
  userPersonality: Record<string, number>,
  matchPersonality: Record<string, number>
) {
  const messages = [
    {
      role: "system" as const,
      content: `You are an event suggestion assistant helping users find activities they might both enjoy based on their personality traits. 
      Suggest events and activities that would appeal to both users given their personality profiles.
      Keep suggestions practical, specific, and tailored to common interests.`
    },
    {
      role: "user" as const,
      content: `Given these personality traits:
      User 1 traits: ${Object.entries(userPersonality || {})
        .map(([trait, score]) => `${trait}: ${Math.round(score * 100)}%`)
        .join(", ") || "No traits available"}
      User 2 traits: ${Object.entries(matchPersonality || {})
        .map(([trait, score]) => `${trait}: ${Math.round(score * 100)}%`)
        .join(", ") || "No traits available"}
      
      Generate 3 specific event or activity suggestions that both users would enjoy doing together.
      Consider their personality compatibility and shared trait strengths.`
    }
  ];

  try {
    const completion = await getChatCompletion(messages);
    const suggestions = completion!
      .split(/\d\./)
      .filter(Boolean)
      .map((s: string) => ({
        title: s.trim(),
        description: ""
      }))
      .slice(0, 3);

    return suggestions;
  } catch (error) {
    console.error("Error generating event suggestions:", error);
    return [
      { title: "Visit a local art gallery or museum together", description: "" },
      { title: "Have coffee at a quiet café and chat", description: "" },
      { title: "Take a walking tour of the city", description: "" }
    ];
  }
}