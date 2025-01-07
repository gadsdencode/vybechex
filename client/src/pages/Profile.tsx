import { ProfileProgress } from "@/components/ProfileProgress";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUser } from "@/hooks/use-user";
import { Loader2, User, Upload } from 'lucide-react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

const profileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50, "Name must be less than 50 characters").nullable(),
  bio: z.string().max(500, "Bio must be less than 500 characters").nullable(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBjbGFzcz0ibHVjaWRlIGx1Y2lkZS11c2VyIj48cGF0aCBkPSJNMjAgMjF2LTJhNCA0IDAgMCAwLTQtNEg4YTQgNCAwIDAgMC00IDR2MiIvPjxjaXJjbGUgY3g9IjEyIiBjeT0iNyIgcj0iNCIvPjwvc3ZnPg==';

const getAvatarUrl = (avatarPath: string): string => {
  if (!avatarPath || avatarPath === '/default-avatar.png') {
    return DEFAULT_AVATAR;
  }
  
  // If it's already a full URL, return as is
  if (avatarPath.startsWith('http')) {
    return avatarPath;
  }
  
  // Return the path through our API storage endpoint
  return `/api/storage/${avatarPath.startsWith('/') ? avatarPath.slice(1) : avatarPath}`;
};

export default function ProfilePage() {
  const { user, isLoading } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [avatarLoadError, setAvatarLoadError] = useState<boolean>(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name || "",
      bio: user?.bio || "",
    },
  });

  const updateProfile = useMutation({
    mutationFn: async (values: ProfileFormValues) => {
      const response = await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
      toast({
        title: "Profile updated",
        description: "Your profile has been successfully updated.",
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

  const uploadImage = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch("/api/user/profile/image", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
      toast({
        title: "Image uploaded",
        description: "Your profile image has been successfully updated.",
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

  const handleImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 5MB.",
        variant: "destructive",
      });
      return;
    }

    await uploadImage.mutateAsync(file);
  }, [uploadImage, toast]);

  async function onSubmit(values: ProfileFormValues) {
    await updateProfile.mutateAsync(values);
  }

  const renderAvatar = (showUpload: boolean = true) => (
    <div className="relative group">
      <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center overflow-hidden">
        {user?.avatar && !avatarLoadError ? (
          <img 
            src={getAvatarUrl(user.avatar)}
            alt={user?.name || 'Profile'} 
            className="h-full w-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.onerror = null;
              console.error('Failed to load avatar:', target.src);
              setAvatarLoadError(true);
            }}
          />
        ) : (
          <User className="h-10 w-10 text-muted-foreground" />
        )}
      </div>
      {showUpload && (
        <>
          <label 
            htmlFor="avatar-upload" 
            className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 group-hover:opacity-100 rounded-full cursor-pointer transition-opacity"
          >
            <Upload className="h-6 w-6" />
            <input
              type="file"
              id="avatar-upload"
              className="hidden"
              accept="image/*"
              onChange={handleImageUpload}
              disabled={uploadImage.isPending}
            />
          </label>
          {uploadImage.isPending && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white rounded-full">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
        </>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="grid md:grid-cols-2 gap-8">
          <Card>
            <CardHeader className="space-y-1">
              <div className="flex items-center gap-4">
                {renderAvatar(false)}
                <div>
                  <CardTitle>Live Profile</CardTitle>
                  <CardDescription>
                    This is how others see your profile
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Display Name</h3>
                  <p className="mt-1 text-lg font-semibold">{user.name || "Not set"}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Bio</h3>
                  <p className="mt-1">{user.bio || "No bio set"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <div className="flex items-center gap-4">
                {renderAvatar(true)}
                <div>
                  <CardTitle>Edit Profile</CardTitle>
                  <CardDescription>
                    Update your profile information
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter your display name" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormDescription>
                          This is your public display name.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="bio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bio</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Tell us a bit about yourself"
                            className="resize-none"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormDescription>
                          Write a short bio to help others get to know you better.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button variant="default" type="submit" disabled={updateProfile.isPending}>
                    {updateProfile.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Syncing profile...
                      </>
                    ) : (
                      "Update Profile"
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <ProfileProgress />
      </div>
    </div>
  );
}