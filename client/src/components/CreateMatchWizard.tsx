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

const wizardSchema = z.object({
  interests: z.object({
    extraversion: z.number().min(0).max(1),
    communication: z.number().min(0).max(1),
    openness: z.number().min(0).max(1),
    values: z.number().min(0).max(1),
    planning: z.number().min(0).max(1),
    sociability: z.number().min(0).max(1),
  }),
});

type WizardFormData = z.infer<typeof wizardSchema>;

interface CreateMatchWizardProps {
  onComplete: () => void;
  onCancel: () => void;
}

export default function CreateMatchWizard({ onComplete, onCancel }: CreateMatchWizardProps) {
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

  const nextStep = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    }
  };

  const prevStep = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const onSubmit = async (data: WizardFormData) => {
    try {
      if (!user) {
        throw new Error("You must be logged in to create a match");
      }

      // Calculate compatibility score based on interests
      const userTraits = data.interests;
      const compatibilityScore = Object.values(userTraits).reduce((sum, val) => sum + val, 0) / Object.keys(userTraits).length;

      // Create the match
      await connect({
        id: initialMatchId || '',
        score: Math.round(compatibilityScore * 100)
      });

      toast({
        title: "Match Created!",
        description: "Your match preferences have been saved.",
      });
      onComplete();
    } catch (error) {
      console.error('Error creating match:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create match",
        variant: "destructive",
      });
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
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent>
            {step === 1 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">What are you looking for?</h3>
                {Object.entries(form.getValues().interests).map(([trait, value]) => (
                  <FormField
                    key={trait}
                    control={form.control}
                    name={`interests.${trait}`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{formatTrait(trait)}</FormLabel>
                        <FormControl>
                          <Slider
                            min={0}
                            max={1}
                            step={0.1}
                            value={[field.value]}
                            onValueChange={([value]) => field.onChange(value)}
                          />
                        </FormControl>
                        <FormDescription>
                          {getTraitDescription(trait, field.value)}
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Preview Potential Matches</h3>
                {/* TODO: Add match preview based on selected traits */}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Confirm Your Preferences</h3>
                {/* TODO: Add summary and confirmation step */}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={step === 1 ? onCancel : prevStep}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {step === 1 ? "Cancel" : "Back"}
            </Button>

            <Button type="button" onClick={step === totalSteps ? form.handleSubmit(onSubmit) : nextStep}>
              {step === totalSteps ? (
                <>
                  <Heart className="w-4 h-4 mr-2" />
                  Create Match
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
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

function formatTrait(trait: string): string {
  return trait.charAt(0).toUpperCase() + trait.slice(1);
}

function getTraitDescription(trait: string, value: number): string {
  const descriptions: Record<string, [string, string]> = {
    extraversion: ["Prefers quiet, intimate settings", "Enjoys social, energetic environments"],
    communication: ["Values actions over words", "Emphasizes verbal expression"],
    openness: ["Appreciates routine and tradition", "Seeks new experiences"],
    values: ["Flexible with principles", "Strong moral compass"],
    planning: ["Spontaneous and adaptable", "Organized and structured"],
    sociability: ["Values independence", "Thrives in group settings"],
  };

  const [low, high] = descriptions[trait] || ["Low", "High"];
  return value < 0.4 ? low : value > 0.6 ? high : "Balanced approach";
}
