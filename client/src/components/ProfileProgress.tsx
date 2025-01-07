import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAchievements } from "@/hooks/use-achievements";
import { Star, Trophy, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProfileProgress() {
  const { achievements, progress, isLoading, totalProgress, unlockedAchievements, lockedAchievements } = useAchievements();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm text-white ml-2 border border-white rounded-md p-2 bg-muted">Loading achievements...</p>
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-sm text-white ml-2 border border-white rounded-md p-2 bg-muted">No achievements yet, complete your profile to start earning them!</p>
      </div>
    );
  }

  const nextLevelXp = progress.level * 1000; // Simple XP calculation
  const xpProgress = (progress.totalPoints / nextLevelXp) * 100;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Level {progress.level}
          </CardTitle>
          <CardDescription>
            {progress.totalPoints} / {nextLevelXp} XP to next level
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={xpProgress} className="h-2" />
          
          <div className="mt-6 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Profile Completion</span>
                <span className="text-sm text-muted-foreground">{totalProgress}%</span>
              </div>
              <Progress value={totalProgress} className="h-2" />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="flex flex-col items-center p-3 bg-muted rounded-lg">
                <span className="text-2xl font-bold">{unlockedAchievements.length}</span>
                <span className="text-sm text-muted-foreground">Achievements</span>
              </div>
              <div className="flex flex-col items-center p-3 bg-muted rounded-lg">
                <span className="text-2xl font-bold">{progress.totalPoints}</span>
                <span className="text-sm text-muted-foreground">Total XP</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            Achievements
          </CardTitle>
          <CardDescription>
            Complete profile tasks to earn rewards and level up
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {achievements.map((achievement) => {
              const isUnlocked = progress.sections[achievement.criteria.condition as keyof typeof progress.sections];
              
              return (
                <div
                  key={achievement.id}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg transition-all duration-200",
                    isUnlocked 
                      ? "bg-primary/10 border border-primary/20" 
                      : "bg-muted/50 opacity-80 hover:opacity-100"
                  )}
                >
                  <div className="text-2xl">{achievement.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium leading-none">
                        {achievement.name}
                      </h4>
                      <Badge 
                        variant={isUnlocked ? "default" : "secondary"} 
                        className={cn(
                          "ml-auto",
                          isUnlocked && "bg-primary/20 text-primary hover:bg-primary/30"
                        )}
                      >
                        {achievement.points} XP
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {achievement.description}
                    </p>
                  </div>
                  {isUnlocked ? (
                    <Trophy className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-muted-foreground/50 flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
