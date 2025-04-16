import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAchievements } from "@/hooks/use-achievements";
import { Star, Trophy, XCircle, Loader2, CheckCircle2, ArrowRight, Medal, Users, Zap, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AchievementCategory } from "@db/schema";

const CATEGORY_ICONS: Record<AchievementCategory, React.ReactNode> = {
  profile: <Users className="h-4 w-4" />,
  engagement: <Zap className="h-4 w-4" />,
  social: <Users className="h-4 w-4" />,
  streak: <Calendar className="h-4 w-4" />,
  milestone: <Medal className="h-4 w-4" />,
};

const CATEGORY_NAMES: Record<AchievementCategory, string> = {
  profile: "Profile",
  engagement: "Engagement",
  social: "Social",
  streak: "Streaks",
  milestone: "Milestones",
};

export function ProfileProgress() {
  const { 
    achievements, 
    progress, 
    isLoading, 
    totalProgress, 
    unlockedAchievements, 
    lockedAchievements,
    calculateXpForNextLevel,
    totalPossibleXp,
    getAchievementsByCategory
  } = useAchievements();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-8 w-8 animate-spin" />
        <div className="text-sm text-white ml-2 border border-white rounded-md p-2 bg-muted">Loading achievements...</div>
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-sm text-white ml-2 border border-white rounded-md p-2 bg-muted">No achievements yet, complete your profile to start earning them!</div>
      </div>
    );
  }

  const nextLevelXp = calculateXpForNextLevel(progress.level);
  const xpProgress = (progress.totalPoints / nextLevelXp) * 100;
  const xpToNext = nextLevelXp - progress.totalPoints;
  const totalXpEarned = progress.totalPoints;
  const percentageOfTotalXp = Math.round((totalXpEarned / totalPossibleXp) * 100);

  // Find the next achievements to focus on (up to 3 locked achievements)
  const nextFocusAchievements = lockedAchievements
    .slice(0, 3)
    .map(achievement => ({
      ...achievement,
      points: achievement.points,
      percentageOfNextLevel: Math.round((achievement.points / xpToNext) * 100)
    }));

  // Calculate category completion percentages
  const categoryProgress = Object.keys(CATEGORY_NAMES).reduce((acc, category) => {
    const categoryAchievements = getAchievementsByCategory(category as AchievementCategory);
    const unlockedCount = unlockedAchievements.filter(ua => 
      categoryAchievements.some(ca => ca.id === ua.achievementId)
    ).length;
    const percentage = Math.round((unlockedCount / categoryAchievements.length) * 100) || 0;
    return { ...acc, [category]: percentage };
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Level {progress.level}
            </div>
            <Badge variant="outline" className="ml-2">
              {percentageOfTotalXp}% of Total XP Earned
            </Badge>
          </CardTitle>
          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
            <div className="flex justify-between items-center">
              <span>Current Progress: {progress.totalPoints.toLocaleString()} / {nextLevelXp.toLocaleString()} XP</span>
              <span>Need {xpToNext.toLocaleString()} XP for Level {progress.level + 1}</span>
            </div>
          </div>
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

            <div className="grid grid-cols-3 gap-4 pt-2">
              <div className="flex flex-col items-center p-3 bg-muted rounded-lg">
                <span className="text-2xl font-bold">{unlockedAchievements.length}</span>
                <span className="text-sm text-muted-foreground">Unlocked</span>
                <span className="text-xs text-muted-foreground">of {achievements.length} Total</span>
              </div>
              <div className="flex flex-col items-center p-3 bg-muted rounded-lg">
                <span className="text-2xl font-bold">{totalXpEarned.toLocaleString()}</span>
                <span className="text-sm text-muted-foreground">Current XP</span>
              </div>
              <div className="flex flex-col items-center p-3 bg-muted rounded-lg">
                <span className="text-2xl font-bold">{totalPossibleXp.toLocaleString()}</span>
                <span className="text-sm text-muted-foreground">Total Possible</span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {(Object.keys(CATEGORY_NAMES) as AchievementCategory[]).map((category) => (
                <div key={category} className="flex flex-col items-center p-3 bg-muted/50 rounded-lg">
                  <div className="mb-2 text-muted-foreground">
                    {CATEGORY_ICONS[category]}
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-medium">{CATEGORY_NAMES[category]}</div>
                    <Progress value={categoryProgress[category]} className="h-1 w-16 mt-1" />
                    <span className="text-xs text-muted-foreground mt-1">
                      {categoryProgress[category]}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {nextFocusAchievements.length > 0 && (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRight className="h-5 w-5 text-primary" />
              Next Steps
            </CardTitle>
            <div className="text-sm text-muted-foreground">
              Focus on these achievements to level up faster
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {nextFocusAchievements.map((achievement) => (
                <div key={achievement.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <div className="text-2xl">{achievement.icon}</div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium leading-none">{achievement.name}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">{achievement.description}</p>
                  </div>
                  <Badge variant="secondary">+{achievement.points} XP ({achievement.percentageOfNextLevel}% to next level)</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            Achievements
          </CardTitle>
          <div className="text-sm text-muted-foreground">
            Track your progress and unlock rewards
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="w-full justify-start mb-4">
              <TabsTrigger value="all" className="flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                All
              </TabsTrigger>
              {(Object.keys(CATEGORY_NAMES) as AchievementCategory[]).map((category) => (
                <TabsTrigger 
                  key={category} 
                  value={category}
                  className="flex items-center gap-2"
                >
                  {CATEGORY_ICONS[category]}
                  {CATEGORY_NAMES[category]}
                </TabsTrigger>
              ))}
            </TabsList>

            <ScrollArea className="h-[400px] pr-4">
              <TabsContent value="all" className="m-0">
                <div className="grid gap-4">
                  {achievements.map((achievement) => (
                    <AchievementCard
                      key={achievement.id}
                      achievement={achievement}
                      isUnlocked={unlockedAchievements.some(ua => ua.achievementId === achievement.id)}
                    />
                  ))}
                </div>
              </TabsContent>

              {(Object.keys(CATEGORY_NAMES) as AchievementCategory[]).map((category) => (
                <TabsContent key={category} value={category} className="m-0">
                  <div className="grid gap-4">
                    {getAchievementsByCategory(category).map((achievement) => (
                      <AchievementCard
                        key={achievement.id}
                        achievement={achievement}
                        isUnlocked={unlockedAchievements.some(ua => ua.achievementId === achievement.id)}
                      />
                    ))}
                  </div>
                </TabsContent>
              ))}
            </ScrollArea>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

interface AchievementCardProps {
  achievement: any;
  isUnlocked: boolean;
}

function AchievementCard({ achievement, isUnlocked }: AchievementCardProps) {
  return (
    <div
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
        <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
      ) : (
        <XCircle className="h-5 w-5 text-muted-foreground/50 flex-shrink-0" />
      )}
    </div>
  );
}
