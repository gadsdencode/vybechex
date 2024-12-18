import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/hooks/use-user";
import { useMatches } from "@/hooks/use-matches";
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
  const { user } = useUser();
  const { connect } = useMatches();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const totalSteps = 3;

  const { data: potentialMatch } = useQuery({
    queryKey: ['potential-match', initialMatchId],
    queryFn: async () => {
      const response = await fetch(`/api/users/${initialMatchId}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch potential match');
      }
      return response.json();
    },
    enabled: !!initialMatchId && step > 1,
    staleTime: 30000,
  });

  const form = useForm<WizardFormData>({
    resolver: zodResolver(wizardSchema),
    defaultValues: {
      interests: {
        extraversion: 0.5,
        communication: 0.5,
        openness: 0.5,
        values: 0.5,
        planning: 0.5,
        sociability: 0.5,
      },
    },
    mode: 'onChange',
  });

  const progress = (step / totalSteps) * 100;

  const calculateCompatibility = () => {
    if (!potentialMatch?.personalityTraits || !form.getValues().interests) {
      return 0;
    }

    const userTraits = form.getValues().interests;
    const matchTraits = potentialMatch.personalityTraits;
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

  const handleFormSubmit = async (data: WizardFormData) => {
    if (step !== totalSteps) {
      return;
    }

    try {
      if (!user) {
        throw new Error("You must be logged in to create a match");
      }

   
      if (!initialMatchId || isNaN(Number(initialMatchId)) || Number(initialMatchId) <= 0) {
        throw new Error("Invalid match ID. Please provide a valid positive number.");
      }

      const response = await connect({
        id: initialMatchId
      });

      if (response.status === 'requested') {
        toast({
          title: "Request Sent",
          description: "Your connection request has been sent. We'll notify you as soon as they respond!",
          variant: "default",
          duration: 2500
        });
      }

      if (response.status === 'accepted') {
        setLocation(`/chat/${initialMatchId}`);
      }
      
      onComplete();
    } catch (error: any) {
      console.error('Error creating match:', error);
      
      if (error.message.includes('already exists')) {
        toast({
          title: "Match Exists",
          description: "You already have a match with this user.",
          variant: "default",
        });
        setLocation(`/chat/${initialMatchId}`);
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
          description: error.message || "Failed to create match",
          variant: "destructive",
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
                <h3 className="text-lg font-medium">Preview Your Potential Match</h3>
                {potentialMatch ? (
                  <div className="space-y-4">
                    <div className="flex items-center space-x-4">
                      <Avatar className="h-20 w-20">
                        <AvatarImage src={potentialMatch.avatar || "/default-avatar.png"} alt={potentialMatch.name} />
                        <AvatarFallback>{potentialMatch.name?.[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <h4 className="text-xl font-semibold">{potentialMatch.name}</h4>
                        <p className="text-muted-foreground">{potentialMatch.bio || "No bio available"}</p>
                      </div>
                    </div>

                    <div className="bg-muted p-4 rounded-lg">
                      <h5 className="font-medium mb-2">Compatibility Score</h5>
                      <div className="flex items-center space-x-2">
                        <Progress value={calculateCompatibility()} className="flex-1" />
                        <span className="text-sm font-medium">{calculateCompatibility()}%</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {interestFields.map((trait) => (
                        <div key={trait} className="bg-muted p-3 rounded-lg">
                          <div className="text-sm font-medium mb-1">{formatTrait(trait)}</div>
                          <div className="flex items-center space-x-2">
                            <Progress 
                              value={potentialMatch.personalityTraits[trait] * 100} 
                              className="flex-1" 
                            />
                            <span className="text-xs">
                              {Math.round(potentialMatch.personalityTraits[trait] * 100)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-40">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium">Confirm Your Match</h3>
                {potentialMatch && (
                  <div className="space-y-4">
                    <Alert>
                      <AlertTitle>You're about to connect with {potentialMatch.name}</AlertTitle>
                      <AlertDescription>
                        Based on your preferences, you have a {calculateCompatibility()}% compatibility match.
                        This will create a new connection and allow you to start chatting.
                      </AlertDescription>
                    </Alert>

                    <div className="bg-muted p-4 rounded-lg">
                      <h4 className="font-medium mb-2">Your Selected Preferences</h4>
                      <div className="grid grid-cols-2 gap-4">
                        {interestFields.map((trait) => (
                          <div key={trait} className="space-y-1">
                            <div className="text-sm font-medium">{formatTrait(trait)}</div>
                            <Progress 
                              value={form.getValues().interests[trait] * 100} 
                              className="h-2" 
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
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
      return "Preview Your Match";
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