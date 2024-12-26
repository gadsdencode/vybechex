'use client'

import { useEffect, useRef, useState } from "react";
import { useMatches } from "@/hooks/use-matches";
import { useUser } from "@/hooks/use-user";
import { Loader2, Users } from 'lucide-react';
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { MatchCard } from "@/components/MatchCard";
import { NetworkGraph } from "@/components/NetworkGraph";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MatchRequests } from "@/components/match-requests";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Heart, Zap } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

export default function Matches() {
  const { matches, requests, isLoading, respondToMatch, isResponding } = useMatches();
  const { user, isLoading: isLoadingUser } = useUser();

  console.log('User data:', user);
  console.log('Raw matches data:', matches);
  console.log('Raw requests data:', requests);

  // Ensure we have arrays even if matches is undefined
  const acceptedMatches = matches?.filter(match => match.status === 'accepted') || [];
  const potentialMatches = matches?.filter(match => match.status === 'potential') || [];

  console.log('Filtered accepted matches:', acceptedMatches);
  console.log('Filtered potential matches:', potentialMatches);

  // Show loading state while either matches or user data is loading
  if (isLoading || isLoadingUser) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show login prompt if no user
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] flex-col gap-4">
        <p className="text-muted-foreground">Please log in to view matches</p>
        <Button asChild>
          <Link href="/login">Log In</Link>
        </Button>
      </div>
    );
  }

  // Show profile completion prompt if quiz not completed
  if (!user.quizCompleted) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] flex-col gap-4">
        <p className="text-muted-foreground">Complete your profile to start matching!</p>
        <Button asChild>
          <Link href="/profile">Complete Profile</Link>
        </Button>
      </div>
    );
  }

  // Show empty state if no matches
  if (!matches || matches.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Your Matches</h1>
            <p className="text-muted-foreground">
              Find and connect with compatible friends
            </p>
          </div>
          <Button asChild className="flex items-center gap-2">
            <Link href="/matches/create">
              <Heart className="h-4 w-4" />
              Create Match
            </Link>
          </Button>
        </div>

        <div className="text-center py-12">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Start Your Matching Journey</h3>
          <p className="text-muted-foreground mb-4">
            Create your first match to start connecting with compatible friends!
          </p>
          <Button asChild>
            <Link href="/matches/create">Create Your First Match</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Your Matches</h1>
          <p className="text-muted-foreground">
            Find and connect with compatible friends
          </p>
        </div>
        <Button asChild className="flex items-center gap-2">
          <Link href="/matches/create">
            <Heart className="h-4 w-4" />
            Create Match
          </Link>
        </Button>
      </div>

      {requests && requests.length > 0 && (
        <div className="mb-8">
          <MatchRequests
            requests={requests}
            onRespond={respondToMatch}
            isResponding={isResponding}
          />
        </div>
      )}

      <Tabs defaultValue="matches" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="matches">
            Current Matches ({acceptedMatches.length})
          </TabsTrigger>
          <TabsTrigger value="potential">
            Potential Matches ({potentialMatches.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="matches">
          {acceptedMatches.length === 0 ? (
            <div className="text-center py-12">
              <Heart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Matches Yet</h3>
              <p className="text-muted-foreground mb-4">
                Start by exploring potential matches or create a new match!
              </p>
              <Button asChild>
                <Link href="/matches/create">Create Match</Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {acceptedMatches.map((match) => (
                <MatchCard 
                  key={match.id} 
                  match={match} 
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="potential">
          {potentialMatches.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Potential Matches</h3>
              <p className="text-muted-foreground mb-4">
                Create a new match to find compatible friends!
              </p>
              <Button asChild>
                <Link href="/matches/create">Create Match</Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {potentialMatches.map((match) => (
                <MatchCard 
                  key={match.id} 
                  match={match} 
                  isPotential={true}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {(acceptedMatches.length > 0 || potentialMatches.length > 0) && (
        <div className="mt-12 w-full">
          <NetworkGraph
            matches={[...acceptedMatches, ...potentialMatches]}
            userId={user?.id || 0}
            visible={true}
          />
        </div>
      )}
    </div>
  );
}