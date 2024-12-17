'use client'

import { useLayoutEffect, useRef, FC } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useUser } from "../hooks/use-user";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface User {
  quizCompleted: boolean;
}

interface UseUserHook {
  user: User | null;
}

const Home: FC = () => {
  const { user } = useUser() as UseUserHook;
  const heroRef = useRef<HTMLElement | null>(null);
  const imageGridRef = useRef<HTMLElement | null>(null);
  const ctaRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const heroElement = heroRef.current;
    const imageGridElement = imageGridRef.current;
    const ctaElement = ctaRef.current;

    const ctx = gsap.context(() => {
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
    });

    return () => ctx.revert(); // This will clean up the GSAP animations on unmount
  }, []);

  return (
    <main className="flex flex-col items-center text-center max-w-6xl mx-auto px-4 py-12">
      <section ref={heroRef} className="mb-16 relative overflow-hidden rounded-lg p-5 m-5">
        <h1 className="text-5xl md:text-7xl font-extrabold mb-6 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent animate-gradient relative z-10">
          Welcome to VybeCheck
        </h1>
        <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto relative z-10">
          Discover meaningful connections through our AI-powered matching system.
        </p>
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-secondary/10 filter blur-3xl transform scale-110 z-0" aria-hidden="true"></div>
      </section>

      <section
        ref={imageGridRef}
        className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16"
        aria-label="Feature highlights"
      >
        {[
          { src: "https://images.unsplash.com/photo-1511632765486-a01980e01a18", alt: "Friends enjoying time together", text: "Create Memories" },
          { src: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac", alt: "Group of diverse friends", text: "Escape From Loneliness" },
          { src: "https://images.unsplash.com/photo-1506869640319-fe1a24fd76dc", alt: "Friends hanging out", text: "Build Connections" },
        ].map((item, index) => (
          <div key={index} className="relative overflow-hidden rounded-lg shadow-lg group">
            <img
              src={item.src}
              alt={item.alt}
              className="w-full h-64 object-cover transition-transform duration-300 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <p className="absolute bottom-4 left-4 text-white text-lg font-semibold">
                {item.text}
              </p>
            </div>
          </div>
        ))}
      </section>

      <section ref={ctaRef} className="mb-16 relative">
        <div className="prose prose-lg max-w-3xl mb-8 relative z-10">
          <p className="text-xl leading-relaxed">
            Embark on a journey of self-discovery and meaningful connections.
            Our AI-powered personality quiz matches you with like-minded
            individuals, opening doors to lasting friendships.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center relative z-10">
          <Button
            size="lg"
            className="bg-gradient-to-r from-primary to-secondary hover:from-primary/80 hover:to-secondary/80 text-white font-semibold py-3 px-6 rounded-full transition-all duration-300 transform hover:scale-105 hover:shadow-lg"
            asChild
          >
            <Link href="/quiz">
              {user?.quizCompleted ? "Retake Quiz" : "Take the Personality Quiz"}
            </Link>
          </Button>
          {user?.quizCompleted && (
            <Button
              size="lg"
              variant="outline"
              className="bg-background text-foreground border-2 border-primary hover:bg-primary/10 font-semibold py-3 px-6 rounded-full transition-all duration-300 transform hover:scale-105 hover:shadow-lg"
              asChild
            >
              <Link href="/matches">Find Matches</Link>
            </Button>
          )}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/50 filter blur-2xl transform scale-110 z-0" aria-hidden="true"></div>
      </section>
    </main>
  );
}

export default Home;