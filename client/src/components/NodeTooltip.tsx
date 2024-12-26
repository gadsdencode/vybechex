import React from 'react';
import { motion } from 'framer-motion';
import styles from './NodeTooltip.module.css';
import type { CustomNodeObject } from './NetworkGraph';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';

interface NodeTooltipProps {
  node: CustomNodeObject;
}

export const NodeTooltip: React.FC<NodeTooltipProps> = ({ node }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className={`${styles.tooltip} glass-effect`}
    >
      <Card className="p-4 shadow-lg backdrop-blur-lg bg-opacity-90">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{node.name}</h3>
            {node.compatibilityScore && (
              <Badge variant="secondary" className="ml-2">
                {Math.round(node.compatibilityScore)}% Match
              </Badge>
            )}
          </div>

          {node.traits && node.traits.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-sm font-medium">Key Traits</h4>
              <div className="flex flex-wrap gap-1.5">
                {node.traits.map((trait, index) => (
                  <Badge key={index} variant="outline" className="text-xs capitalize">
                    {trait.replace('_', ' ')}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {node.interests && node.interests.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-sm font-medium">Interests</h4>
              <div className="flex flex-wrap gap-1.5">
                {node.interests.map((interest, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {interest}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {node.lastActive && (
            <p className="text-xs text-muted-foreground mt-2">
              Last active: {
                node.lastActive === 'Now' 
                  ? 'Now'
                  : formatDistanceToNow(new Date(node.lastActive), { addSuffix: true })
              }
            </p>
          )}
        </div>
      </Card>
    </motion.div>
  );
};

