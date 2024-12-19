import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { Achievement, ProfileProgress } from '@db/schema';

interface AchievementProgress {
  achievements: Achievement[];
  progress: ProfileProgress;
}

export function useAchievements() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<AchievementProgress>({
    queryKey: ['/api/achievements'],
    retry: false,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (updates: Partial<ProfileProgress['sections']>) => {
      const response = await fetch('/api/profile/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
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

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/achievements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
    },
  });

  return {
    achievements: data?.achievements || [],
    progress: data?.progress,
    isLoading,
    updateProgress: updateProfileMutation.mutateAsync,
  };
}
