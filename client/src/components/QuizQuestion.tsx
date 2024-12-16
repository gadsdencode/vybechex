import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface QuizQuestionProps {
  question: {
    id: number;
    text: string;
    options: string[];
  };
  onAnswer: (questionId: number, answerIndex: number) => void;
  progress: number;
}

export function QuizQuestion({ question, onAnswer, progress }: QuizQuestionProps) {
  return (
    <div className="space-y-6">
      <Progress value={progress} className="w-full h-2" />
      
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-6 text-card-foreground">
          {question.text}
        </h2>
        
        <div className="grid gap-4">
          {question.options.map((option, index) => (
            <Button
              key={index}
              variant="outline"
              className="justify-start h-auto py-4 px-6 text-left hover:bg-primary/10 transition-colors"
              onClick={() => onAnswer(question.id, index)}
            >
              {option}
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}
