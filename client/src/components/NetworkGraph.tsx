import { useRef, useEffect, useState, useMemo } from "react";
import ForceGraph2D, { ForceGraphMethods } from "react-force-graph-2d";
import * as d3 from "d3-force";
import type { Match } from "../hooks/use-matches";
import type { SelectUser } from "@db/schema";
import { AlertCircle, Loader2 } from 'lucide-react';
import { useUser } from "../hooks/use-user";
import { Card } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { NodeTooltip } from "./NodeTooltip";
import { GraphControls } from "./GraphControls";
import { getComputedColor, generateNodeColor } from "../utils/colorUtils";
import styles from "./NetworkGraph.module.css";

// Define custom types for force simulation
interface ForceSimulation {
  force: (name: string, force?: any) => any;
  alpha: (value: number) => any;
  restart: () => void;
}

interface Force {
  strength?: (value: number) => any;
  distance?: (value: number) => any;
  radius?: (value: number) => any;
}

// Define custom NodeObject interface
export interface CustomNodeObject {
  id: string;
  name: string;
  val: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | undefined;
  fy?: number | undefined;
  traits?: string[];
  interests?: string[];
  bio?: string;
  compatibilityScore?: number;
  lastActive?: string;
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

// Utility function to get computed color values
/*function getComputedColor(variable: string, opacity: number = 1): string {
  const style = getComputedStyle(document.documentElement);
  const primary = style.getPropertyValue('--primary');
  // Extract HSL values from the CSS variable
  const match = primary.match(/(\d+\.?\d*)\s+(\d+\.?\d*)%\s+(\d+\.?\d*)%/);
  if (!match) return `hsla(222.2, 47.4%, 11.2%, ${opacity})`; // Fallback
  const [_, h, s, l] = match;
  return `hsla(${h}, ${s}%, ${l}%, ${opacity})`;
}*/

interface NetworkGraphProps {
  matches: Match[];
  userId: number;
  visible: boolean;
}

export function NetworkGraph({ matches, userId, visible }: NetworkGraphProps) {
  const { user } = useUser();
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<CustomNodeObject | null>(null);
  const [selectedNode, setSelectedNode] = useState<CustomNodeObject | null>(null);
  const graphRef = useRef<ForceGraphMethods<CustomNodeObject, CustomLinkObject>>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
  const [zoomLevel, setZoomLevel] = useState(1);

  // Handle resize
  useEffect(() => {
    if (!visible) return;

    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: 400
        });
      }
    };

    window.addEventListener('resize', updateDimensions);
    // Delay initial dimension set to ensure container is rendered
    const timer = setTimeout(updateDimensions, 100);

    return () => {
      window.removeEventListener('resize', updateDimensions);
      clearTimeout(timer);
    };
  }, [visible]);

  // Initialize graph data and force simulation
  useEffect(() => {
    if (!visible || !user || isInitialized) return;

    try {
      if (!matches || matches.length === 0) {
        setError("No matches available to display");
        return;
      }

      // Create nodes for the current user and all matches
      const nodes: CustomNodeObject[] = [
        {
          id: user.id.toString(),
          name: user.name || user.username || 'You',
          val: 25,
          traits: user.personalityTraits ? Object.entries(user.personalityTraits)
            .filter(([_, value]) => value > 0.7)
            .map(([trait]) => trait) : [],
          lastActive: 'Now',
        }
      ];

      // Add match nodes and create links
      const links: CustomLinkObject[] = [];
      matches.forEach((match: Match) => {
        if (!match.id || (!match.name && !match.username)) return;

        const matchNode: CustomNodeObject = {
          id: match.id.toString(),
          name: match.name || match.username || `User ${match.id}`,
          val: 20,
          traits: match.personalityTraits ? Object.entries(match.personalityTraits)
            .filter(([_, value]) => value > 0.7)
            .map(([trait]) => trait) : [],
          interests: match.interests?.map(interest => interest.name) || [],
          compatibilityScore: match.compatibilityScore,
          lastActive: match.lastActivityAt ? new Date(match.lastActivityAt).toLocaleDateString() : undefined,
        };
        nodes.push(matchNode);

        links.push({
          source: nodes[0],
          target: matchNode,
          value: Math.max(0.1, Math.min(0.8, (match.compatibilityScore || 50) / 100))
        });
      });

      setGraphData({ nodes, links });
      setIsInitialized(true);
      setError(null);

      // Configure force simulation after a short delay to ensure the graph is rendered
      setTimeout(() => {
        if (graphRef.current) {
          const fg = graphRef.current;
          
          // Configure forces
          const simulation = fg.d3Force('simulation') as ForceSimulation | undefined;
          if (simulation) {
            // Get existing forces or create new ones
            const charge = (fg.d3Force('charge') || simulation.force('charge')) as Force;
            const link = (fg.d3Force('link') || simulation.force('link')) as Force;
            const center = (fg.d3Force('center') || simulation.force('center')) as Force;
            const collide = (fg.d3Force('collide') || simulation.force('collide')) as Force;

            // Apply force configurations with type safety
            // Maximum repulsion between nodes for extreme spacing
            if (charge?.strength) charge.strength(-4000); // Even more extreme repulsion
            
            // Extremely large link distance and minimal strength
            if (link?.distance && link?.strength) {
              link.distance(1500); // Even larger distance
              link.strength(0.03); // Even weaker links
            }
            
            // Minimal center force to allow maximum spread
            if (center?.strength) center.strength(0.003);
            
            // Very large collision radius with maximum enforcement
            if (collide?.radius && collide?.strength) {
              collide.radius(500); // Even larger collision radius
              collide.strength(3); // Stronger collision enforcement
            }

            // Restart simulation with minimal energy
            simulation.alpha(0.3).restart(); // Even lower initial energy
          }
        }
      }, 100);
    } catch (error) {
      console.error("Error building network graph:", error);
      setError("Failed to build network visualization");
    }
  }, [matches, user, visible, isInitialized]);

  // Add force simulation update on window resize
  useEffect(() => {
    if (!visible || !graphRef.current) return;

    const handleResize = () => {
      if (graphRef.current) {
        const fg = graphRef.current;
        const simulation = fg.d3Force('simulation');
        if (simulation) {
          simulation.alpha(0.3).restart();
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [visible]);

  const memoizedGraphData = useMemo(() => graphData, [graphData]);

  const handleNodeHover = (node: CustomNodeObject | null) => {
    setHoveredNode(node);
    // Remove centering and zooming on hover
  };

  const handleNodeClick = (node: CustomNodeObject) => {
    setSelectedNode(node);
    if (graphRef.current) {
      graphRef.current.centerAt(node.x, node.y, 1000);
      graphRef.current.zoom(2.5, 1000);
    }
  };

  const handleBackgroundClick = () => {
    setSelectedNode(null);
    if (graphRef.current) {
      graphRef.current.centerAt(0, 0, 1000);
      graphRef.current.zoom(1, 1000);
    }
  };

  // Reset initialization when visibility changes to false
  useEffect(() => {
    if (!visible) {
      setIsInitialized(false);
    }
  }, [visible]);

  if (!visible) return null;

  if (error) {
    return (
      <Card className={`${styles.errorCard} glass-effect`}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center justify-center h-full gap-4"
        >
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-6 w-6" />
            <h3 className="font-semibold">Network Visualization Error</h3>
          </div>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            {error}
          </p>
        </motion.div>
      </Card>
    );
  }

  if (!isInitialized) {
    return (
      <Card className={`${styles.loadingCard} glass-effect`}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-center h-full"
        >
          <Loader2 className="h-6 w-6 animate-spin" />
        </motion.div>
      </Card>
    );
  }

  return (
    <Card className={`${styles.graphCard} glass-effect`} ref={containerRef}>
      <ForceGraph2D<CustomNodeObject, CustomLinkObject>
        ref={graphRef}
        graphData={memoizedGraphData}
        nodeLabel="name"
        width={dimensions.width}
        height={Math.max(1200, dimensions.height)}
        nodeColor={(node) => generateNodeColor(node, user)}
        linkColor={(link) => getComputedColor('--primary', link.value * 0.08)}
        linkWidth={(link) => 0.3 + link.value * 0.3}
        nodeRelSize={16}
        d3AlphaDecay={0.05}
        d3VelocityDecay={0.9}
        cooldownTicks={30}
        linkDirectionalParticles={0}
        minZoom={0.15}
        maxZoom={3}
        onNodeDrag={(node, translate) => {
          if (graphRef.current) {
            const simulation = graphRef.current.d3Force('simulation');
            if (simulation) {
              simulation.alpha(0.03);
            }
          }
        }}
        onNodeDragEnd={(node) => {
          if (graphRef.current) {
            const simulation = graphRef.current.d3Force('simulation');
            if (simulation) {
              simulation.alphaTarget(0).alphaDecay(0.05);
            }
          }
        }}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const label = node.name;
          const nodeSize = node.val * (1 + (node.id === hoveredNode?.id ? 0.05 : 0));
          const fontSize = 12;
          
          // Draw node with subtle shadow
          ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetX = 1;
          ctx.shadowOffsetY = 1;
          
          ctx.beginPath();
          ctx.arc(node.x!, node.y!, nodeSize / 2, 0, 2 * Math.PI);
          ctx.fillStyle = generateNodeColor(node, user);
          ctx.fill();
          
          // Reset shadow
          ctx.shadowColor = 'transparent';

          // Extremely subtle pulsating effect for hovered node
          if (node.id === hoveredNode?.id) {
            ctx.save();
            ctx.globalAlpha = 0.08 + Math.sin(Date.now() / 800) * 0.03;
            ctx.beginPath();
            ctx.arc(node.x!, node.y!, (nodeSize / 2) * 1.05, 0, 2 * Math.PI);
            ctx.fillStyle = generateNodeColor(node, user);
            ctx.fill();
            ctx.restore();
          }
          
          // Draw label with better contrast
          if (globalScale >= 0.5) {
            ctx.font = `${fontSize}px Inter`;
            const textWidth = ctx.measureText(label).width;
            const padding = 4;
            const textHeight = fontSize;
            
            // Draw label background with subtle shadow
            ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
            ctx.shadowBlur = 3;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            
            ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
            ctx.fillRect(
              node.x! - textWidth / 2 - padding,
              node.y! + nodeSize / 2 + padding,
              textWidth + padding * 2,
              textHeight + padding * 2
            );
            
            // Reset shadow
            ctx.shadowColor = 'transparent';
            
            // Draw text
            ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillText(label, node.x!, node.y! + nodeSize / 2 + padding * 1.5);
          }
        }}
        onNodeHover={handleNodeHover}
        onNodeClick={handleNodeClick}
        onBackgroundClick={handleBackgroundClick}
      />
      <AnimatePresence>
        {hoveredNode && (
          <NodeTooltip node={hoveredNode} />
        )}
      </AnimatePresence>
      <GraphControls
        onZoomIn={() => graphRef.current?.zoom(1.2, 400)}
        onZoomOut={() => graphRef.current?.zoom(0.8, 400)}
        onCenter={() => {
          graphRef.current?.centerAt(0, 0, 1000);
          graphRef.current?.zoom(1, 400);
        }}
      />
    </Card>
  );
}