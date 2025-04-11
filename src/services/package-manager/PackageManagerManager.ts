import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { GitFetcher } from "./GitFetcher";
import { PackageManagerItem, PackageManagerRepository, PackageManagerSource } from "./types";

/**
 * Service for managing package manager data
 */
export class PackageManagerManager {
  // Cache expiry time in milliseconds (set to a low value for testing)
  private static readonly CACHE_EXPIRY_MS = 10 * 1000; // 10 seconds (normally 3600000 = 1 hour)
  
  private gitFetcher: GitFetcher;
  private cache: Map<string, { data: PackageManagerRepository, timestamp: number }> = new Map();
  
  constructor(private readonly context: vscode.ExtensionContext) {
    this.gitFetcher = new GitFetcher(context);
  }
  
  /**
   * Gets package manager items from all enabled sources
   * @param sources The package manager sources
   * @returns An array of PackageManagerItem objects
   */
  async getPackageManagerItems(sources: PackageManagerSource[]): Promise<PackageManagerItem[]> {
    console.log(`PackageManagerManager: Getting items from ${sources.length} sources`);
    const items: PackageManagerItem[] = [];
    const errors: Error[] = [];
    
    // Filter enabled sources
    const enabledSources = sources.filter(s => s.enabled);
    console.log(`PackageManagerManager: ${enabledSources.length} enabled sources`);
    
    // Process sources sequentially to avoid overwhelming the system
    for (const source of enabledSources) {
      try {
        console.log(`PackageManagerManager: Processing source ${source.url}`);
        // Pass the source name to getRepositoryData
        const repo = await this.getRepositoryData(source.url, false, source.name);
        
        if (repo.items && repo.items.length > 0) {
          console.log(`PackageManagerManager: Found ${repo.items.length} items in ${source.url}`);
          items.push(...repo.items);
        } else {
          console.log(`PackageManagerManager: No items found in ${source.url}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`PackageManagerManager: Failed to fetch data from ${source.url}:`, error);
        errors.push(new Error(`Source ${source.url}: ${errorMessage}`));
      }
    }
    
    // Show a single error message with all failures
    if (errors.length > 0) {
      const errorMessage = `Failed to fetch from ${errors.length} sources: ${errors.map(e => e.message).join("; ")}`;
      console.error(`PackageManagerManager: ${errorMessage}`);
      vscode.window.showErrorMessage(errorMessage);
    }
    
    console.log(`PackageManagerManager: Returning ${items.length} total items`);
    return items;
  }
  
  /**
   * Gets repository data from a URL, using cache if available
   * @param url The repository URL
   * @param forceRefresh Whether to bypass the cache and force a refresh
   * @param sourceName The name of the source
   * @returns A PackageManagerRepository object
   */
  async getRepositoryData(url: string, forceRefresh: boolean = false, sourceName?: string): Promise<PackageManagerRepository> {
    try {
      console.log(`PackageManagerManager: Getting repository data for ${url}`);
      
      // Check cache first (unless force refresh is requested)
      const cached = this.cache.get(url);
      
      if (!forceRefresh && cached && (Date.now() - cached.timestamp) < PackageManagerManager.CACHE_EXPIRY_MS) {
        console.log(`PackageManagerManager: Using cached data for ${url} (age: ${Date.now() - cached.timestamp}ms)`);
        return cached.data;
      }
      
      if (forceRefresh) {
        console.log(`PackageManagerManager: Force refresh requested for ${url}, bypassing cache`);
      }
      
      console.log(`PackageManagerManager: Cache miss or expired for ${url}, fetching fresh data`);
      
      // Fetch fresh data with timeout protection
      const fetchPromise = this.gitFetcher.fetchRepository(url, sourceName);
      
      // Create a timeout promise
      const timeoutPromise = new Promise<PackageManagerRepository>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Repository fetch timed out after 30 seconds: ${url}`));
        }, 30000); // 30 second timeout
      });
      
      // Race the fetch against the timeout
      const data = await Promise.race([fetchPromise, timeoutPromise]);
      
      // Cache the result
      this.cache.set(url, { data, timestamp: Date.now() });
      console.log(`PackageManagerManager: Successfully fetched and cached data for ${url}`);
      
      return data;
    } catch (error) {
      console.error(`PackageManagerManager: Error fetching repository data for ${url}:`, error);
      
      // Return empty repository data instead of throwing
      return {
        metadata: {},
        items: [],
        url
      };
    }
  }
  
  /**
   * Refreshes a specific repository, bypassing the cache
   * @param url The repository URL to refresh
   * @param sourceName Optional name of the source
   * @returns The refreshed repository data
   */
  async refreshRepository(url: string, sourceName?: string): Promise<PackageManagerRepository> {
    console.log(`PackageManagerManager: Refreshing repository ${url}`);
    
    try {
      // Force a refresh by bypassing the cache
      const data = await this.getRepositoryData(url, true, sourceName);
      console.log(`PackageManagerManager: Repository ${url} refreshed successfully`);
      return data;
    } catch (error) {
      console.error(`PackageManagerManager: Failed to refresh repository ${url}:`, error);
      throw error;
    }
  }
  
  /**
   * Clears the in-memory cache
   */
  clearCache(): void {
    this.cache.clear();
  }
  
  /**
   * Cleans up cache directories for repositories that are no longer in the configured sources
   * @param currentSources The current list of package manager sources
   */
  async cleanupCacheDirectories(currentSources: PackageManagerSource[]): Promise<void> {
    try {
      // Get the cache directory path
      const cacheDir = path.join(this.context.globalStorageUri.fsPath, "package-manager-cache");
      
      // Check if cache directory exists
      try {
        await fs.stat(cacheDir);
      } catch (error) {
        console.log("PackageManagerManager: Cache directory doesn't exist yet, nothing to clean up");
        return;
      }
      
      // Get all subdirectories in the cache directory
      const entries = await fs.readdir(cacheDir, { withFileTypes: true });
      const cachedRepoDirs = entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
      
      console.log(`PackageManagerManager: Found ${cachedRepoDirs.length} cached repositories`);
      
      // Get the list of repository names from current sources
      const currentRepoNames = currentSources.map(source => this.getRepoNameFromUrl(source.url));
      
      // Find directories to delete
      const dirsToDelete = cachedRepoDirs.filter(dir => !currentRepoNames.includes(dir));
      
      console.log(`PackageManagerManager: Found ${dirsToDelete.length} repositories to delete`);
      
      // Delete each directory that's no longer in the sources
      for (const dirName of dirsToDelete) {
        try {
          const dirPath = path.join(cacheDir, dirName);
          console.log(`PackageManagerManager: Deleting cache directory ${dirPath}`);
          await fs.rm(dirPath, { recursive: true, force: true });
          console.log(`PackageManagerManager: Successfully deleted ${dirPath}`);
        } catch (error) {
          console.error(`PackageManagerManager: Failed to delete directory ${dirName}:`, error);
        }
      }
      
      console.log(`PackageManagerManager: Cache cleanup completed, deleted ${dirsToDelete.length} directories`);
    } catch (error) {
      console.error("PackageManagerManager: Error cleaning up cache directories:", error);
    }
  }
  
  /**
   * Extracts a safe directory name from a Git URL
   * @param url The Git repository URL
   * @returns A sanitized directory name
   */
  private getRepoNameFromUrl(url: string): string {
    // Extract repo name from URL and sanitize it
    const urlParts = url.split("/").filter(part => part !== "");
    const repoName = urlParts[urlParts.length - 1].replace(/\.git$/, "");
    return repoName.replace(/[^a-zA-Z0-9-_]/g, "-");
  }
  
  /**
   * Filters package manager items based on criteria
   * @param items The items to filter
   * @param filters The filter criteria
   * @returns Filtered items
   */
  filterItems(items: PackageManagerItem[], filters: { type?: string, search?: string, tags?: string[] }): PackageManagerItem[] {
    return items.filter(item => {
      // Filter by type
      if (filters.type && item.type !== filters.type) {
        return false;
      }
      
      // Filter by search term
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        const nameMatch = item.name.toLowerCase().includes(searchTerm);
        const descMatch = item.description.toLowerCase().includes(searchTerm);
        const authorMatch = item.author?.toLowerCase().includes(searchTerm);
        
        if (!nameMatch && !descMatch && !authorMatch) {
          return false;
        }
      }
      
      // Filter by tags
      if (filters.tags && filters.tags.length > 0) {
        if (!item.tags || item.tags.length === 0) {
          return false;
        }
        
        const hasMatchingTag = filters.tags.some(tag => item.tags!.includes(tag));
        if (!hasMatchingTag) {
          return false;
        }
      }
      
      return true;
    });
  }
  
  /**
   * Sorts package manager items
   * @param items The items to sort
   * @param sortBy The field to sort by
   * @param sortOrder The sort order
   * @returns Sorted items
   */
  sortItems(items: PackageManagerItem[], sortBy: string, sortOrder: "asc" | "desc"): PackageManagerItem[] {
    return [...items].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "author":
          comparison = (a.author || "").localeCompare(b.author || "");
          break;
        case "lastUpdated":
          comparison = (a.lastUpdated || "").localeCompare(b.lastUpdated || "");
          break;
        case "stars":
          comparison = (a.stars || 0) - (b.stars || 0);
          break;
        case "downloads":
          comparison = (a.downloads || 0) - (b.downloads || 0);
          break;
        default:
          comparison = a.name.localeCompare(b.name);
      }
      
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }
}