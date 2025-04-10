import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import { PackageManagerItem, PackageManagerRepository } from "./types";

const execAsync = promisify(exec);

/**
 * Service for fetching and validating package manager data from Git repositories
 */
export class GitFetcher {
  private readonly cacheDir: string;
  
  constructor(private readonly context: vscode.ExtensionContext) {
    this.cacheDir = path.join(context.globalStorageUri.fsPath, "package-manager-cache");
  }
  
  /**
   * Fetches repository data from a Git URL
   * @param url The Git repository URL
   * @returns A PackageManagerRepository object containing metadata and items
   */
  async fetchRepository(url: string): Promise<PackageManagerRepository> {
    console.log(`GitFetcher: Fetching repository from ${url}`);
    
    try {
      // Ensure cache directory exists
      try {
        await fs.mkdir(this.cacheDir, { recursive: true });
        console.log(`GitFetcher: Cache directory ensured at ${this.cacheDir}`);
      } catch (mkdirError) {
        console.error(`GitFetcher: Error creating cache directory: ${mkdirError.message}`);
        throw new Error(`Failed to create cache directory: ${mkdirError.message}`);
      }
      
      // Create a safe directory name from the URL
      const repoName = this.getRepoNameFromUrl(url);
      const repoDir = path.join(this.cacheDir, repoName);
      console.log(`GitFetcher: Repository directory: ${repoDir}`);
      
      // Clone or pull repository with timeout protection
      try {
        console.log(`GitFetcher: Cloning or pulling repository ${url}`);
        await this.cloneOrPullRepository(url, repoDir);
        console.log(`GitFetcher: Repository cloned/pulled successfully`);
      } catch (gitError) {
        console.error(`GitFetcher: Git operation failed: ${gitError.message}`);
        throw new Error(`Git operation failed: ${gitError.message}`);
      }
      
      try {
        // Validate repository structure
        console.log(`GitFetcher: Validating repository structure`);
        await this.validateRepositoryStructure(repoDir);
        
        // Parse metadata
        console.log(`GitFetcher: Parsing repository metadata`);
        const metadata = await this.parseRepositoryMetadata(repoDir);
        
        // Parse items
        console.log(`GitFetcher: Parsing package manager items`);
        const items = await this.parsePackageManagerItems(repoDir, url);
        
        console.log(`GitFetcher: Successfully fetched repository with ${items.length} items`);
        return {
          metadata,
          items,
          url
        };
      } catch (validationError) {
        // Log the validation error
        console.error(`GitFetcher: Repository validation failed: ${validationError.message}`);
        
        // Show error message
        vscode.window.showErrorMessage(`Failed to fetch repository: ${validationError.message}`);
        
        // Return empty repository
        return {
          metadata: {},
          items: [],
          url
        };
      }
    } catch (error) {
      // Show error message
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`GitFetcher: Failed to fetch repository: ${errorMessage}`);
      vscode.window.showErrorMessage(`Failed to fetch repository: ${errorMessage}`);
      
      // Return empty repository
      return {
        metadata: {},
        items: [],
        url
      };
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
   * Clones or pulls a Git repository
   * @param url The Git repository URL
   * @param repoDir The directory to clone to or pull in
   */
  private async cloneOrPullRepository(url: string, repoDir: string): Promise<void> {
    console.log(`GitFetcher: Checking if repository exists at ${repoDir}`);
    
    try {
      // Check if repository already exists
      const repoExists = await fs.stat(path.join(repoDir, ".git"))
        .then(() => true)
        .catch(() => false);
      
      if (repoExists) {
        console.log(`GitFetcher: Repository exists, attempting to pull latest changes`);
        
        try {
          // Try to pull latest changes with timeout
          const pullPromise = execAsync("git pull", { cwd: repoDir, timeout: 20000 });
          await pullPromise;
          console.log(`GitFetcher: Successfully pulled latest changes`);
        } catch (pullError) {
          console.error(`GitFetcher: Failed to pull repository: ${pullError.message}`);
          
          // If pull fails, try to remove the directory and clone again
          console.log(`GitFetcher: Attempting to remove and re-clone repository`);
          try {
            await fs.rm(repoDir, { recursive: true, force: true });
            console.log(`GitFetcher: Removed existing repository directory`);
            
            // Clone with timeout
            const clonePromise = execAsync(`git clone "${url}" "${repoDir}"`, { timeout: 30000 });
            await clonePromise;
            console.log(`GitFetcher: Successfully re-cloned repository`);
          } catch (rmError) {
            console.error(`GitFetcher: Failed to re-clone repository: ${rmError.message}`);
            throw new Error(`Failed to re-clone repository: ${rmError.message}`);
          }
        }
      } else {
        console.log(`GitFetcher: Repository does not exist, cloning from ${url}`);
        
        // Clone repository with timeout
        const clonePromise = execAsync(`git clone "${url}" "${repoDir}"`, { timeout: 30000 });
        await clonePromise;
        console.log(`GitFetcher: Successfully cloned repository`);
      }
    } catch (error) {
      console.error(`GitFetcher: Failed to clone or pull repository: ${error.message}`);
      throw new Error(`Failed to clone or pull repository: ${error.message}`);
    }
  }
  
  /**
   * Validates that a repository follows the expected structure
   * @param repoDir The repository directory
   */
  private async validateRepositoryStructure(repoDir: string): Promise<void> {
    // Check for required files
    const metadataPath = path.join(repoDir, "metadata.yml");
    
    const metadataExists = await fs.stat(metadataPath)
      .then(() => true)
      .catch(() => false);
      
    if (!metadataExists) {
      throw new Error("Repository is missing metadata.yml file");
    }
    
    // Check for at least one of the item type directories
    const mcpServersDir = path.join(repoDir, "mcp-servers");
    const rolesDir = path.join(repoDir, "roles");
    const storageSystemsDir = path.join(repoDir, "storage-systems");
    const itemsDir = path.join(repoDir, "items"); // For backward compatibility
    
    const mcpServersDirExists = await fs.stat(mcpServersDir).then(() => true).catch(() => false);
    const rolesDirExists = await fs.stat(rolesDir).then(() => true).catch(() => false);
    const storageSystemsDirExists = await fs.stat(storageSystemsDir).then(() => true).catch(() => false);
    const itemsDirExists = await fs.stat(itemsDir).then(() => true).catch(() => false);
    
    if (!mcpServersDirExists && !rolesDirExists && !storageSystemsDirExists && !itemsDirExists) {
      throw new Error("Repository is missing item directories (mcp-servers, roles, storage-systems, or items)");
    }
  }
  
  /**
   * Parses the repository metadata file
   * @param repoDir The repository directory
   * @returns The parsed metadata
   */
  private async parseRepositoryMetadata(repoDir: string): Promise<any> {
    // Parse metadata.yml file
    const metadataPath = path.join(repoDir, "metadata.yml");
    const metadataContent = await fs.readFile(metadataPath, "utf-8");
    
    // For now, we'll return a simple object
    // In a future update, we'll add a YAML parser dependency
    try {
      return {
        name: metadataContent.match(/name:\s*["']?([^"'\n]+)["']?/)?.[1] || "Repository Name",
        description: metadataContent.match(/description:\s*["']?([^"'\n]+)["']?/)?.[1] || "Repository Description",
        maintainer: metadataContent.match(/maintainer:\s*["']?([^"'\n]+)["']?/)?.[1],
        website: metadataContent.match(/website:\s*["']?([^"'\n]+)["']?/)?.[1]
      };
    } catch (error) {
      console.error("Failed to parse repository metadata:", error);
      return {
        name: "Repository Name",
        description: "Repository Description"
      };
    }
  }
  
  /**
   * Parses package manager items from a repository
   * @param repoDir The repository directory
   * @param repoUrl The repository URL
   * @returns An array of PackageManagerItem objects
   */
  private async parsePackageManagerItems(repoDir: string, repoUrl: string, branch: string = "main"): Promise<PackageManagerItem[]> {
    const items: PackageManagerItem[] = [];
    
    // Check for items in each directory type
    const directoryTypes = [
      { path: path.join(repoDir, "mcp-servers"), type: "mcp-server", urlPath: "mcp-servers" },
      { path: path.join(repoDir, "roles"), type: "role", urlPath: "roles" },
      { path: path.join(repoDir, "storage-systems"), type: "storage", urlPath: "storage-systems" },
      { path: path.join(repoDir, "items"), type: "other", urlPath: "items" } // For backward compatibility
    ];
    
    for (const dirType of directoryTypes) {
      try {
        // Check if directory exists
        const dirExists = await fs.stat(dirType.path)
          .then(() => true)
          .catch(() => false);
        
        if (!dirExists) continue;
        
        // Get all subdirectories
        const itemDirs = await fs.readdir(dirType.path);
        
        for (const itemDir of itemDirs) {
          const itemPath = path.join(dirType.path, itemDir);
          const stats = await fs.stat(itemPath);
          
          if (stats.isDirectory()) {
            try {
              // Parse item metadata
              const metadataPath = path.join(itemPath, "metadata.yml");
              const metadataExists = await fs.stat(metadataPath)
                .then(() => true)
                .catch(() => false);
                
              if (metadataExists) {
                const metadataContent = await fs.readFile(metadataPath, "utf-8");
                
                // For now, we'll parse the YAML content manually
                // In a future update, we'll add a YAML parser dependency
                const name = metadataContent.match(/name:\s*["']?([^"'\n]+)["']?/)?.[1] || itemDir;
                const description = metadataContent.match(/description:\s*["']?([^"'\n]+)["']?/)?.[1] || "No description";
                // Use the directory type as the default type if not specified in metadata
                const type = metadataContent.match(/type:\s*["']?([^"'\n]+)["']?/)?.[1] || dirType.type;
                const author = metadataContent.match(/author:\s*["']?([^"'\n]+)["']?/)?.[1];
                const version = metadataContent.match(/version:\s*["']?([^"'\n]+)["']?/)?.[1];
                const sourceUrl = metadataContent.match(/sourceUrl:\s*["']?([^"'\n]+)["']?/)?.[1];
                
                // Parse tags if present
                const tagsMatch = metadataContent.match(/tags:\s*\[(.*?)\]/);
                const tags = tagsMatch ?
                  tagsMatch[1].split(",").map(tag => tag.trim().replace(/["']/g, "")) :
                  undefined;
                
                const item: PackageManagerItem = {
                  name,
                  description,
                  type: type as "role" | "mcp-server" | "storage" | "other",
                  url: `${repoUrl}/tree/${branch}/${dirType.urlPath}/${itemDir}`,
                  repoUrl,
                  author,
                  tags,
                  version,
                  sourceUrl
                };
                
                items.push(item);
              }
            } catch (error) {
              console.error(`Failed to parse item ${itemDir}:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`Failed to parse directory ${dirType.path}:`, error);
      }
    }
    
    return items;
  }
}