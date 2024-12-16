import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useUser } from "../hooks/use-user";

export default function Home() {
  const { user } = useUser();

  return (
    <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold mb-6 bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
        Welcome to FriendMatch
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        <img
          src="https://images.unsplash.com/photo-1511632765486-a01980e01a18"
          alt="Friends enjoying time together"
          className="rounded-lg shadow-lg"
        />
        <img
          src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac"
          alt="Group of diverse friends"
          className="rounded-lg shadow-lg"
        />
        <img
          src="https://images.unsplash.com/photo-1506869640319-fe1a24fd76dc"
          alt="Friends hanging out"
          className="rounded-lg shadow-lg"
        />
      </div>

      <div className="prose prose-lg max-w-2xl mb-8">
        <p>
          Find meaningful friendships through our AI-powered matching system.
          Take our personality quiz and connect with like-minded people!
        </p>
      </div>

      <div className="flex gap-4 justify-center">
        <Button size="lg" asChild>
          <Link href="/quiz">
            {user.quizCompleted ? "Retake Quiz" : "Take the Personality Quiz"}
          </Link>
        </Button>
        {user.quizCompleted && (
          <Button size="lg" asChild>
            <Link href="/matches">Find Matches</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
