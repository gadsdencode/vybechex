import { CustomNodeObject } from '../components/NetworkGraph';

export function getComputedColor(variable: string, opacity: number = 1): string {
  const style = getComputedStyle(document.documentElement);
  const primary = style.getPropertyValue(variable);
  const match = primary.match(/(\d+\.?\d*)\s+(\d+\.?\d*)%\s+(\d+\.?\d*)%/);
  if (!match) return `hsla(222.2, 47.4%, 11.2%, ${opacity})`;
  const [_, h, s, l] = match;
  return `hsla(${h}, ${s}%, ${l}%, ${opacity})`;
}

export function generateNodeColor(node: CustomNodeObject, currentUser: any): string {
  if (node.id === currentUser?.id?.toString()) {
    return getComputedColor('--primary', 1);
  }
  // Generate a unique color based on the node's id
  const hue = parseInt(node.id, 36) % 360;
  return `hsl(${hue}, 70%, 60%)`;
}

