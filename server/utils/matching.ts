// server/utils/matching.ts
// Matching and compatibility scoring algorithms

// Define types locally for server-side use (no client dependencies)
export interface PersonalityTraits {
  extraversion: number;
  communication: number;
  openness: number;
  values: number;
  planning: number;
  sociability: number;
  [key: string]: number; // Allow dynamic access
}

export interface Interest {
  id: number;
  name: string;
  score: number;
  category?: string;
}

interface ScoreWeights {
  personality: number;
  interests: number;
  communication: number;
  social: number;
  activity: number;
}

const DEFAULT_WEIGHTS: ScoreWeights = {
  personality: 0.35,
  interests: 0.25,
  communication: 0.20,
  social: 0.10,
  activity: 0.10
};

// Personality trait importance weights
const TRAIT_WEIGHTS = {
  extraversion: 0.2,
  communication: 0.25,
  openness: 0.15,
  values: 0.20,
  planning: 0.10,
  sociability: 0.10
} as const;

type TraitName = keyof typeof TRAIT_WEIGHTS;

/**
 * Simple compatibility score calculation based on personality traits.
 * Returns a value between 0 and 1 representing similarity.
 * 
 * @param userTraits - First user's personality traits
 * @param matchTraits - Second user's personality traits
 * @returns Compatibility score between 0 and 1
 */
export function calculateCompatibilityScore(
  userTraits: Partial<PersonalityTraits>,
  matchTraits: Partial<PersonalityTraits>
): number {
  const requiredTraits: TraitName[] = [
    'extraversion',
    'communication',
    'openness',
    'values',
    'planning',
    'sociability'
  ];

  let score = 0;
  let count = 0;

  for (const trait of requiredTraits) {
    const userValue = userTraits[trait];
    const matchValue = matchTraits[trait];

    // Skip if either value is missing or invalid
    if (typeof userValue !== 'number' || typeof matchValue !== 'number' ||
        isNaN(userValue) || isNaN(matchValue)) {
      continue;
    }

    // Normalize values to be between 0 and 1
    const normalizedUser = Math.max(0, Math.min(1, userValue));
    const normalizedMatch = Math.max(0, Math.min(1, matchValue));

    // Calculate similarity (1 - absolute difference)
    const similarity = 1 - Math.abs(normalizedUser - normalizedMatch);
    score += similarity;
    count++;
  }

  // Return average similarity score, defaulting to 0 if no valid traits
  return count > 0 ? score / count : 0;
}

export function calculateTraitCompatibility(
  trait1: number,
  trait2: number,
  traitName: keyof typeof TRAIT_WEIGHTS
): number {
  const weight = TRAIT_WEIGHTS[traitName];
  const difference = Math.abs(trait1 - trait2);
  
  // Calculate base compatibility (0-1 scale)
  let compatibility = 1 - (difference / 1);
  
  // Apply diminishing returns curve
  compatibility = Math.pow(compatibility, 0.7);
  
  // Apply trait-specific weight
  return compatibility * weight;
}

export function calculatePersonalityScore(
  traits1: PersonalityTraits,
  traits2: PersonalityTraits
): number {
  let totalScore = 0;
  let totalWeight = 0;

  // Calculate weighted score for each trait
  for (const trait of Object.keys(TRAIT_WEIGHTS) as Array<keyof typeof TRAIT_WEIGHTS>) {
    if (traits1[trait] !== undefined && traits2[trait] !== undefined) {
      const traitScore = calculateTraitCompatibility(
        traits1[trait],
        traits2[trait],
        trait
      );
      totalScore += traitScore;
      totalWeight += TRAIT_WEIGHTS[trait];
    }
  }

  // Normalize score to 0-1 range
  return totalWeight > 0 ? totalScore / totalWeight : 0;
}

export function calculateInterestScore(
  interests1: Interest[],
  interests2: Interest[]
): number {
  if (!interests1.length || !interests2.length) return 0;

  // Create maps for faster lookup
  const map1 = new Map(interests1.map(i => [i.name, i]));
  const map2 = new Map(interests2.map(i => [i.name, i]));

  let totalScore = 0;
  let matchCount = 0;

  // Calculate score for matching interests
  map1.forEach((interest1, name) => {
    const interest2 = map2.get(name);
    if (interest2) {
      // Score based on how close their interest levels are (0-1)
      const scoreAlignment = 1 - Math.abs(interest1.score - interest2.score);
      totalScore += scoreAlignment;
      matchCount++;
    }
  });

  // Calculate shared interest ratio
  const sharedRatio = matchCount / Math.max(interests1.length, interests2.length);
  
  // Combine alignment score with shared ratio
  return matchCount > 0 
    ? (totalScore / matchCount) * 0.7 + sharedRatio * 0.3 
    : 0;
}

export function calculateComplexityScore(
  user1: {
    personalityTraits: PersonalityTraits;
    interests?: Interest[];
  },
  user2: {
    personalityTraits: PersonalityTraits;
    interests?: Interest[];
  },
  weights: Partial<ScoreWeights> = {}
): number {
  const finalWeights = { ...DEFAULT_WEIGHTS, ...weights };
  
  // Calculate individual component scores
  const personalityScore = calculatePersonalityScore(
    user1.personalityTraits,
    user2.personalityTraits
  );
  
  const interestScore = calculateInterestScore(
    user1.interests || [],
    user2.interests || []
  );

  // Calculate communication style compatibility (based on personality traits)
  const communicationScore = calculateTraitCompatibility(
    user1.personalityTraits.communication,
    user2.personalityTraits.communication,
    'communication'
  );

  // Calculate social preference compatibility
  const socialScore = calculateTraitCompatibility(
    user1.personalityTraits.sociability,
    user2.personalityTraits.sociability,
    'sociability'
  );

  // Calculate activity compatibility (based on extraversion and openness)
  const activityScore = (
    calculateTraitCompatibility(
      user1.personalityTraits.extraversion,
      user2.personalityTraits.extraversion,
      'extraversion'
    ) +
    calculateTraitCompatibility(
      user1.personalityTraits.openness,
      user2.personalityTraits.openness,
      'openness'
    )
  ) / 2;

  // Calculate weighted final score
  const finalScore =
    personalityScore * finalWeights.personality +
    interestScore * finalWeights.interests +
    communicationScore * finalWeights.communication +
    socialScore * finalWeights.social +
    activityScore * finalWeights.activity;

  // Convert to percentage and round to nearest integer
  return Math.round(finalScore * 100);
}

// Helper function to get detailed score breakdown
export function getScoreBreakdown(
  user1: {
    personalityTraits: PersonalityTraits;
    interests?: Interest[];
  },
  user2: {
    personalityTraits: PersonalityTraits;
    interests?: Interest[];
  }
): {
  overall: number;
  components: {
    personality: number;
    interests: number;
    communication: number;
    social: number;
    activity: number;
  };
  details: {
    personalityBreakdown: Record<string, number>;
  };
} {
  const personalityScore = calculatePersonalityScore(
    user1.personalityTraits,
    user2.personalityTraits
  );
  
  const interestScore = calculateInterestScore(
    user1.interests || [],
    user2.interests || []
  );

  const communicationScore = calculateTraitCompatibility(
    user1.personalityTraits.communication,
    user2.personalityTraits.communication,
    'communication'
  );

  const socialScore = calculateTraitCompatibility(
    user1.personalityTraits.sociability,
    user2.personalityTraits.sociability,
    'sociability'
  );

  const activityScore = (
    calculateTraitCompatibility(
      user1.personalityTraits.extraversion,
      user2.personalityTraits.extraversion,
      'extraversion'
    ) +
    calculateTraitCompatibility(
      user1.personalityTraits.openness,
      user2.personalityTraits.openness,
      'openness'
    )
  ) / 2;

  // Calculate personality breakdown for each trait
  const personalityBreakdown: Record<string, number> = {};
  for (const trait of Object.keys(TRAIT_WEIGHTS) as Array<keyof typeof TRAIT_WEIGHTS>) {
    personalityBreakdown[trait] = calculateTraitCompatibility(
      user1.personalityTraits[trait],
      user2.personalityTraits[trait],
      trait
    );
  }

  const overall = calculateComplexityScore(user1, user2);

  return {
    overall,
    components: {
      personality: Math.round(personalityScore * 100),
      interests: Math.round(interestScore * 100),
      communication: Math.round(communicationScore * 100),
      social: Math.round(socialScore * 100),
      activity: Math.round(activityScore * 100)
    },
    details: {
      personalityBreakdown: Object.fromEntries(
        Object.entries(personalityBreakdown).map(([k, v]) => [k, Math.round(v * 100)])
      )
    }
  };
}
