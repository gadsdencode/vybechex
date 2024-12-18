import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface MatchInsightProps {
  personalityTraits?: Record<string, number>;
  compatibilityScore: number;
  scoreBreakdown?: {
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
  };
}

export function MatchInsightTooltip({
  personalityTraits,
  compatibilityScore,
  scoreBreakdown
}: MatchInsightProps) {
  // Generate insights based on personality traits and scores
  const getTopTraits = () => {
    if (!personalityTraits) return [];
    return Object.entries(personalityTraits)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 2)
      .map(([trait]) => trait);
  };

  const getCompatibilityInsight = () => {
    if (compatibilityScore >= 80) {
      return "Exceptional match! You share remarkable compatibility.";
    } else if (compatibilityScore >= 60) {
      return "Strong potential for a great connection!";
    } else if (compatibilityScore >= 40) {
      return "Moderate compatibility with room for growth.";
    } else {
      return "Different perspectives could lead to interesting conversations.";
    }
  };

  const topTraits = getTopTraits();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Info className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="w-80 p-4">
          <div className="space-y-2">
            <h4 className="font-semibold">{getCompatibilityInsight()}</h4>
            
            {topTraits.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Strongest traits: {topTraits.join(", ")}
              </p>
            )}
            
            {scoreBreakdown && (
              <div className="mt-2">
                <p className="text-sm font-medium">Compatibility Breakdown:</p>
                <ul className="text-sm text-muted-foreground mt-1">
                  <li>Personality: {scoreBreakdown.components.personality}%</li>
                  <li>Communication: {scoreBreakdown.components.communication}%</li>
                  <li>Social: {scoreBreakdown.components.social}%</li>
                </ul>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
