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
  const primary = style.getPropertyValue('--primary');
  // Extract HSL values from the CSS variable
  const match = primary.match(/(\d+\.?\d*)\s+(\d+\.?\d*)%\s+(\d+\.?\d*)%/);
  if (!match) return `hsla(222.2, 47.4%, 11.2%, ${opacity})`; // Fallback
  const [_, h, s, l] = match;
  return `hsla(${h}, ${s}%, ${l}%, ${opacity})`;
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
        val: 40, // Make current user node larger
      },
      ...matches.map((match) => ({
        id: match.id.toString(),
        name: match.name || match.username,
        val: 30,
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
          const nodeSize = ((node as any).val as number);
          const fontSize = Math.min(nodeSize / 3, 14); // Limit font size
          
          // Draw node circle
          ctx.fillStyle = getComputedColor(
            '--primary',
            node.id === user?.id?.toString() ? 1 : 0.7
          );
          ctx.beginPath();
          ctx.arc(node.x!, node.y!, nodeSize / 2, 0, 2 * Math.PI);
          ctx.fill();
          
          // Draw the label with background
          if (globalScale >= 0.8) {
            ctx.font = `${fontSize}px Inter`;
            const textWidth = ctx.measureText(label).width;
            const padding = 4;
            const textHeight = fontSize;
            
            // Draw text background
            ctx.fillStyle = "#ffffff"; // White background for better contrast
            ctx.fillRect(
              node.x! - textWidth / 2 - padding,
              node.y! + nodeSize / 2 + padding,
              textWidth + padding * 2,
              textHeight + padding * 2
            );
            
            // Draw text
            ctx.fillStyle = "#000000"; // Black text for maximum readability
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillText(label, node.x!, node.y! + nodeSize / 2 + padding * 2);
          }
        }}
        cooldownTicks={100}
        d3AlphaDecay={0.02} // Slower layout stabilization
        d3VelocityDecay={0.3} // Smoother node movement
        width={800}
        height={400}
      />
    </Card>
  );
}
