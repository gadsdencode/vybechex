'use client'

import { useEffect, useRef, useState } from "react";
import { useMatches } from "../hooks/use-matches";
import { useUser } from "../hooks/use-user";
import { Loader2, Users } from 'lucide-react';
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { MatchCard } from "../components/MatchCard";
import { NetworkGraph } from "../components/NetworkGraph";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MatchRequests } from "../components/match-requests";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function Matches() {
  const { user } = useUser();
  const { matches, requests, isLoading, isResponding, connect, respondToMatch } = useMatches();
  const [showNetwork, setShowNetwork] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only proceed if we have matches and all refs are available
    if (!isLoading && 
        matches?.length > 0 && 
        headerRef.current && 
        networkRef.current && 
        cardsRef.current) {
      
      const ctx = gsap.context(() => {
        // Ensure initial visibility
        gsap.set([headerRef.current, networkRef.current, cardsRef.current.children], {
          autoAlpha: 1
        });

        // Animate header
        gsap.from(headerRef.current, {
          autoAlpha: 0,
          y: -20,
          duration: 0.5,
          clearProps: "all"
        });

        // Animate network
        gsap.from(networkRef.current, {
          autoAlpha: 0,
          duration: 0.5,
          clearProps: "all"
        });

        // Animate cards
        gsap.from(cardsRef.current.children, {
          autoAlpha: 0,
          y: 20,
          duration: 0.5,
          stagger: 0.1,
          clearProps: "all"
        });
      });

      // Cleanup function
      return () => ctx.revert();
    }
  }, [isLoading, matches]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground animate-pulse">Finding your perfect matches...</p>
      </div>
    );
  }

  if (!user?.quizCompleted) {
    return (
      <div className="max-w-4xl mx-auto text-center py-16 px-4">
        <Users className="h-16 w-16 mx-auto mb-6 text-primary animate-bounce" />
        <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Complete Your Profile</h1>
        <p className="text-xl text-muted-foreground mb-8">
          Take our personality quiz to unlock a world of compatible friends!
        </p>
        <Button asChild size="lg" className="animate-pulse">
          <Link href="/quiz">Take the Quiz</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div ref={headerRef} className="text-center mb-12">
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Your Matches</h1>
        <p className="text-xl text-muted-foreground">Discover your perfect connections</p>
      </div>

      <Tabs defaultValue="matches" className="mb-16">
        <TabsList className="mx-auto">
          <TabsTrigger value="matches">
            Matches
            {matches?.length > 0 && (
              <span className="ml-2 bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs">
                {matches.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="requests">
            Requests
            {requests?.length > 0 && (
              <span className="ml-2 bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs">
                {requests.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="matches">
          {matches && matches.length > 0 ? (
            <>
              <div ref={networkRef} className="mb-16">
                <h2 className="text-2xl font-semibold mb-6 text-center">Your Connection Network</h2>
                <div className="bg-card rounded-xl shadow-lg p-6 overflow-hidden">
                  <Button 
                    onClick={() => setShowNetwork(!showNetwork)} 
                    className="mb-4 mx-auto block"
                  >
                    {showNetwork ? "Hide Network" : "Show Network"}
                  </Button>
                  {showNetwork && <NetworkGraph />}
                </div>
              </div>
              
              <h2 className="text-2xl font-semibold mb-6 text-center">Your Match Cards</h2>
              <div 
                ref={cardsRef} 
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 min-h-[200px] relative"
              >
                {matches.map((match) => (
                  <div key={match.id} className="opacity-100">
                    <MatchCard match={match} />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-16">
              <Users className="h-16 w-16 mx-auto mb-6 text-muted-foreground" />
              <p className="text-xl text-muted-foreground mb-8">No matches found yet. Keep exploring to find compatible friends!</p>
              <Button asChild size="lg">
                <Link href="/explore">Explore More</Link>
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="requests" className="min-h-[200px]">
          <MatchRequests
            requests={requests || []}
            isResponding={isResponding}
            onRespond={(matchId, status) => respondToMatch({ matchId, status })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
