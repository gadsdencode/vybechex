import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { Achievement, ProfileProgress, UserAchievement } from '@db/schema';

interface AchievementProgress {
  achievements: Achievement[];
  userAchievements: UserAchievement[];
  progress: ProfileProgress;
}

interface ProgressUpdate {
  section: keyof ProfileProgress['sections'];
  value: boolean;
}

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
    staleTime: 30000, // Consider data fresh for 30 seconds
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
      
      // Show achievement notifications
      if (data.newAchievements?.length > 0) {
        data.newAchievements.forEach((achievement: Achievement) => {
          toast({
            title: `🎉 Achievement Unlocked: ${achievement.name}`,
            description: `${achievement.description} (+${achievement.points} XP)`,
            duration: 5000,
          });
        });
      }

      // Show level up notification if applicable
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

  const calculateProgress = () => {
    if (!data?.progress?.sections) return 0;
    
    const sections = Object.values(data.progress.sections);
    const completedSections = sections.filter(Boolean).length;
    return Math.round((completedSections / sections.length) * 100);
  };

  const getUnlockedAchievements = () => {
    return data?.userAchievements || [];
  };

  const getLockedAchievements = () => {
    if (!data?.achievements || !data?.userAchievements) return [];
    
    const unlockedIds = new Set(data.userAchievements.map(ua => ua.achievementId));
    return data.achievements.filter(a => !unlockedIds.has(a.id));
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
  };
}
