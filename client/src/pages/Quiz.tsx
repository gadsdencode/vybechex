import { useState } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const questions = [
  {
    id: 1,
    text: "When you spend time with others, how do you feel?",
    options: [
      "I feel happiest and excited in big, lively groups",
      "I feel good talking in small, close-knit groups",
      "I am okay with both small groups and one-on-one time",
      "I feel best when I am alone"
    ],
    trait: "extraversion"
  },
  {
    id: 2,
    text: "How do you usually share your ideas?",
    options: [
      "I say what I think clearly and simply",
      "I choose my words to keep things friendly",
      "I change how I talk depending on who I’m with",
      "I mostly listen and speak only when I need to"
    ],
    trait: "communication"
  },
  {
    id: 3,
    text: "When you find something new or unfamiliar, how do you react?",
    options: [
      "I try it right away without waiting",
      "I’m curious but I like to learn about it first",
      "I go along with new things at an easy pace",
      "I prefer to stick to what I already know"
    ],
    trait: "openness"
  },
  {
    id: 4,
    text: "What matters most to you in close friendships?",
    options: [
      "Having trust and knowing we can count on each other",
      "Doing fun and exciting things together",
      "Having deep talks and understanding each other’s feelings",
      "Sharing common hobbies and interests"
    ],
    trait: "values"
  },
  {
    id: 5,
    text: "How do you like to plan activities?",
    options: [
      "I like to decide on the spot",
      "I prefer to make a clear plan ahead of time",
      "I’m flexible and can change plans if needed",
      "I’m fine with whatever others choose"
    ],
    trait: "planning"
  },
  {
    id: 6,
    text: "What size group do you most enjoy being part of?",
    options: [
      "A large, busy group with many people",
      "A small group of close friends",
      "Just one other person, one-on-one",
      "It depends on what we’re doing"
    ],
    trait: "sociability"
  },
  {
    id: 7,
    text: "If your plans suddenly change, how do you feel?",
    options: [
      "I quickly go along with the new plan",
      "I talk it over with others before changing things",
      "I pause and think carefully about what to do next",
      "I feel uneasy and wish we stuck to the original plan"
    ],
    trait: "openness"
  },
  {
    id: 8,
    text: "Where do you feel most comfortable sharing your true thoughts?",
    options: [
      "In a lively group where everyone is talking",
      "In a quiet, private place with one other person",
      "Online or in writing, where I can think first",
      "After I watch and listen for a while"
    ],
    trait: "communication"
  },
  {
    id: 9,
    text: "How do you discover new hobbies or interests?",
    options: [
      "I jump right in and learn as I go",
      "I read and learn about it before starting",
      "I ask friends for their ideas",
      "I follow what interests me at the moment"
    ],
    trait: "openness"
  },
  {
    id: 10,
    text: "How do you choose what to do on a free weekend?",
    options: [
      "I plan my activities ahead of time",
      "I leave my schedule open and decide later",
      "I see what others want to do",
      "I stick to things I already like"
    ],
    trait: "planning"
  },
  {
    id: 11,
    text: "What matters most when choosing a social activity?",
    options: [
      "Feeling excited and having lots of energy",
      "Having good, meaningful talks",
      "Feeling safe and comfortable",
      "Trying something new and different"
    ],
    trait: "values"
  }
];

export default function Quiz() {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleAnswer = async (questionId: number, answerIndex: number) => {
    const question = questions.find(q => q.id === questionId);
    if (!question) return;

    // Calculate trait score based on answer index (0-3)
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
        setIsSubmitting(true);

        // First verify that we're still authenticated
        const userResponse = await fetch("/api/user", {
          credentials: "include",
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          }
        });
        
        if (userResponse.status === 401) {
          toast({
            title: "Session Expired",
            description: "Please log in again to continue.",
            variant: "destructive"
          });
          navigate("/login");
          return;
        }

        // Submit quiz
        const res = await fetch("/api/quiz", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            'Accept': 'application/json'
          },
          body: JSON.stringify({ traits: newAnswers }),
          credentials: "include",
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ message: "Failed to submit quiz" }));
          throw new Error(errorData.message || "Failed to submit quiz");
        }

        // Wait for the response data
        const responseData = await res.json();
        console.log("Quiz submission response:", responseData);

        // Force immediate refetch of user data
        await queryClient.refetchQueries({ 
          queryKey: ['/api/user'],
          type: 'active',
          exact: true
        });

        // Verify that the quiz completion was registered
        const updatedUserResponse = await fetch("/api/user", {
          credentials: "include",
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          }
        });

        if (!updatedUserResponse.ok) {
          throw new Error("Failed to verify quiz completion");
        }

        const updatedUserData = await updatedUserResponse.json();
        console.log("Updated user data after quiz:", updatedUserData);

        if (!updatedUserData?.user?.quizCompleted) {
          throw new Error("Quiz completion was not registered properly");
        }

        toast({
          title: "Quiz completed!",
          description: "Great! Now let's find you some compatible friends!",
        });

        // Invalidate matches query after confirming quiz completion
        await queryClient.invalidateQueries({ queryKey: ['matches'] });

        navigate("/matches");
      } catch (error: any) {
        console.error("Quiz submission error:", error);
        toast({
          title: "Error",
          description: error.message || "Failed to submit quiz. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsSubmitting(false);
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
              disabled={isSubmitting}
            >
              {option}
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}
