import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function getChatCompletion(messages: ChatCompletionMessageParam[]) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  try {
    console.log('Making OpenAI request with messages:', JSON.stringify(messages, null, 2));
    
    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4",
      messages,
      temperature: 0.7,
      max_tokens: 1000,
      presence_penalty: 0.3,
      frequency_penalty: 0.3,
      response_format: { type: "text" }
    });

    console.log('OpenAI response:', completion.choices[0].message);
    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Detailed OpenAI error:', error);
    throw error;
  }
}

export async function generateEventSuggestions(
  userPersonality: Record<string, number>,
  matchPersonality: Record<string, number>
): Promise<{ title: string; description: string; reasoning: string }[]> {
  console.log('Generating event suggestions with traits:', {
    userPersonality,
    matchPersonality
  });

  const messages = [
    {
      role: "system" as const,
      content: `You are an expert event matchmaker who creates highly personalized activity suggestions based on personality compatibility.

Generate exactly 3 event suggestions in the following strict format:

EVENT: <title>
DESCRIPTION: <description>
REASONING: Based on User 1's <trait1> (<X>%) and User 2's <trait2> (<Y>%), <reasoning>

===

Rules:
1. Generate EXACTLY 3 suggestions
2. Use EXACTLY the format shown above
3. Include EXACT percentage values from the provided traits
4. Each suggestion MUST have all three sections
5. Do not add any extra text or formatting
6. Keep titles concise and specific
7. Make each suggestion unique
8. Reference specific trait percentages in reasoning

Example of ONE valid suggestion:
EVENT: Coffee and Art Gallery Visit
DESCRIPTION: Explore local art while enjoying refreshments
REASONING: Based on User 1's openness (85%) and User 2's sociability (75%), this combines cultural exploration with casual conversation opportunities.`
    },
    {
      role: "user" as const,
      content: `Generate 3 personalized event suggestions for these users:

User 1 traits: ${Object.entries(userPersonality || {})
  .map(([trait, score]) => `${trait}: ${Math.round(score * 100)}%`)
  .join(", ")}

User 2 traits: ${Object.entries(matchPersonality || {})
  .map(([trait, score]) => `${trait}: ${Math.round(score * 100)}%`)
  .join(", ")}

Remember:
- Generate EXACTLY 3 suggestions
- Follow the EXACT format shown
- Include trait percentages in reasoning
- Make each suggestion unique
- Keep titles concise`
    }
  ];

  try {
    console.log('Sending request to OpenAI...');
    const completion = await getChatCompletion(messages);
    console.log('Raw OpenAI response:', completion);

    if (!completion) {
      throw new Error('No completion received from OpenAI');
    }

    // Split into individual suggestions and process
    const suggestions = completion
      .split(/(?=EVENT:)/)  // Look ahead for EVENT: to preserve the marker
      .filter(suggestion => suggestion.trim().startsWith('EVENT:'))  // Only take valid suggestions
      .map(suggestion => {
        // Extract each section using positive lookbehind
        const titleMatch = suggestion.match(/EVENT:\s*(.+?)(?=\n|$)/);
        const descriptionMatch = suggestion.match(/DESCRIPTION:\s*(.+?)(?=\n|$)/);
        const reasoningMatch = suggestion.match(/REASONING:\s*(.+?)(?=\n|$)/);

        if (!titleMatch?.[1] || !descriptionMatch?.[1] || !reasoningMatch?.[1]) {
          console.error('Invalid suggestion format:', suggestion);
          return null;
        }

        const title = titleMatch[1].trim();
        const description = descriptionMatch[1].trim();
        const reasoning = reasoningMatch[1].trim();

        // Validate reasoning format
        if (!reasoning.toLowerCase().includes('based on') || !reasoning.includes('%')) {
          console.error('Invalid reasoning format:', reasoning);
          return null;
        }

        return {
          title,
          description,
          reasoning
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    console.log('Processed suggestions:', suggestions);
    
    if (suggestions.length === 0) {
      throw new Error('Failed to generate valid suggestions. Please try again.');
    }
    
    // Take exactly 3 suggestions
    return suggestions.slice(0, 3);
  } catch (error) {
    console.error("Error generating event suggestions:", error);
    throw error;
  }
}

export async function generateEventConversationStarter(
  eventSuggestion: { title: string; description: string; reasoning: string },
  userPersonality: Record<string, number>,
  matchPersonality: Record<string, number>
): Promise<string> {
  console.log('Generating conversation starter for event:', {
    eventSuggestion,
    userPersonality,
    matchPersonality
  });

  const messages = [
    {
      role: "system" as const,
      content: `You are an expert conversation starter generator that creates engaging, natural-sounding messages for suggesting activities.
      Create a friendly, personalized message that suggests the event while incorporating personality traits.
      
      Rules:
      1. Keep the tone casual and friendly
      2. Reference specific personality traits when relevant
      3. Make it sound natural, not formulaic
      4. Include a brief mention of why this activity would be enjoyable
      5. Frame it as a suggestion, not a demand
      6. Keep it concise but engaging
      
      Example format:
      For an art gallery visit with someone who has high openness (85%) and sociability (75%):
      "Given your appreciation for creative experiences, would you be interested in exploring the local art gallery together? I think it could lead to some fascinating conversations!"`
    },
    {
      role: "user" as const,
      content: `Generate a conversation starter for this event suggestion:

Event: ${eventSuggestion.title}
Description: ${eventSuggestion.description}
Reasoning: ${eventSuggestion.reasoning}

User 1 traits: ${Object.entries(userPersonality || {})
  .map(([trait, score]) => `${trait}: ${Math.round(score * 100)}%`)
  .join(", ")}

User 2 traits: ${Object.entries(matchPersonality || {})
  .map(([trait, score]) => `${trait}: ${Math.round(score * 100)}%`)
  .join(", ")}

Create a natural, engaging message that suggests this activity while considering both users' personality traits.`
    }
  ];

  try {
    console.log('Sending request to OpenAI...');
    const completion = await getChatCompletion(messages);
    console.log('Raw OpenAI response:', completion);

    if (!completion) {
      throw new Error('No conversation starter generated');
    }

    // Clean up the response
    const message = completion
      .trim()
      .replace(/^["']|["']$/g, '')  // Remove quotes if present
      .replace(/\s+/g, ' ');        // Normalize spaces

    if (!message) {
      throw new Error('Empty conversation starter generated');
    }

    return message;
  } catch (error) {
    console.error("Error generating conversation starter:", error);
    throw error;
  }
}