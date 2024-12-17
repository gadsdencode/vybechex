import { Link, useLocation } from "wouter";
import { useUser } from "../hooks/use-user";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { Home, Users, MessageSquare, LogOut } from "lucide-react";

export default function Navigation() {
  const [location] = useLocation();
  const { user, logout } = useUser();

  return (
    <nav className="border-b bg-card">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-4">
            <Link href="/" className="text-xl font-bold text-primary">
            VybeCheck
            </Link>
            
            <div className="hidden md:flex space-x-2">
              <ThemeToggle />
              {user ? (
                <>
                <Button
                  variant={location === "/" ? "default" : "ghost"}
                  size="sm"
                  asChild
                >
                  <Link href="/">
                    <Home className="h-4 w-4 mr-2" />
                    Home
                  </Link>
                </Button>

                <Button
                  variant={location === "/matches" ? "default" : "ghost"}
                  size="sm"
                  asChild
                >
                  <Link href="/matches">
                    <Users className="h-4 w-4 mr-2" />
                    Matches
                  </Link>
                </Button>
                </>
              ) : (
                <></>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <span className="text-sm text-muted-foreground">
              Welcome, {user?.username}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logout()}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
