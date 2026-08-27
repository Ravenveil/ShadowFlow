/**
 * Graph Analysis Utilities for Shadow Knowledge Graph
 * Provides PageRank, Community Detection, Isolated Node Detection, and Path Finding
 */

export interface GraphNode {
  id: string;
  name: string;
  type:
    | 'core'
    | 'folder'
    | 'file'
    | 'tag'
    | 'section'
    | 'paragraph'
    | 'cluster'
    | 'library'
    | 'conversation'
    | 'agent'
    | 'memory'
    | 'task'
    | 'run'
    | 'step'
    | 'artifact'
    | 'chunk'
    | 'system';
  val: number;
  path?: string;
  raw_type?: string;
  source_type?: string;
  parent_id?: string;
  projection_role?: string;
  galaxy_key?: string;
  system_key?: string;
  depth?: number;
  child_count?: number;
  chunk_id?: string;
  source_doc?: string;
  chunk_type?:
    | 'section_chunk'
    | 'argument_chunk'
    | 'list_chunk'
    | 'protocol_chunk'
    | 'table_chunk';
  raw_chunk_type?: string;
  heading_path?: string[];
  order_index?: number;
  text?: string;
  source_anchor?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  createdAt?: number;
  modifiedAt?: number;
  // Computed properties
  connections?: number;
  pagerank?: number;
  community?: number;
  isIsolated?: boolean;
  importance?: number;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  relation?: string;
  relationFamily?: string;
  metadata?: Record<string, unknown>;
  raw_relation?: string;
  raw_target?: string;
  normalized_target?: string;
  target_kind?: string;
  resolved_file_id?: string;
  resolved_path?: string;
  anchor?: string;
  alias?: string;
  resolution_status?: string;
  // Computed properties
  isHighlighted?: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface GraphStats {
  nodeCount: number;
  linkCount: number;
  avgConnections: number;
  maxConnections: number;
  isolatedNodes: number;
  longestPath: number;
  topNodes: Array<{ id: string; name: string; connections: number; pagerank: number }>;
  communityCount: number;
}

export interface PathResult {
  found: boolean;
  path: string[];
  distance: number;
}

export interface NodeNeighborhoodEntry {
  id: string;
  name: string;
  relation?: string;
}

export interface NodeNeighborhoodSummary {
  totalNeighbors: number;
  incomingCount: number;
  outgoingCount: number;
  relationTypes: string[];
  incoming: NodeNeighborhoodEntry[];
  outgoing: NodeNeighborhoodEntry[];
}

export interface DocumentChunkSummary {
  fileNodeId: string;
  filePath?: string;
  chunks: GraphNode[];
}

function normalizeLabelCandidate(value: string | undefined | null): string | null {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized ? normalized : null;
}

function normalizeReadableLabel(value: string | undefined | null): string | null {
  const normalized = normalizeLabelCandidate(value);
  if (!normalized) return null;

  const readable = normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, '$1 $2')
    .replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();

  return readable || null;
}

function shortenDisplayLabel(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function splitPathSegments(path?: string): string[] {
  return path?.split(/[\\/]+/).filter(Boolean) ?? [];
}

function stripFileExtension(value: string): string {
  return value.replace(/\.[^.\\/]+$/, '');
}

const GENERIC_NOTE_STEMS = new Set([
  'readme',
  'note',
  'notes',
  'index',
  'overview',
  'summary',
  'intro',
  'introduction',
  'draft',
  'home',
  'main',
  'document',
  'doc',
  'page',
  'article',
]);

function isGenericNoteStem(value: string): boolean {
  return GENERIC_NOTE_STEMS.has(value.toLowerCase().replace(/\s+/g, ''));
}

function isRawTextLikeLabel(value: string | undefined | null): boolean {
  const normalized = normalizeLabelCandidate(value);
  if (!normalized) return false;

  if (normalized.startsWith('原始文本')) return true;
  if (normalized.startsWith('**原始文本')) return true;
  if (/[\r\n]/.test(normalized)) return true;
  if (/^\s*[-*+]\s+/.test(normalized)) return true;
  if (/^#{1,6}\s+/.test(normalized)) return true;
  if (normalized.includes('|') && normalized.split('|').length >= 4) return true;
  if (normalized.length > 48) return true;
  if (/[。！？；]/.test(normalized)) return true;
  if (/^["“”'`]/.test(normalized)) return true;
  return false;
}

function isMarkdownNoiseLabel(value: string | undefined | null): boolean {
  const normalized = normalizeLabelCandidate(value);
  if (!normalized) return false;

  if (normalized === '---') return true;
  if (/^`{3,}/.test(normalized)) return true;
  if (/^title\s*:/i.test(normalized)) return true;
  return false;
}

function humanizeChunkType(type: GraphNode['chunk_type'] | string | undefined): string | null {
  switch (type) {
    case 'section_chunk':
      return '章节';
    case 'argument_chunk':
      return '论点';
    case 'list_chunk':
      return '列表';
    case 'protocol_chunk':
      return '流程';
    case 'table_chunk':
      return '表格';
    default:
      return normalizeLabelCandidate(type);
  }
}

function getFileDisplayLabel(node: GraphNode): string {
  const nameLabel = normalizeReadableLabel(node.name);
  const segments = splitPathSegments(node.path);
  const fileStem = segments.length > 0 ? normalizeReadableLabel(stripFileExtension(segments[segments.length - 1])) : null;
  const parentLabel =
    segments.length > 1 ? normalizeReadableLabel(segments[segments.length - 2]) : null;

  const preferredCandidates = [
    isMarkdownNoiseLabel(nameLabel) ? null : nameLabel,
    fileStem,
  ];

  const preferredLabel =
    preferredCandidates.find(
      (label): label is string => Boolean(label) && !isRawTextLikeLabel(label)
    ) ?? null;

  if (preferredLabel && !isGenericNoteStem(preferredLabel)) {
    return shortenDisplayLabel(preferredLabel, 40);
  }

  if (fileStem && parentLabel) {
    return shortenDisplayLabel(`${parentLabel} / ${fileStem}`, 40);
  }

  if (preferredLabel) {
    return shortenDisplayLabel(preferredLabel, 40);
  }

  if (fileStem) {
    return shortenDisplayLabel(fileStem, 40);
  }

  return shortenDisplayLabel(node.id, 40);
}

export function isChunkLikeNode(node: GraphNode | undefined | null): node is GraphNode {
  if (!node) {
    return false;
  }

  if (node.type === 'chunk') {
    return true;
  }

  if (node.raw_type === 'chunk') {
    return true;
  }

  return node.type === 'artifact' && node.projection_role === 'chunk';
}

export function getChunkDisplayLabel(node: GraphNode): string {
  const headingLabel = normalizeReadableLabel(node.heading_path?.slice(-1)[0]);
  if (headingLabel && !isRawTextLikeLabel(headingLabel)) {
    return headingLabel;
  }

  const sourceAnchor = normalizeReadableLabel(node.source_anchor);
  if (sourceAnchor && !isRawTextLikeLabel(sourceAnchor)) {
    return shortenDisplayLabel(sourceAnchor, 32);
  }

  const normalizedName = normalizeReadableLabel(node.name);
  if (normalizedName && !isRawTextLikeLabel(normalizedName)) {
    return shortenDisplayLabel(normalizedName, 32);
  }

  const chunkTypeLabel = humanizeChunkType(node.chunk_type || node.raw_chunk_type);
  if (chunkTypeLabel) {
    return chunkTypeLabel;
  }

  const textSnippet = normalizeReadableLabel(node.text?.split(/\r?\n/)[0]);
  if (textSnippet && !isRawTextLikeLabel(textSnippet)) {
    return shortenDisplayLabel(textSnippet, 32);
  }

  if (normalizedName) {
    return shortenDisplayLabel(normalizedName, 24);
  }

  return 'Chunk';
}

export function getNodeDisplayLabel(node: GraphNode): string {
  const isChunkNode =
    node.type === 'chunk' ||
    node.raw_type === 'chunk' ||
    (node.type === 'artifact' && node.projection_role === 'chunk');

  if (isChunkNode) {
    return getChunkDisplayLabel(node);
  }

  if (node.type === 'file' || node.raw_type === 'file' || node.type === 'folder') {
    return getFileDisplayLabel(node);
  }

  const readableName = normalizeReadableLabel(node.name);
  if (readableName && !isRawTextLikeLabel(readableName)) {
    return shortenDisplayLabel(readableName, 40);
  }

  const pathTail = splitPathSegments(node.path).pop();
  if (pathTail) {
    const readablePathTail = normalizeReadableLabel(stripFileExtension(pathTail)) || pathTail;
    if (!isRawTextLikeLabel(readablePathTail)) {
      return shortenDisplayLabel(readablePathTail, 40);
    }
  }

  return node.id;
}

/**
 * Build adjacency list from graph data
 */
function buildAdjacencyList(nodes: GraphNode[], links: GraphLink[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();

  // Initialize all nodes
  nodes.forEach(node => adj.set(node.id, new Set()));

  // Add edges (undirected)
  links.forEach(link => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    adj.get(sourceId)?.add(targetId);
    adj.get(targetId)?.add(sourceId);
  });

  return adj;
}

/**
 * Calculate PageRank scores for all nodes
 * Uses iterative power method with damping factor 0.85
 */
export function calculatePageRank(
  nodes: GraphNode[],
  links: GraphLink[],
  damping: number = 0.85,
  iterations: number = 20
): Map<string, number> {
  const n = nodes.length;
  if (n === 0) return new Map();

  const adj = buildAdjacencyList(nodes, links);
  const pagerank = new Map<string, number>();
  const outDegree = new Map<string, number>();

  // Initialize
  const initialScore = 1 / n;
  nodes.forEach(node => {
    pagerank.set(node.id, initialScore);
    outDegree.set(node.id, adj.get(node.id)?.size || 0);
  });

  // Iterative calculation
  for (let iter = 0; iter < iterations; iter++) {
    const newPagerank = new Map<string, number>();

    nodes.forEach(node => {
      let sum = 0;
      // Find all nodes that link to this node
      adj.forEach((neighbors, sourceId) => {
        if (neighbors.has(node.id)) {
          const degree = outDegree.get(sourceId) || 1;
          sum += (pagerank.get(sourceId) || 0) / degree;
        }
      });

      const score = (1 - damping) / n + damping * sum;
      newPagerank.set(node.id, score);
    });

    // Update pagerank values
    newPagerank.forEach((value, key) => pagerank.set(key, value));
  }

  return pagerank;
}

/**
 * Detect communities using Label Propagation Algorithm
 */
export function detectCommunities(
  nodes: GraphNode[],
  links: GraphLink[],
  maxIterations: number = 10
): Map<string, number> {
  const adj = buildAdjacencyList(nodes, links);
  const communities = new Map<string, number>();

  // Initialize each node with unique community
  nodes.forEach((node, index) => communities.set(node.id, index));

  // Propagate labels
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    // Shuffle nodes for randomness
    const shuffledNodes = [...nodes].sort(() => Math.random() - 0.5);

    shuffledNodes.forEach(node => {
      const neighbors = adj.get(node.id);
      if (!neighbors || neighbors.size === 0) return;

      // Count community occurrences among neighbors
      const communityCount = new Map<number, number>();
      neighbors.forEach(neighborId => {
        const community = communities.get(neighborId);
        if (community !== undefined) {
          communityCount.set(community, (communityCount.get(community) || 0) + 1);
        }
      });

      // Find most common community
      let maxCount = 0;
      let newCommunity = communities.get(node.id)!;

      communityCount.forEach((count, community) => {
        if (count > maxCount || (count === maxCount && community < newCommunity)) {
          maxCount = count;
          newCommunity = community;
        }
      });

      if (newCommunity !== communities.get(node.id)) {
        communities.set(node.id, newCommunity);
        changed = true;
      }
    });

    if (!changed) break;
  }

  // Renumber communities consecutively
  const uniqueCommunities = new Set(communities.values());
  const communityMap = new Map<number, number>();
  let communityIndex = 0;

  uniqueCommunities.forEach(c => {
    communityMap.set(c, communityIndex++);
  });

  const result = new Map<string, number>();
  communities.forEach((community, nodeId) => {
    result.set(nodeId, communityMap.get(community) || 0);
  });

  return result;
}

/**
 * Find isolated nodes (nodes with no connections)
 */
export function findIsolatedNodes(nodes: GraphNode[], links: GraphLink[]): Set<string> {
  const connectedNodes = new Set<string>();

  links.forEach(link => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    connectedNodes.add(sourceId);
    connectedNodes.add(targetId);
  });

  const isolated = new Set<string>();
  nodes.forEach(node => {
    if (!connectedNodes.has(node.id)) {
      isolated.add(node.id);
    }
  });

  return isolated;
}

/**
 * Find shortest path between two nodes using BFS
 */
export function findShortestPath(
  nodes: GraphNode[],
  links: GraphLink[],
  sourceId: string,
  targetId: string
): PathResult {
  if (sourceId === targetId) {
    return { found: true, path: [sourceId], distance: 0 };
  }

  const adj = buildAdjacencyList(nodes, links);
  const visited = new Set<string>();
  const queue: Array<{ id: string; path: string[] }> = [{ id: sourceId, path: [sourceId] }];
  visited.add(sourceId);

  while (queue.length > 0) {
    const current = queue.shift()!;

    const neighbors = adj.get(current.id);
    if (!neighbors) continue;

    for (const neighborId of neighbors) {
      if (neighborId === targetId) {
        return {
          found: true,
          path: [...current.path, neighborId],
          distance: current.path.length
        };
      }

      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push({
          id: neighborId,
          path: [...current.path, neighborId]
        });
      }
    }
  }

  return { found: false, path: [], distance: -1 };
}

/**
 * Calculate graph statistics
 */
export function calculateGraphStats(nodes: GraphNode[], links: GraphLink[]): GraphStats {
  const adj = buildAdjacencyList(nodes, links);
  const isolatedSet = findIsolatedNodes(nodes, links);
  const pagerank = calculatePageRank(nodes, links);
  const communities = detectCommunities(nodes, links);

  // Calculate connection counts
  const connectionCounts = new Map<string, number>();
  nodes.forEach(node => {
    connectionCounts.set(node.id, adj.get(node.id)?.size || 0);
  });

  // Calculate average and max connections
  let totalConnections = 0;
  let maxConnections = 0;
  connectionCounts.forEach(count => {
    totalConnections += count;
    if (count > maxConnections) maxConnections = count;
  });
  const avgConnections = nodes.length > 0 ? totalConnections / nodes.length : 0;

  // Find longest shortest path (graph diameter approximation)
  let longestPath = 0;
  const sampleSize = Math.min(nodes.length, 20);
  const sampleNodes = nodes.slice(0, sampleSize);

  for (let i = 0; i < sampleNodes.length; i++) {
    for (let j = i + 1; j < sampleNodes.length; j++) {
      const result = findShortestPath(nodes, links, sampleNodes[i].id, sampleNodes[j].id);
      if (result.found && result.distance > longestPath) {
        longestPath = result.distance;
      }
    }
  }

  // Get top nodes by connections and pagerank
  const topNodes = nodes
    .map(node => ({
      id: node.id,
      name: node.name,
      connections: connectionCounts.get(node.id) || 0,
      pagerank: pagerank.get(node.id) || 0
    }))
    .sort((a, b) => b.pagerank - a.pagerank)
    .slice(0, 10);

  return {
    nodeCount: nodes.length,
    linkCount: links.length,
    avgConnections: Math.round(avgConnections * 100) / 100,
    maxConnections,
    isolatedNodes: isolatedSet.size,
    longestPath,
    topNodes,
    communityCount: new Set(communities.values()).size
  };
}

export function summarizeNodeNeighborhood(
  nodeId: string,
  nodes: GraphNode[],
  links: GraphLink[],
  sampleSize: number = 3,
): NodeNeighborhoodSummary {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const neighborIds = new Set<string>();
  const relationTypes = new Set<string>();
  const incomingMap = new Map<string, NodeNeighborhoodEntry>();
  const outgoingMap = new Map<string, NodeNeighborhoodEntry>();

  for (const link of links) {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    const relation = link.relation?.trim() || undefined;

    if (sourceId === nodeId && targetId !== nodeId) {
      const targetNode = nodeMap.get(targetId);
      if (!targetNode) continue;
      neighborIds.add(targetId);
      if (relation) relationTypes.add(relation);
        if (!outgoingMap.has(targetId)) {
          outgoingMap.set(targetId, {
            id: targetId,
            name: getNodeDisplayLabel(targetNode),
            relation,
          });
        }
    }

    if (targetId === nodeId && sourceId !== nodeId) {
      const sourceNode = nodeMap.get(sourceId);
      if (!sourceNode) continue;
      neighborIds.add(sourceId);
      if (relation) relationTypes.add(relation);
        if (!incomingMap.has(sourceId)) {
          incomingMap.set(sourceId, {
            id: sourceId,
            name: getNodeDisplayLabel(sourceNode),
            relation,
          });
        }
    }
  }

  const sortEntries = (entries: Iterable<NodeNeighborhoodEntry>) =>
    [...entries]
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, sampleSize);

  return {
    totalNeighbors: neighborIds.size,
    incomingCount: incomingMap.size,
    outgoingCount: outgoingMap.size,
    relationTypes: [...relationTypes].sort(),
    incoming: sortEntries(incomingMap.values()),
    outgoing: sortEntries(outgoingMap.values()),
  };
}

export function collectDocumentChunks(
  fileNodeId: string,
  nodes: GraphNode[],
  links: GraphLink[],
): DocumentChunkSummary {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const fileNode = nodeMap.get(fileNodeId);
  const filePath = fileNode?.path;
  const chunkMap = new Map<string, GraphNode>();

  for (const link of links) {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    const relation = link.relation?.trim() || '';

    if (sourceId === fileNodeId && (relation === 'contains_chunk' || relation === 'contains_unit')) {
      const chunkNode = nodeMap.get(targetId);
      if (isChunkLikeNode(chunkNode)) {
        chunkMap.set(chunkNode.id, chunkNode);
      }
    }
  }

  if (chunkMap.size === 0 && filePath) {
    for (const node of nodes) {
      if (!isChunkLikeNode(node)) continue;
      if (node.source_doc === filePath || node.path === filePath) {
        chunkMap.set(node.id, node);
      }
    }
  }

  const chunks = [...chunkMap.values()].sort((left, right) => {
    const leftOrder = left.order_index ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.order_index ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;

    const leftHeading = left.heading_path?.join(' / ') || left.source_anchor || '';
    const rightHeading = right.heading_path?.join(' / ') || right.source_anchor || '';
    const headingCompare = leftHeading.localeCompare(rightHeading);
    if (headingCompare !== 0) return headingCompare;

    return left.id.localeCompare(right.id);
  });

  return {
    fileNodeId,
    filePath,
    chunks,
  };
}

/**
 * Enrich graph data with computed properties
 */
export function enrichGraphData(data: GraphData): GraphData {
  const { nodes, links } = data;

  // Calculate metrics
  const adj = buildAdjacencyList(nodes, links);
  const pagerank = calculatePageRank(nodes, links);
  const communities = detectCommunities(nodes, links);
  const isolatedSet = findIsolatedNodes(nodes, links);

  // Normalize pagerank for visualization (0-1 scale)
  const maxPagerank = Math.max(...pagerank.values(), 0.001);

  // Enrich nodes
  const enrichedNodes = nodes.map(node => {
    const connections = adj.get(node.id)?.size || 0;
    const pr = pagerank.get(node.id) || 0;
    const isIsolated = isolatedSet.has(node.id);

    return {
      ...node,
      connections,
      pagerank: pr,
      community: communities.get(node.id),
      isIsolated,
      importance: pr / maxPagerank,
      // 调整节点大小，防止节点过大导致布局拥挤
      // 这里将最大值限制在 4，并对连接数进行开方缩放，使得高连接节点不会爆表
      val: Math.max(0.3, Math.min(2, 0.5 + Math.sqrt(connections) * 0.25))
    };
  });

  return {
    nodes: enrichedNodes,
    links
  };
}

/**
 * Get color for community
 */
export function getCommunityColor(community: number | undefined): string {
  if (community === undefined) return '#94a3b8';

  const colors = [
    '#3b82f6', // blue
    '#8b5cf6', // purple
    '#10b981', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#06b6d4', // cyan
    '#ec4899', // pink
    '#84cc16', // lime
    '#f97316', // orange
    '#6366f1', // indigo
  ];

  return colors[community % colors.length];
}

/**
 * Get color for importance level
 */
export function getImportanceColor(importance: number): string {
  if (importance > 0.7) return '#ef4444'; // red - high importance
  if (importance > 0.4) return '#f59e0b'; // amber - medium
  if (importance > 0.2) return '#3b82f6'; // blue - low
  return '#64748b'; // gray - minimal
}
