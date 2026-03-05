/**
 * Data structure for category-level chart data
 */
export interface CategoryChartData {
  key: string;           // Category key (e.g., 'food', 'household', or custom slug)
  name: string;          // Display name (e.g., 'Food', 'Household')
  emoji: string;         // Category emoji (e.g., '🍽️', '🏠')
  planned: number;       // Total planned amount for category
  actual: number;        // Total actual spending for category
  color: string;         // Design system color for the category
}

/**
 * Data structure for time-series chart data
 */
export interface MonthlyTrendData {
  month: string;         // Month name (e.g., 'Jan', 'Feb', 'Mar')
  year: number;          // Year
  date: Date;            // Full date object for D3 time scales
  categories: Record<string, number>; // categoryKey → actual spending
}

/**
 * Node in a flow diagram (Sankey)
 */
export interface FlowNode {
  id: string;            // Unique node ID
  label: string;         // Display name
  color: string;         // Node color
  column?: 'source' | 'method' | 'category' | 'item'; // Which column this node belongs to
  lineItems?: { name: string; amount: number }[]; // Constituent items for hover detail
}

/**
 * Link/flow in a flow diagram (Sankey)
 */
export interface FlowLink {
  source: string;        // Source node ID
  target: string;        // Target node ID
  value: number;         // Flow amount
  color: string;         // Link color (can be gradient ID)
}

/**
 * Complete flow diagram data structure
 */
export interface FlowData {
  nodes: FlowNode[];
  links: FlowLink[];
}

/**
 * Tooltip data structure
 */
export interface TooltipData {
  visible: boolean;
  x: number;
  y: number;
  content: React.ReactNode;
}
