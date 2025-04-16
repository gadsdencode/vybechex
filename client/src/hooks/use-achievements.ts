import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { 
  AchievementDefinition, 
  UserAchievementProgress, 
  AchievementCategory 
} from '@db/schema';

interface AchievementProgress {
  achievements: AchievementDefinition[];
  userAchievements: UserAchievementProgress[];
  progress: {
    level: number;
    totalPoints: number;
    sections: Record<string, boolean>;
  };
}

interface ProgressUpdate {
  section: string;
  value: boolean;
}

// XP calculation constants
const BASE_XP_REQUIREMENT = 1000;
const XP_SCALING_FACTOR = 1.5;

export function useAchievements() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<AchievementProgress>({
    queryKey: ['/api/achievements'],
    queryFn: async () => {
      const response = await fetch('/api/achievements', {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Please log in to view achievements');
        }
        throw new Error(await response.text());
      }

      return response.json();
    },
    retry: (failureCount, error) => {
      if (error.message.includes('Please log in')) {
        return false;
      }
      return failureCount < 3;
    },
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (update: ProgressUpdate) => {
      const response = await fetch('/api/profile/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: update.section,
          completed: update.value
        }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = await response.json();
      
      if (data.newAchievements?.length > 0) {
        data.newAchievements.forEach((achievement: AchievementDefinition) => {
          toast({
            title: `🎉 Achievement Unlocked: ${achievement.name}`,
            description: `${achievement.description} (+${achievement.points} XP)`,
            duration: 5000,
          });
        });
      }

      if (data.levelUp) {
        toast({
          title: '🌟 Level Up!',
          description: `Congratulations! You've reached level ${data.newLevel}`,
          duration: 5000,
        });
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/achievements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error updating progress',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const calculateXpForNextLevel = (currentLevel: number): number => {
    return Math.round(BASE_XP_REQUIREMENT * Math.pow(XP_SCALING_FACTOR, currentLevel - 1));
  };

  const calculateProgress = () => {
    if (!data?.progress?.sections) return 0;
    
    // Define weights for different section types
    const sectionWeights: Record<string, number> = {
      profileComplete: 1.5,  // Higher weight for profile completion
      bioAdded: 1.2,        // Moderate weight for bio
      avatarUploaded: 1.0,  // Standard weight for avatar
    };

    const sections = Object.entries(data.progress.sections);
    let totalWeight = 0;
    let completedWeight = 0;

    sections.forEach(([sectionKey, isComplete]) => {
      const weight = sectionWeights[sectionKey] || 1.0;
      totalWeight += weight;
      if (isComplete) {
        completedWeight += weight;
      }
    });

    return Math.round((completedWeight / totalWeight) * 100);
  };

  const getUnlockedAchievements = () => {
    return data?.userAchievements || [];
  };

  const getLockedAchievements = () => {
    if (!data?.achievements || !data?.userAchievements) return [];
    
    const unlockedIds = new Set(data.userAchievements.map(ua => ua.achievementId));
    return data.achievements.filter(a => !unlockedIds.has(a.id));
  };

  const getTotalPossibleXp = () => {
    if (!data?.achievements) return 0;
    return data.achievements.reduce((total, achievement) => total + achievement.points, 0);
  };

  const getAchievementsByCategory = (category: AchievementCategory) => {
    return data?.achievements.filter(a => a.category === category) || [];
  };

  return {
    achievements: data?.achievements || [],
    unlockedAchievements: getUnlockedAchievements(),
    lockedAchievements: getLockedAchievements(),
    progress: data?.progress,
    isLoading,
    error,
    totalProgress: calculateProgress(),
    updateProgress: updateProfileMutation.mutateAsync,
    calculateXpForNextLevel,
    totalPossibleXp: getTotalPossibleXp(),
    getAchievementsByCategory,
  };
}
