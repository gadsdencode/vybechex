import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Group } from "@db/schema";

interface CreateGroupData {
  name: string;
  description?: string;
  maxMembers?: number;
}

export function useGroups() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: groups, isLoading } = useQuery<(Group & { memberCount: number, isMember: boolean })[]>({
    queryKey: ["/api/groups"],
  });

  const { data: groupMatches } = useQuery<{
    userGroup: Group;
    matchedGroup: Group;
    compatibilityScore: number;
    memberCount: number;
  }[]>({
    queryKey: ["/api/group-matches"],
  });

  const createGroup = useMutation({
    mutationFn: async (data: CreateGroupData) => {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      toast({
        title: "Success",
        description: "Group created successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const joinGroup = useMutation({
    mutationFn: async (groupId: number) => {
      const res = await fetch(`/api/groups/${groupId}/join`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      toast({
        title: "Success",
        description: "Successfully joined the group!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    groups,
    groupMatches,
    isLoading,
    createGroup: createGroup.mutateAsync,
    joinGroup: joinGroup.mutateAsync,
  };
}
