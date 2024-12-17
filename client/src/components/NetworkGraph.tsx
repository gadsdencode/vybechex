import { useRef, useEffect, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { ForceGraphMethods } from "react-force-graph-2d";
import type { Match } from "../hooks/use-matches";
import type { SelectUser } from "@db/schema";

// Define custom LinkObject interface
interface CustomNodeObject {
  id: string;
  name: string;
  val: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | undefined;
  fy?: number | undefined;
  [key: string]: any;  // Needed for force-graph internal properties
}

interface CustomLinkObject {
  source: CustomNodeObject;
  target: CustomNodeObject;
  value: number;
}

interface GraphData {
  nodes: CustomNodeObject[];
  links: CustomLinkObject[];
}

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

export function NetworkGraph() {
  const { matches, isLoading } = useMatches();
  const { user } = useUser();
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const graphRef = useRef<ForceGraphMethods<CustomNodeObject, CustomLinkObject>>();

  useEffect(() => {
    if (!matches || !user) return;

    // Create nodes for the current user and all matches
    const nodes: CustomNodeObject[] = [
      {
        id: user.id.toString(),
        name: user.name || user.username,
        val: 40, // Make current user node larger
      },
      ...matches.map((match: Match) => ({
        id: match.id.toString(),
        name: match.name || match.username,
        val: 30,
      })),
    ];

    // Create links between the current user and matches
    const links: CustomLinkObject[] = matches.map((match: Match) => ({
      source: nodes.find((node) => node.id === user.id.toString())!,
      target: nodes.find((node) => node.id === match.id.toString())!,
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
      <ForceGraph2D<CustomNodeObject, CustomLinkObject>
        ref={graphRef}
        graphData={graphData}
        nodeLabel="name"
        nodeColor={(node: CustomNodeObject) => {
          return getComputedColor(
            '--primary',
            node.id === user.id.toString() ? 1 : 0.7
          );
        }}
        linkColor={(link: CustomLinkObject) => {
          const value = link.value;
          // Create gradient based on compatibility score
          return getComputedColor('--primary', Math.max(0.2, value));
        }}
        linkWidth={(link: CustomLinkObject) => {
          const value = link.value;
          // Thicker lines for stronger connections
          return 2 + value * 6;
        }}
        nodeCanvasObject={(node: CustomNodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const label = node.name as string;
          const nodeSize = node.val;
          const fontSize = Math.min(nodeSize / 3, 14); // Limit font size
          
          // Draw node circle
          ctx.fillStyle = getComputedColor(
            '--primary',
            node.id === user.id.toString() ? 1 : 0.7
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