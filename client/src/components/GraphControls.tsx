import React from 'react';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import styles from './GraphControls.module.css';

interface GraphControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCenter: () => void;
}

export const GraphControls: React.FC<GraphControlsProps> = ({ onZoomIn, onZoomOut, onCenter }) => {
  return (
    <div className={`${styles.controls} glass-effect`}>
      <button onClick={onZoomIn} className={styles.controlButton}>
        <ZoomIn size={18} />
      </button>
      <button onClick={onZoomOut} className={styles.controlButton}>
        <ZoomOut size={18} />
      </button>
      <button onClick={onCenter} className={styles.controlButton}>
        <Maximize size={18} />
      </button>
    </div>
  );
};

