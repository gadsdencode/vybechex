import { useState } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const questions = [
  {
    id: 1,
    text: "How do you prefer to spend your free time?",
    options: ["Socializing with friends", "Reading or solo activities", "Mix of both", "Outdoor adventures"],
    trait: "extraversion"
  },
  {
    id: 2,
    text: "What's your communication style?",
    options: ["Direct and straightforward", "Diplomatic and tactful", "Mix depending on situation", "Prefer listening to speaking"],
    trait: "communication"
  },
  {
    id: 3,
    text: "How do you handle new situations?",
    options: ["Jump right in", "Observe first", "Go with the flow", "Plan carefully"],
    trait: "openness"
  },
  {
    id: 4,
    text: "What do you value most in friendships?",
    options: ["Loyalty and trust", "Fun and excitement", "Deep conversations", "Similar interests"],
    trait: "values"
  },
  {
    id: 5,
    text: "How do you prefer to make plans?",
    options: ["Spontaneous decisions", "Structured planning", "Flexible scheduling", "Go with group consensus"],
    trait: "planning"
  },
  {
    id: 6,
    text: "What's your ideal group size for social activities?",
    options: ["Large groups (6+ people)", "Small groups (2-3 people)", "One-on-one interactions", "Depends on the activity"],
    trait: "sociability"
  }
];

export default function Quiz() {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleAnswer = async (questionId: number, answerIndex: number) => {
    const question = questions.find(q => q.id === questionId);
    if (!question) return;

    // Calculate trait score based on answer index (0-3)
    // This creates a personality profile where each trait is scored 0-1
    const traitScore = (3 - answerIndex) / 3; // Normalize to 0-1 range
    const newAnswers = {
      ...answers,
      [question.trait]: traitScore
    };
    setAnswers(newAnswers);

    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(curr => curr + 1);
    } else {
      try {
        const res = await fetch("/api/quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ traits: newAnswers }),
          credentials: "include",
        });

        if (!res.ok) {
          const error = await res.text();
          throw new Error(error);
        }
        
        // Force refresh user data to update quiz completion status
        await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
        
        toast({
          title: "Quiz completed!",
          description: "Great! Now let's find you some compatible friends!",
        });

        navigate("/matches");
      } catch (error: any) {
        console.error("Quiz submission error:", error);
        toast({
          title: "Error",
          description: error.message || "Failed to submit quiz. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  const question = questions[currentQuestion];

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-center mb-8">Personality Quiz</h1>
      
      <div className="mb-4">
        <div className="w-full bg-secondary h-2 rounded-full">
          <div 
            className="bg-primary h-2 rounded-full transition-all"
            style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-6">{question.text}</h2>
        
        <div className="grid gap-4">
          {question.options.map((option, index) => (
            <Button
              key={index}
              variant="outline"
              className="justify-start h-auto py-4 px-6 text-left"
              onClick={() => handleAnswer(question.id, index)}
            >
              {option}
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}
