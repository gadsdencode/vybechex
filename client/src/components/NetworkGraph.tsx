import { useRef, useEffect, useState } from "react";
import { ForceGraph2D } from "react-force-graph";
import type { NodeObject, LinkObject } from "react-force-graph";
import { useMatches } from "../hooks/use-matches";
import { useUser } from "../hooks/use-user";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

// Utility function to get computed color values
function getComputedColor(variable: string, opacity: number = 1): string {
  const style = getComputedStyle(document.documentElement);
  const hue = style.getPropertyValue('--primary').trim();
  return `hsla(${hue}, 65%, 48%, ${opacity})`;
}

interface GraphData {
  nodes: Array<{
    id: string;
    name: string;
    val: number;
  }>;
  links: Array<{
    source: string;
    target: string;
    value: number;
  }>;
}

export function NetworkGraph() {
  const { matches, isLoading } = useMatches();
  const { user } = useUser();
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const graphRef = useRef<ForceGraph2D>();

  useEffect(() => {
    if (!matches || !user) return;

    // Create nodes for the current user and all matches
    const nodes = [
      {
        id: user.id.toString(),
        name: user.name || user.username,
        val: 20, // Make current user node larger
      },
      ...matches.map((match) => ({
        id: match.id.toString(),
        name: match.name || match.username,
        val: 15,
      })),
    ];

    // Create links between the current user and matches
    const links = matches.map((match) => ({
      source: user.id.toString(),
      target: match.id.toString(),
      value: match.compatibilityScore / 100, // Normalize to 0-1
    }));

    setGraphData({ nodes, links });
  }, [matches, user]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="p-4 h-[400px] w-full bg-card">
      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        nodeLabel="name"
        nodeColor={(node: NodeObject) => {
          return getComputedColor(
            '--primary',
            node.id === user?.id?.toString() ? 1 : 0.7
          );
        }}
        linkColor={(link: LinkObject) => {
          const value = (link as any).value;
          // Create gradient based on compatibility score
          return getComputedColor('--primary', Math.max(0.2, value));
        }}
        linkWidth={(link: LinkObject) => {
          const value = (link as any).value;
          // Thicker lines for stronger connections
          return 2 + value * 6;
        }}
        nodeCanvasObject={(node: NodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const label = (node as any).name as string;
          const fontSize = ((node as any).val as number) / 2;
          ctx.font = `${fontSize}px Inter`;
          ctx.fillStyle = getComputedColor(
            '--primary',
            node.id === user?.id?.toString() ? 1 : 0.7
          );
          ctx.beginPath();
          ctx.arc(node.x!, node.y!, ((node as any).val as number) / 2, 0, 2 * Math.PI);
          ctx.fill();
          
          // Draw the label
          if (globalScale >= 1) {
            ctx.fillStyle = "hsl(var(--foreground))";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(label, node.x!, node.y! + ((node as any).val as number) / 1.5);
          }
        }}
        cooldownTicks={100}
        width={800}
        height={400}
      />
    </Card>
  );
}
