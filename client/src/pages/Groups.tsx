import { useState } from "react";
import { useGroups } from "../hooks/use-groups";
import { useUser } from "../hooks/use-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { UsersRound, Plus, Users } from "lucide-react";
import { Loader2 } from "lucide-react";

export default function Groups() {
  const { user } = useUser();
  const { groups, groupMatches, isLoading, createGroup, joinGroup } = useGroups();
  const [isCreating, setIsCreating] = useState(false);
  const [newGroup, setNewGroup] = useState({
    name: "",
    description: "",
    maxMembers: 10,
  });

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createGroup(newGroup);
      setIsCreating(false);
      setNewGroup({ name: "", description: "", maxMembers: 10 });
    } catch (error) {
      console.error("Failed to create group:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Groups</h1>
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Group
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a New Group</DialogTitle>
              <DialogDescription>
                Create a group to connect with other like-minded groups!
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateGroup}>
              <div className="grid gap-4 py-4">
                <div>
                  <Label htmlFor="name">Group Name</Label>
                  <Input
                    id="name"
                    value={newGroup.name}
                    onChange={(e) =>
                      setNewGroup((prev) => ({ ...prev, name: e.target.value }))
                    }
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={newGroup.description}
                    onChange={(e) =>
                      setNewGroup((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="maxMembers">Maximum Members</Label>
                  <Input
                    id="maxMembers"
                    type="number"
                    min="2"
                    max="50"
                    value={newGroup.maxMembers}
                    onChange={(e) =>
                      setNewGroup((prev) => ({
                        ...prev,
                        maxMembers: parseInt(e.target.value),
                      }))
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">Create Group</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {groups?.map((group) => (
          <Card key={group.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UsersRound className="h-5 w-5" />
                {group.name}
              </CardTitle>
              <CardDescription>{group.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>
                  {group.memberCount} / {group.maxMembers} members
                </span>
              </div>
            </CardContent>
            <CardFooter>
              {!group.isMember && (
                <Button
                  className="w-full"
                  onClick={() => joinGroup(group.id)}
                  disabled={group.memberCount >= group.maxMembers}
                >
                  {group.memberCount >= group.maxMembers
                    ? "Group is Full"
                    : "Join Group"}
                </Button>
              )}
              {group.isMember && (
                <Button variant="secondary" className="w-full" disabled>
                  Already a Member
                </Button>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>

      {groupMatches && groupMatches.length > 0 && (
        <div className="mt-12">
          <h2 className="text-2xl font-bold mb-6">Group Matches</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {groupMatches.map((match, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UsersRound className="h-5 w-5" />
                    {match.matchedGroup.name}
                  </CardTitle>
                  <CardDescription>
                    {match.compatibilityScore}% Compatible with{" "}
                    {match.userGroup.name}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {match.matchedGroup.description}
                  </p>
                  <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>{match.memberCount} members</span>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    onClick={() => joinGroup(match.matchedGroup.id)}
                  >
                    Join Group
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
