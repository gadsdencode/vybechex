import { useState } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const questions = [
  {
    id: 1,
    text: "How do you prefer to spend your free time?",
    options: ["Socializing", "Reading/Solo activities", "Mix of both", "Outdoor adventures"],
  },
  {
    id: 2,
    text: "What's your ideal weekend activity?",
    options: ["Party/Events", "Relaxing at home", "Sports/Exercise", "Creative projects"],
  },
  {
    id: 3,
    text: "How do you handle new situations?",
    options: ["Jump right in", "Observe first", "Depends on mood", "Carefully plan"],
  },
  // Add more questions as needed
];

export default function Quiz() {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const handleAnswer = async (questionId: number, answerIndex: number) => {
    const newAnswers = { ...answers, [questionId]: answerIndex };
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

        if (!res.ok) throw new Error("Failed to submit quiz");

        toast({
          title: "Quiz completed!",
          description: "Let's find you some matches!",
        });

        navigate("/matches");
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to submit quiz. Please try again.",
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
