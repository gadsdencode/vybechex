import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAchievements } from "@/hooks/use-achievements";
import { Star, Trophy, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProfileProgress() {
  const { achievements, progress, isLoading } = useAchievements();

  if (isLoading || !progress) {
    return null;
  }

  const completionPercentage = Math.round(progress.completionPercentage);
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
          
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Profile Completion</span>
              <Progress value={completionPercentage} className="mt-2 h-2" />
              <span className="mt-1 text-xs text-muted-foreground">{completionPercentage}%</span>
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
            Unlock achievements by completing profile tasks
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
                    "flex items-start gap-3 p-3 rounded-lg",
                    isUnlocked ? "bg-primary/10" : "bg-muted/50 opacity-50"
                  )}
                >
                  <div className="text-2xl">{achievement.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium leading-none">
                        {achievement.name}
                      </h4>
                      <Badge variant={isUnlocked ? "default" : "secondary"} className="ml-auto">
                        {achievement.points} XP
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {achievement.description}
                    </p>
                  </div>
                  {isUnlocked && (
                    <Trophy className="h-5 w-5 text-yellow-500 flex-shrink-0" />
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
