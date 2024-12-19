import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Interest {
  id: number;
  name: string;
  categoryId: number;
  description?: string;
}

interface Category {
  id: number;
  name: string;
  description?: string;
}

interface UserInterest {
  id: number;
  interestId: number;
  score: number;
  interest: Interest;
}

export function InterestTagger() {
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch categories
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['interest-categories'],
    queryFn: async () => {
      const response = await fetch('/api/interests/categories');
      if (!response.ok) throw new Error('Failed to fetch categories');
      return response.json();
    }
  });

  // Fetch available interests
  const { data: availableInterests = [] } = useQuery<Interest[]>({
    queryKey: ['interests', selectedCategory],
    queryFn: async () => {
      const url = selectedCategory 
        ? `/api/interests?categoryId=${selectedCategory}`
        : '/api/interests';
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch interests');
      return response.json();
    }
  });

  // Fetch user's interests
  const { data: userInterests = [] } = useQuery<UserInterest[]>({
    queryKey: ['user-interests'],
    queryFn: async () => {
      const response = await fetch('/api/user/interests');
      if (!response.ok) throw new Error('Failed to fetch user interests');
      return response.json();
    }
  });

  // Add interest mutation
  const addInterest = useMutation({
    mutationFn: async ({ interestId, score }: { interestId: number, score: number }) => {
      const response = await fetch('/api/user/interests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interestId, score }),
      });
      if (!response.ok) throw new Error('Failed to add interest');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-interests'] });
      toast({
        title: "Interest Added",
        description: "Your interest has been added successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Remove interest mutation
  const removeInterest = useMutation({
    mutationFn: async (interestId: number) => {
      const response = await fetch(`/api/user/interests/${interestId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to remove interest');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-interests'] });
      toast({
        title: "Interest Removed",
        description: "Your interest has been removed successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update interest score mutation
  const updateScore = useMutation({
    mutationFn: async ({ interestId, score }: { interestId: number, score: number }) => {
      const response = await fetch(`/api/user/interests/${interestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score }),
      });
      if (!response.ok) throw new Error('Failed to update interest score');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-interests'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="h-5 w-5" />
          Your Interests
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Category Filter */}
          <div className="w-full max-w-xs">
            <Select
              value={selectedCategory}
              onValueChange={setSelectedCategory}
            >
              <SelectTrigger>
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Categories</SelectLabel>
                  <SelectItem value="">All Categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id.toString()}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {/* User's Current Interests */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Your Interests</h3>
            <div className="grid gap-4">
              {userInterests.map((userInterest) => (
                <div
                  key={userInterest.id}
                  className="flex items-center gap-4 p-4 bg-muted rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium truncate">
                        {userInterest.interest.name}
                      </h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeInterest.mutate(userInterest.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <Slider
                      className="my-2"
                      value={[userInterest.score]}
                      max={100}
                      step={1}
                      onValueChange={([value]) => {
                        updateScore.mutate({
                          interestId: userInterest.id,
                          score: value
                        });
                      }}
                    />
                    <span className="text-sm text-muted-foreground">
                      Interest Level: {userInterest.score}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Available Interests */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Available Interests</h3>
            <div className="flex flex-wrap gap-2">
              {availableInterests
                .filter(interest => !userInterests.some(ui => ui.interestId === interest.id))
                .map((interest) => (
                  <Badge
                    key={interest.id}
                    variant="secondary"
                    className="cursor-pointer hover:bg-secondary/80"
                    onClick={() => addInterest.mutate({ interestId: interest.id, score: 50 })}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {interest.name}
                  </Badge>
                ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
