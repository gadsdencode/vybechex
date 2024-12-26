import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/hooks/use-user";
import { useMatches, type Match } from "@/hooks/use-matches";
import type { User } from "@db/schema";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Slider } from "@/components/ui/slider";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Heart } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useLocation } from "wouter";

const interestFields = [
  'extraversion',
  'communication',
  'openness',
  'values',
  'planning',
  'sociability',
] as const;

const wizardSchema = z.object({
  interests: z.object(
    interestFields.reduce(
      (acc, field) => ({ ...acc, [field]: z.number().min(0).max(1) }),
      {} as Record<typeof interestFields[number], z.ZodNumber>
    )
  ),
});

type WizardFormData = z.infer<typeof wizardSchema>;
type InterestField = typeof interestFields[number];

interface CreateMatchWizardProps {
  initialMatchId: string | null;
  onComplete: () => void;
  onCancel: () => void;
}

type PersonalityTraits = {
  extraversion: number;
  communication: number;
  openness: number;
  values: number;
  planning: number;
  sociability: number;
};

export default function CreateMatchWizard({ initialMatchId, onComplete, onCancel }: CreateMatchWizardProps) {
  const [step, setStep] = useState(1);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(
    initialMatchId ? parseInt(initialMatchId, 10) : null
  );
  const { user } = useUser();
  const { connect } = useMatches();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const totalSteps = 3;

  // Validate initialMatchId when it changes
  useEffect(() => {
    if (initialMatchId) {
      const parsedId = parseInt(initialMatchId, 10);
      if (!isNaN(parsedId) && parsedId > 0) {
        setSelectedMatchId(parsedId);
      } else {
        console.error('Invalid initial match ID:', initialMatchId);
        setSelectedMatchId(null);
      }
    }
  }, [initialMatchId]);

  // Query for all potential matches
  const { data: potentialMatches, isLoading: loadingMatches, error: matchesError } = useQuery({
    queryKey: ['potential-matches'],
    queryFn: async () => {
      console.log('Fetching potential matches...');
      const response = await fetch('/api/matches/potential', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to fetch potential matches:', errorData);
        throw new Error(errorData.message || 'Failed to fetch potential matches');
      }

      const data = await response.json();
      console.log('Potential matches response:', data);

      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch potential matches');
      }

      return data.matches || [];
    },
    enabled: step === 2 && !!user?.quizCompleted,
    staleTime: 30000,
    retry: 1,
    gcTime: 0,
    meta: {
      errorMessage: "Failed to load potential matches"
    }
  });

  // Handle potential matches error
  useEffect(() => {
    if (matchesError) {
      console.error('Error fetching potential matches:', matchesError);
      toast({
        title: "Error",
        description: matchesError instanceof Error ? matchesError.message : "Failed to load potential matches",
        variant: "destructive"
      });
    }
  }, [matchesError, toast]);

  // Query for specific match details if editing
  const { data: potentialMatch, error: potentialMatchError } = useQuery({
    queryKey: ['potential-match', initialMatchId],
    queryFn: async () => {
      const response = await fetch(`/api/users/${initialMatchId}`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to fetch potential match');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch potential match');
      }

      return data.user || null;
    },
    enabled: !!initialMatchId && step > 1,
    staleTime: 30000,
    retry: 1,
    gcTime: 0
  });

  // Handle potential match error
  useEffect(() => {
    if (potentialMatchError) {
      console.error('Error fetching potential match:', potentialMatchError);
      toast({
        title: "Error",
        description: potentialMatchError instanceof Error ? potentialMatchError.message : "Failed to load match details",
        variant: "destructive"
      });
    }
  }, [potentialMatchError, toast]);

  // Get the current match being previewed
  const currentMatch = useMemo(() => {
    if (potentialMatch) return potentialMatch;
    if (!selectedMatchId || !potentialMatches) return null;
    return potentialMatches.find((m: Match) => m.id === selectedMatchId);
  }, [potentialMatch, selectedMatchId, potentialMatches]);

  useEffect(() => {
    // Check if user has completed the quiz when entering step 2
    if (step === 2 && !user?.quizCompleted) {
      toast({
        title: "Quiz Required",
        description: "Please complete your personality quiz before matching.",
        variant: "destructive"
      });
      setStep(1);
    }
  }, [step, user?.quizCompleted]);

  // Form setup with default values
  const form = useForm<WizardFormData>({
    resolver: zodResolver(wizardSchema),
    defaultValues: {
      interests: interestFields.reduce(
        (acc, field) => ({ ...acc, [field]: 0.5 }),
        {} as Record<InterestField, number>
      )
    }
  });

  const progress = (step / totalSteps) * 100;

  const calculateCompatibility = () => {
    if (!currentMatch?.personalityTraits || !form.getValues().interests) {
      return 0;
    }

    const userTraits = form.getValues().interests;
    const matchTraits = currentMatch.personalityTraits;
    let score = 0;
    let count = 0;

    const traits = Object.keys(userTraits) as Array<keyof PersonalityTraits>;
    for (const trait of traits) {
      if (matchTraits[trait] !== undefined) {
        const similarity = 1 - Math.abs(userTraits[trait] - matchTraits[trait]);
        score += similarity;
        count++;
      }
    }

    return Math.round((score / count) * 100);
  };

  const handleNavigateNext = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (step < totalSteps) {
      setStep(prev => prev + 1);
    }
  };

  const handleNavigateBack = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (step > 1) {
      setStep(prev => prev - 1);
    }
  };

  const handleMatchSelect = (match: Match) => {
    if (!match.id || isNaN(match.id) || match.id <= 0) {
      console.error('Invalid match ID:', match.id);
      toast({
        title: "Error",
        description: "Invalid match selection",
        variant: "destructive"
      });
      return;
    }
    
    setSelectedMatchId(match.id);
  };

  const handleFormSubmit = async (data: WizardFormData) => {
    if (step !== totalSteps) {
      return;
    }

    try {
      if (!user) {
        throw new Error("You must be logged in to create a match");
      }

      if (!selectedMatchId || isNaN(selectedMatchId) || selectedMatchId <= 0) {
        throw new Error("Please select a valid match");
      }

      // Create the match
      const match = await connect(selectedMatchId);

      toast({
        title: "Match Request Sent",
        description: "Your match request has been sent successfully!"
      });

      if (match.status === 'accepted') {
        setLocation(`/chat/${match.id}`);
      }

      onComplete();
    } catch (error) {
      console.error('Error creating match:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('already exists')) {
          toast({
            title: "Match Exists",
            description: "You already have a match with this user.",
            variant: "default",
          });
          setLocation(`/chat/${selectedMatchId}`);
          onComplete();
        } else if (error.message.includes('not found')) {
          toast({
            title: "User Not Found",
            description: "This user is no longer available for matching.",
            variant: "destructive",
          });
          onCancel();
        } else {
          toast({
            title: "Error",
            description: error.message,
            variant: "destructive"
          });
        }
      } else {
        toast({
          title: "Error",
          description: "An unexpected error occurred",
          variant: "destructive"
        });
      }
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Create New Match</CardTitle>
        <CardDescription>
          Step {step} of {totalSteps}: {getStepDescription(step)}
        </CardDescription>
        <Progress value={progress} className="mt-2" />
      </CardHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleFormSubmit)}>
          <CardContent>
            {step === 1 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">What are you looking for?</h3>
                {interestFields.map((trait) => (
                  <FormField
                    key={trait}
                    control={form.control}
                    name={`interests.${trait}` as const}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{formatTrait(trait)}</FormLabel>
                        <FormControl>
                          <Slider
                            min={0}
                            max={1}
                            step={0.1}
                            value={[field.value]}
                            onValueChange={([newValue]) => {
                              if (typeof newValue === 'number' && !Number.isNaN(newValue)) {
                                field.onChange(newValue);
                              }
                            }}
                          />
                        </FormControl>
                        <FormDescription>
                          {getTraitDescription(trait, field.value)}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium">Choose Your Potential Match</h3>
                {loadingMatches ? (
                  <div className="flex items-center justify-center h-40">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : matchesError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>
                      {matchesError instanceof Error ? matchesError.message : 'Failed to load potential matches'}
                    </AlertDescription>
                  </Alert>
                ) : !user?.quizCompleted ? (
                  <Alert>
                    <AlertTitle>Quiz Required</AlertTitle>
                    <AlertDescription>
                      Please complete your personality quiz before viewing potential matches.
                    </AlertDescription>
                  </Alert>
                ) : potentialMatches?.length ? (
                  <div className="space-y-4">
                    {potentialMatches.map((match: any) => (
                      <div
                        key={match.id}
                        className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                          selectedMatchId === match.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        }`}
                        onClick={() => setSelectedMatchId(match.id)}
                      >
                        <div className="flex items-center space-x-4">
                          <Avatar className="h-16 w-16">
                            <AvatarImage src={match.avatar || "/default-avatar.png"} alt={match.name} />
                            <AvatarFallback>{match.name?.[0]}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <h4 className="text-lg font-semibold">{match.name}</h4>
                            <p className="text-sm text-muted-foreground">{match.bio}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Alert>
                    <AlertTitle>No potential matches found</AlertTitle>
                    <AlertDescription>
                      We couldn't find any potential matches at the moment. Please try again later.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {step === 3 && selectedMatchId && currentMatch && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium">Preview Your Match</h3>
                <div className="space-y-4">
                  <div className="flex items-center space-x-4">
                    <Avatar className="h-20 w-20">
                      <AvatarImage src={currentMatch.avatar || "/default-avatar.png"} alt={currentMatch.name} />
                      <AvatarFallback>{currentMatch.name?.[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <h4 className="text-xl font-semibold">{currentMatch.name}</h4>
                      <p className="text-muted-foreground">{currentMatch.matchExplanation}</p>
                    </div>
                  </div>

                  <div className="bg-muted p-4 rounded-lg">
                    <h5 className="font-medium mb-2">Compatibility Score</h5>
                    <div className="flex items-center space-x-2">
                      <Progress value={currentMatch.compatibilityScore * 100} className="flex-1" />
                      <span className="text-sm font-medium">{Math.round(currentMatch.compatibilityScore * 100)}%</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {interestFields.map((trait) => (
                      <div key={trait} className="bg-muted p-3 rounded-lg">
                        <div className="text-sm font-medium mb-1">{formatTrait(trait)}</div>
                        <div className="flex items-center space-x-2">
                          <Progress 
                            value={currentMatch.personalityTraits[trait] * 100} 
                            className="flex-1" 
                          />
                          <span className="text-xs">
                            {Math.round(currentMatch.personalityTraits[trait] * 100)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={step === 1 ? onCancel : handleNavigateBack}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {step === 1 ? "Cancel" : "Back"}
            </Button>

            {step === totalSteps ? (
              <Button type="submit">
                <Heart className="w-4 h-4 mr-2" />
                Create Match
              </Button>
            ) : (
              <Button type="button" onClick={handleNavigateNext}>
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

function getStepDescription(step: number): string {
  switch (step) {
    case 1:
      return "Set Your Preferences";
    case 2:
      return "Choose Your Match";
    case 3:
      return "Confirm Connection";
    default:
      return "";
  }
}

function formatTrait(trait: InterestField): string {
  return trait.charAt(0).toUpperCase() + trait.slice(1);
}

function getTraitDescription(trait: InterestField, value: number): string {
  const descriptions: Record<InterestField, [string, string]> = {
    extraversion: ["Prefers quiet, intimate settings", "Enjoys social, energetic environments"],
    communication: ["Values actions over words", "Emphasizes verbal expression"],
    openness: ["Appreciates routine and tradition", "Seeks new experiences"],
    values: ["Flexible with principles", "Strong moral compass"],
    planning: ["Spontaneous and adaptable", "Organized and structured"],
    sociability: ["Values independence", "Thrives in group settings"],
  };

  const [low, high] = descriptions[trait];
  return value < 0.4 ? low : value > 0.6 ? high : "Balanced approach";
}