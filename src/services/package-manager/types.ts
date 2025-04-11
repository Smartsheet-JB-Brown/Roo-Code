/**
 * Represents an individual package manager item
 */
export interface PackageManagerItem {
  name: string;
  description: string;
  type: "role" | "mcp-server" | "storage" | "other";
  url: string;
  repoUrl: string;
  sourceName?: string; // Name of the source repository
  author?: string;
  tags?: string[];
  version?: string;
  lastUpdated?: string;
  sourceUrl?: string; // Optional URL to use for the "view source" button
}

/**
 * Represents a Git repository source for package manager items
 */
export interface PackageManagerSource {
  url: string;
  name?: string;
  enabled: boolean;
}

/**
 * Represents a repository with its metadata and items
 */
export interface PackageManagerRepository {
  metadata: any;
  items: PackageManagerItem[];
  url: string;
}