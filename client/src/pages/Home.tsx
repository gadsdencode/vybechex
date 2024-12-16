import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useUser } from "../hooks/use-user";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function Home() {
  const { user } = useUser();
  const heroRef = useRef(null);
  const imageGridRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef(null);

  useEffect(() => {
    const heroElement = heroRef.current;
    const imageGridElement = imageGridRef.current;
    const ctaElement = ctaRef.current;

    gsap.fromTo(
      heroElement,
      { opacity: 0, y: 50 },
      { opacity: 1, y: 0, duration: 1, ease: "power3.out" }
    );

    if (imageGridElement) {
      gsap.fromTo(
        imageGridElement.children,
        { opacity: 0, scale: 0.8 },
        {
          opacity: 1,
          scale: 1,
          duration: 0.8,
          stagger: 0.2,
          ease: "back.out(1.7)",
          scrollTrigger: {
            trigger: imageGridElement,
            start: "top bottom-=100",
          },
        }
      );
    }

    gsap.fromTo(
      ctaElement,
      { opacity: 0, y: 30 },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        scrollTrigger: {
          trigger: ctaElement,
          start: "top bottom-=50",
        },
      }
    );
  }, []);

  return (
    <div className="flex flex-col items-center text-center max-w-6xl mx-auto px-4 py-12">
      <section ref={heroRef} className="mb-16">
        <h1 className="text-5xl md:text-7xl font-extrabold mb-6 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent animate-gradient">
          Welcome to FriendMatch
        </h1>
        <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto">
          Discover meaningful connections through our AI-powered matching system.
        </p>
      </section>

      <section
        ref={imageGridRef}
        className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16"
      >
        <div className="relative overflow-hidden rounded-lg shadow-lg group">
          <img
            src="https://images.unsplash.com/photo-1511632765486-a01980e01a18"
            alt="Friends enjoying time together"
            className="w-full h-64 object-cover transition-transform duration-300 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <p className="absolute bottom-4 left-4 text-white text-lg font-semibold">
              Create Memories
            </p>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-lg shadow-lg group">
          <img
            src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac"
            alt="Group of diverse friends"
            className="w-full h-64 object-cover transition-transform duration-300 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <p className="absolute bottom-4 left-4 text-white text-lg font-semibold">
              Escape From Loneliness
            </p>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-lg shadow-lg group">
          <img
            src="https://images.unsplash.com/photo-1506869640319-fe1a24fd76dc"
            alt="Friends hanging out"
            className="w-full h-64 object-cover transition-transform duration-300 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <p className="absolute bottom-4 left-4 text-white text-lg font-semibold">
              Build Connections
            </p>
          </div>
        </div>
      </section>

      <section ref={ctaRef} className="mb-16">
        <div className="prose prose-lg max-w-3xl mb-8">
          <p className="text-xl leading-relaxed">
            Embark on a journey of self-discovery and meaningful connections.
            Our AI-powered personality quiz matches you with like-minded
            individuals, opening doors to lasting friendships.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            size="lg"
            className="bg-gradient-to-r from-primary to-secondary hover:from-primary/80 hover:to-secondary/80 text-white font-semibold py-3 px-6 rounded-full transition-all duration-300 transform hover:scale-105"
            asChild
          >
            <Link href="/quiz">
              {user!.quizCompleted ? "Retake Quiz" : "Take the Personality Quiz"}
            </Link>
          </Button>
          {user!.quizCompleted && (
            <Button
              size="lg"
              variant="outline"
              className="bg-background text-foreground border-2 border-primary hover:bg-primary/10 font-semibold py-3 px-6 rounded-full transition-all duration-300 transform hover:scale-105"
              asChild
            >
              <Link href="/matches">Find Matches</Link>
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}