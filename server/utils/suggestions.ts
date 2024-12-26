// suggestions.ts

// Purpose: Provides suggestions for chat prompts and event ideas,
// using only our enhanced trait interactions and avoidance rules.

import type { Interest } from "@/hooks/use-matches";
import { generateEventSuggestions as generateAIEventSuggestions } from './openai';

// Personality traits interface
interface PersonalityTraits {
  extraversion: number;
  communication: number;
  openness: number;
  values: number;
  planning: number;
  sociability: number;
  agreeableness: number;
  conscientiousness: number;
  neuroticism: number;
  self_consciousness: number;
  introversion: number;
}

// New interfaces for trait interactions
interface TraitInteraction {
  traits: (keyof PersonalityTraits)[];
  effect: number;
}

interface Suggestion {
  text: string;
  weight: (traits: PersonalityTraits) => number;
}

interface EnhancedSuggestion extends Suggestion {
  traitInteractions?: TraitInteraction[];
  avoidanceTraits?: {
    [K in keyof PersonalityTraits]?: number;
  };
}

// Ensure a record has all required personality traits
function validatePersonalityTraits(
  traits: Record<string, number>
): PersonalityTraits {
  const requiredTraits = [    "extraversion",    "communication",    "openness",    "values",    "planning",    "sociability",    "agreeableness",    "conscientiousness",    "neuroticism",    "self_consciousness",    "introversion",  ];

  const validatedTraits = {} as PersonalityTraits;

  for (const trait of requiredTraits) {
    validatedTraits[trait as keyof PersonalityTraits] = traits[trait] ?? 0.5;
  }

  return validatedTraits;
}

// Weighted calculation function with trait interactions
function calculateWeight(
  traits: PersonalityTraits,
  suggestion: EnhancedSuggestion
): { weight: number; confidence: number } {
  let baseWeight = suggestion.weight(traits);
  let interactionBonus = 0;
  let confidenceScore = 0.7; // Base confidence

  // Calculate interaction effects
  if (suggestion.traitInteractions) {
    suggestion.traitInteractions.forEach((interaction) => {
      const interactionScore = interaction.traits.reduce(
        (acc, trait) => acc * traits[trait],
        1
      );
      interactionBonus += interactionScore * interaction.effect;
      // Boost confidence based on strong matches, up to a point
      confidenceScore += 0.1 * Math.min(interactionScore, 1);
    });
  }

  // Apply negative weights for traits to avoid
  if (suggestion.avoidanceTraits) {
    Object.entries(suggestion.avoidanceTraits).forEach(([trait, threshold]) => {
      if (traits[trait as keyof PersonalityTraits] > threshold) {
        baseWeight *= 0.5; // Reduce weight for undesirable trait combos
        confidenceScore -= 0.1; // Slightly reduce confidence
      }
    });
  }

  // Normalize final weight and confidence
  const finalWeight = Math.max(0, Math.min(1, baseWeight + interactionBonus));
  const finalConfidence = Math.max(0.3, Math.min(1, confidenceScore));

  return { weight: finalWeight, confidence: finalConfidence };
}

// Enhanced personality suggestions
export const enhancedPersonalitySuggestions: EnhancedSuggestion[] = [
  {
    text: "What's your favorite way to spend a weekend?",
    weight: (traits) =>
      (traits.extraversion + traits.sociability + traits.communication) / 3,
    traitInteractions: [
      {
        traits: ["extraversion", "sociability", "communication"],
        effect: 0.15,
      },
    ],
    avoidanceTraits: {
      neuroticism: 0.65,
      self_consciousness: 0.75,
      introversion: 0.7,
    },
  },
  {
    text: "What's a topic you'd like to learn more about?",
    weight: (traits) =>
      (traits.openness + traits.planning + traits.values) / 3,
    traitInteractions: [
      {
        traits: ["openness", "planning", "values"],
        effect: 0.2,
      },
    ],
    avoidanceTraits: {
      neuroticism: 0.75,
      self_consciousness: 0.8,
      introversion: 0.6,
    },
  },
  {
    text: "What's a mistake you've learned from?",
    weight: (traits) => (traits.planning + traits.conscientiousness) / 2,
    traitInteractions: [
      {
        traits: ["planning", "conscientiousness"],
        effect: 0.2,
      },
    ],
    avoidanceTraits: {
      neuroticism: 0.7,
      self_consciousness: 0.85,
    },
  },
  {
    text: "What's a small thing that brightens your day?",
    weight: (traits) =>
      (traits.extraversion + traits.communication + traits.agreeableness) / 3,
    traitInteractions: [
      {
        traits: ["extraversion", "communication", "agreeableness"],
        effect: 0.15,
      },
    ],
    avoidanceTraits: {
      neuroticism: 0.6,
      self_consciousness: 0.8,
      introversion: 0.65,
    },
  },
  {
    text: "What's an adventure you've always wanted to go on?",
    weight: (traits) =>
      (traits.planning + traits.extraversion + traits.openness) / 3,
    traitInteractions: [
      {
        traits: ["planning", "extraversion", "openness"],
        effect: 0.25,
      },
    ],
    avoidanceTraits: {
      neuroticism: 0.8,
      self_consciousness: 0.7,
      introversion: 0.75,
    },
  },
  {
    text: "What kind of volunteer work or community service do you find meaningful?",
    weight: (traits) =>
      (traits.values + traits.agreeableness + traits.communication) / 3,
    traitInteractions: [
      {
        traits: ["values", "agreeableness"],
        effect: 0.2,
      },
    ],
    avoidanceTraits: {
      neuroticism: 0.65,
      self_consciousness: 0.75,
      introversion: 0.7,
    },
  },
  {
    text: "How do you approach problem-solving in daily life?",
    weight: (traits) => (traits.conscientiousness + traits.planning) / 2,
    traitInteractions: [
      {
        traits: ["conscientiousness", "planning"],
        effect: 0.15,
      },
    ],
    avoidanceTraits: {
      neuroticism: 0.6,
      self_consciousness: 0.8,
      introversion: 0.8,
    },
  },
  {
    text: "What's your strategy for staying motivated when tasks get tough?",
    weight: (traits) =>
      (traits.values + traits.conscientiousness + traits.agreeableness) / 3,
    traitInteractions: [
      {
        traits: ["values", "conscientiousness"],
        effect: 0.2,
      },
    ],
    avoidanceTraits: {
      neuroticism: 0.8,
      self_consciousness: 0.7,
      introversion: 0.65,
    },
  },
  {
    text: "In what ways do you like to express creativity?",
    weight: (traits) => (traits.openness + traits.communication) / 2,
    traitInteractions: [
      {
        traits: ["openness", "communication"],
        effect: 0.25,
      },
    ],
    avoidanceTraits: {
      neuroticism: 0.7,
      self_consciousness: 0.75,
      introversion: 0.65,
    },
  },
  {
    text: "What does friendship mean to you?",
    weight: (traits) =>
      (traits.sociability + traits.values + traits.agreeableness) / 3,
    traitInteractions: [
      {
        traits: ["sociability", "values"],
        effect: 0.2,
      },
    ],
    avoidanceTraits: {
      neuroticism: 0.65,
      self_consciousness: 0.8,
      introversion: 0.7,
    },
  },
];

// Enhanced suggestion generator using trait interaction logic
export function generateEnhancedChatSuggestions(
  userTraits: Record<string, number>,
  otherTraits: Record<string, number>,
  userInterests: Interest[],
  otherInterests: Interest[]
): { text: string; confidence: number }[] {
  const validatedUserTraits = validatePersonalityTraits(userTraits);
  const validatedOtherTraits = validatePersonalityTraits(otherTraits);

  const weightedSuggestions = enhancedPersonalitySuggestions.map(
    (suggestion) => {
      const userScore = calculateWeight(validatedUserTraits, suggestion);
      const otherScore = calculateWeight(validatedOtherTraits, suggestion);

      return {
        text: suggestion.text,
        weight: (userScore.weight + otherScore.weight) / 2,
        confidence: (userScore.confidence + otherScore.confidence) / 2,
      };
    }
  );

  return weightedSuggestions
    .filter((s) => s.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .map(({ text, confidence }) => ({ text, confidence }))
    .slice(0, 10);
}

// Base event suggestions (optional, or you can remove if you don't need event generation)
const BASE_EVENT_SUGGESTIONS = [
  {
    title: "Coffee Chat",
    description: "Meet up for coffee and conversation",
    type: "casual" as const,
  },
  {
    title: "Nature Walk",
    description: "Take a relaxing walk in nature",
    type: "outdoor" as const,
  },
  {
    title: "Museum Visit",
    description: "Explore art and culture together",
    type: "cultural" as const,
  },
  {
    title: "Board Game Café",
    description: "Play games and enjoy snacks",
    type: "entertainment" as const,
  },
  {
    title: "Local Market",
    description: "Explore local vendors and foods",
    type: "shopping" as const,
  },
  {
    title: "Cooking Class",
    description: "Learn to cook something new together",
    type: "learning" as const,
  },
  {
    title: "Art Gallery",
    description: "Appreciate art and discuss perspectives",
    type: "cultural" as const,
  },
  {
    title: "Fitness Class",
    description: "Try a new workout together",
    type: "active" as const,
  },
  {
    title: "Picnic in the Park",
    description: "Enjoy food and good company outdoors",
    type: "outdoor" as const,
  },
  {
    title: "Live Music Show",
    description: "Experience live music together",
    type: "entertainment" as const,
  },
  {
    title: "Volunteer Event",
    description: "Give back to the community together",
    type: "community" as const,
  },
  {
    title: "Book Club Meeting",
    description: "Discuss a book you've all read",
    type: "learning" as const,
  },
  {
    title: "Pottery Class",
    description: "Get creative with clay",
    type: "creative" as const,
  },
  {
    title: "Wine Tasting",
    description: "Sample different wines and socialize",
    type: "social" as const,
  },
  {
    title: "Brewery Tour",
    description: "Learn about beer making and sample craft brews",
    type: "social" as const,
  },
  {
    title: "Stargazing Night",
    description: "Observe the night sky and learn about astronomy",
    type: "outdoor" as const,
  },
  {
    title: "Movie Night",
    description: "Watch a movie together at home or in a theater",
    type: "entertainment" as const,
  },
  {
    title: "Karaoke Night",
    description: "Sing your favorite songs and have fun",
    type: "entertainment" as const,
  },
  {
    title: "Escape Room",
    description: "Test your teamwork and problem-solving skills",
    type: "challenge" as const,
  },
  {
    title: "Improv Show",
    description: "Enjoy spontaneous and comedic performances",
    type: "entertainment" as const,
  },
  {
    title: "Botanical Garden Visit",
    description: "Explore diverse plant life and beautiful gardens",
    type: "outdoor" as const,
  },
  {
    title: "Beach Day",
    description: "Relax by the water, swim, or play beach games",
    type: "outdoor" as const,
  },
  {
    title: "Language Exchange Meetup",
    description: "Practice different languages and meet new people",
    type: "learning" as const,
  },
  {
    title: "Coding Workshop",
    description: "Learn basic coding skills or work on a coding project",
    type: "learning" as const,
  },
  {
    title: "Photography Walk",
    description: "Explore the city or nature and capture beautiful photos",
    type: "creative" as const,
  },
  {
    title: "Game Night (Video Games)",
    description: "Play video games together, online or in person",
    type: "entertainment" as const,
  },
  {
    title: "Meditation Session",
    description: "Practice mindfulness and relaxation techniques",
    type: "wellness" as const,
  },
  {
    title: "Yoga Class",
    description: "Improve flexibility and find inner peace",
    type: "wellness" as const,
  },
  {
    title: "Local Festival",
    description: "Experience local culture and traditions",
    type: "community" as const,
  },
  {
    title: "Open Mic Night",
    description: "Showcase your talents or enjoy local performances",
    type: "entertainment" as const,
  },
] as const;

type EventType = typeof BASE_EVENT_SUGGESTIONS[number]["type"];
type EventSuggestion = {
  title: string;
  description: string;
  type: EventType;
  weight?: (traits: PersonalityTraits) => number;
};

// Example personality-based events
const personalityEventSuggestions: EventSuggestion[] = [
  {
    title: "Social Meetup",
    description: "Join a local group activity",
    type: "entertainment",
    weight: (traits) => traits.extraversion * traits.sociability,
  },
  {
    title: "Creative Workshop",
    description: "Create something unique together",
    type: "creative",
    weight: (traits) => traits.openness * traits.communication,
  },
  {
    title: "Puzzle Room",
    description: "Solve challenges together",
    type: "challenge",
    weight: (traits) => traits.planning,
  },
];

// Helper function to get personality-based events (optional)
function getPersonalityBasedEvents(traits: PersonalityTraits): EventSuggestion[] {
  return personalityEventSuggestions
    .map((event) => ({
      ...event,
      score: event.weight ? event.weight(traits) : 0,
    }))
    .filter((event) => event.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((event) => ({
      title: event.title,
      description: event.description,
      type: event.type,
    }));
}

interface FormattedSuggestion {
  text: string;
  type: 'event' | 'conversation';
  rawTitle?: string;  // Store the original unformatted title
  context?: {
    eventType?: EventType;
    requiresArticle?: boolean;
    isFormatted?: boolean;  // Flag to prevent double formatting
  };
}

// Helper function to format event suggestions
function formatEventSuggestion(title: string, type: EventType): FormattedSuggestion {
  // Clean the title - remove parenthetical descriptions and extra spaces
  const cleanTitle = title
    .replace(/\s*\([^)]*\)/g, '')  // Remove parenthetical descriptions
    .replace(/\s+/g, ' ')          // Normalize spaces
    .trim();
  
  // Determine if the title needs an article
  const needsArticle = !cleanTitle.toLowerCase().startsWith('the') && 
                      !type.match(/^(outdoor|active)$/) &&
                      !cleanTitle.toLowerCase().match(/^(beach|park|local|online)/);
  
  return {
    text: cleanTitle,
    type: 'event',
    rawTitle: cleanTitle,
    context: {
      eventType: type,
      requiresArticle: needsArticle,
      isFormatted: false
    }
  };
}

// Enhanced event suggestions generator
export async function generateEventSuggestions(
  userTraits: Record<string, number>,
  otherTraits: Record<string, number>,
  userInterests: Interest[],
  otherInterests: Interest[]
): Promise<{ title: string; description: string; reasoning: string }[]> {
  console.log('Generating event suggestions with traits:', { userTraits, otherTraits });
  
  // Only use AI-generated suggestions, no fallbacks
  const aiSuggestions = await generateAIEventSuggestions(userTraits, otherTraits);
  console.log('AI generated suggestions:', aiSuggestions);
  
  if (!aiSuggestions || aiSuggestions.length === 0) {
    throw new Error('Failed to generate AI suggestions');
  }

  return aiSuggestions;
}

// Function to craft a personalized message
export function craftPersonalizedMessage(
  suggestion: FormattedSuggestion | string,
  userTraits: Record<string, number>,
  otherTraits: Record<string, number>
): string {
  const validatedUserTraits = validatePersonalityTraits(userTraits);
  
  // Handle string input for backward compatibility
  if (typeof suggestion === 'string') {
    suggestion = { 
      text: suggestion, 
      type: 'conversation',
      context: { isFormatted: false }
    };
  }

  // If the suggestion has already been formatted, return it as is
  if (suggestion.context?.isFormatted) {
    return suggestion.text;
  }

  let message = suggestion.text;

  if (suggestion.type === 'event') {
    // Clean up the title - remove parenthetical descriptions
    message = message.replace(/\s*\([^)]*\)/g, '').trim();
    
    // Handle event suggestions
    const needsArticle = suggestion.context?.requiresArticle ?? true;
    const article = needsArticle ? 
      (/^[aeiou]/i.test(message.toLowerCase()) ? 'an' : 'a') : 
      '';
    
    // Format based on event type and traits with proper grammar
    const introVariations = [
      "Would you like to go to",
      "How about we check out",
      "I was thinking we could visit",
      "Would you be interested in going to",
      "What do you think about going to"
    ];
    
    const randomIntro = introVariations[Math.floor(Math.random() * introVariations.length)];
    message = `${randomIntro} ${article ? `${article} ` : ''}${message.toLowerCase()}`;
  } else {
    // Handle conversation starters with more natural variations
    const shouldPersonalize = Math.random() > 0.7; // Only personalize 30% of the time
    
    if (shouldPersonalize) {
      if (validatedUserTraits.communication > 0.7) {
        const variations = [
          (msg: string) => msg,
          (msg: string) => msg.startsWith("What's") ? msg.replace(/^What's/, "I'd love to hear about") : msg,
          (msg: string) => msg.startsWith("How about") ? msg.replace(/^How about/, "I was thinking maybe") : msg
        ];
        const randomVariation = variations[Math.floor(Math.random() * variations.length)];
        message = randomVariation(message);
      }

      if (validatedUserTraits.openness > 0.7 && !message.startsWith("I") && Math.random() > 0.5) {
        if (!message.includes("curious") && !message.includes("Would you")) {
          message = "I'm curious - " + message.charAt(0).toLowerCase() + message.slice(1);
        }
      }

      if (validatedUserTraits.values > 0.7 && !message.includes("value") && Math.random() > 0.7) {
        if ((message.startsWith("What") || message.startsWith("How")) && !message.includes("Would you")) {
          message = "I value your perspective on " + message.charAt(0).toLowerCase() + message.slice(1);
        }
      }
    }
  }

  // Ensure proper punctuation and capitalization
  message = message.trim();
  message = message.charAt(0).toUpperCase() + message.slice(1);
  
  // Handle question marks
  if (!message.endsWith("?")) {
    message += "?";
  }

  // Clean up any formatting issues
  message = message
    .replace(/\s+/g, " ")           // Remove extra spaces
    .replace(/\?+/g, "?")           // Remove multiple question marks
    .replace(/\s+\?/g, "?")         // Remove space before question mark
    .replace(/\s+!/g, "!")          // Remove space before exclamation mark
    .replace(/[,.!?]+\?/g, "?")     // Clean up multiple punctuation
    .replace(/\s+(to|for|at)\s+to\s+/, " to ")  // Fix double prepositions
    .replace(/would you (?:like|be interested in) would you/i, "would you")  // Fix double "would you"
    .replace(/go to go to/i, "go to")  // Fix double "go to"
    .replace(/would you like to would you like to/i, "would you like to")  // Fix specific double phrase
    .replace(/would you be interested in would you be interested in/i, "would you be interested in")  // Fix another double phrase
    .replace(/would you like to would you be interested in/i, "would you like to")  // Fix mixed format
    .replace(/would you be interested in would you like to/i, "would you be interested in")  // Fix reverse mixed format
    .replace(/(?:would you like to|would you be interested in)\s+(?:would you like to|would you be interested in)/i, (match) => {
      // Keep the first occurrence of either phrase
      return match.toLowerCase().startsWith('would you like to') ? 'would you like to' : 'would you be interested in';
    })
    .trim();

  // Ensure proper capitalization after cleanup
  message = message.charAt(0).toUpperCase() + message.slice(1);

  // Mark as formatted to prevent double processing
  if (typeof suggestion === 'object') {
    suggestion.context = { ...suggestion.context, isFormatted: true };
  }

  return message;
}

export { generateEventConversationStarter } from './openai';
