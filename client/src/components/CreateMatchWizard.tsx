import { useState } from "react";
import { useUser } from "@/hooks/use-user";
import { useMatches } from "@/hooks/use-matches";
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

export default function CreateMatchWizard({ initialMatchId, onComplete, onCancel }: CreateMatchWizardProps) {
  const [step, setStep] = useState(1);
  const { user } = useUser();
  const { connect } = useMatches();
  const { toast } = useToast();
  const totalSteps = 3;

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
  });

  const progress = (step / totalSteps) * 100;

  const handleNavigateNext = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (step < totalSteps) {
      setStep(prev => prev + 1);
    }
  };

  const handleNavigateBack = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (step > 1) {
      setStep(prev => prev - 1);
    }
  };

  const handleFormSubmit = async (data: WizardFormData) => {
    // Only process form submission on the final step
    if (step !== totalSteps) {
      return;
    }

    try {
      if (!user) {
        throw new Error("You must be logged in to create a match");
      }

      if (!initialMatchId) {
        throw new Error("No match ID provided");
      }

      const userTraits = data.interests;
      const compatibilityScore = Object.values(userTraits).reduce((sum, val) => sum + val, 0) / Object.keys(userTraits).length;

      const match = await connect({
        id: initialMatchId,
        score: Math.round(compatibilityScore * 100)
      });

      if (match) {
        toast({
          title: "Match Created!",
          description: "Your match preferences have been saved.",
        });
        onComplete();
      }
    } catch (error: any) {
      console.error('Error creating match:', error);
      
      if (error.message.includes('already exists')) {
        toast({
          title: "Match Exists",
          description: "You already have a match with this user.",
          variant: "default",
        });
        onComplete();
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
        <form 
          onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            e.stopPropagation();
            if (step === totalSteps) {
              void form.handleSubmit(handleFormSubmit)(e);
            }
          }}
          onChange={(e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
          }}
          onInput={(e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
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
                                // Batch updates to prevent unnecessary rerenders
                                requestAnimationFrame(() => {
                                  // Update field value without validation
                                  field.onChange(newValue);
                                  // Silent form state update
                                  form.setValue(`interests.${trait}`, newValue, {
                                    shouldValidate: false,
                                    shouldDirty: false,
                                    shouldTouch: false,
                                  });
                                });
                              }
                            }}
                            onValueCommit={([newValue]) => {
                              if (typeof newValue === 'number' && !Number.isNaN(newValue)) {
                                form.setValue(`interests.${trait}`, newValue, {
                                  shouldValidate: false,
                                });
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
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Preview Potential Matches</h3>
                {/* Preview content */}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Confirm Your Preferences</h3>
                {/* Confirmation content */}
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
      return "Define your preferences";
    case 2:
      return "Preview potential matches";
    case 3:
      return "Review and confirm";
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