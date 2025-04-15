# Core Components

This document provides detailed information about the core components of the Package Manager system, their responsibilities, implementation details, and interactions.

## GitFetcher

The GitFetcher is responsible for managing Git repository operations, including cloning, pulling, and caching repository data.

### Responsibilities

- Cloning and updating Git repositories
- Managing repository cache
- Validating repository structure
- Coordinating with MetadataScanner
- Handling repository timeouts and errors

### Implementation Details

```typescript
class GitFetcher {
	private readonly cacheDir: string
	private metadataScanner: MetadataScanner
	private git?: SimpleGit

	/**
	 * Fetch repository data
	 * @param repoUrl Repository URL
	 * @param forceRefresh Whether to bypass cache
	 * @param sourceName Optional source name
	 * @returns Repository data
	 */
	public async fetchRepository(
		repoUrl: string,
		forceRefresh = false,
		sourceName?: string,
	): Promise<PackageManagerRepository> {
		// Implementation details
	}

	/**
	 * Clone or pull repository
	 * @param repoUrl Repository URL
	 * @param repoDir Repository directory
	 * @param forceRefresh Whether to force refresh
	 */
	private async cloneOrPullRepository(repoUrl: string, repoDir: string, forceRefresh: boolean): Promise<void> {
		// Implementation details
	}

	/**
	 * Clean up git locks
	 * @param repoDir Repository directory
	 */
	private async cleanupGitLocks(repoDir: string): Promise<void> {
		// Implementation details
	}
}
```

### Key Algorithms

#### Repository Management

The repository management process includes:

1. **Cache Management**:

    - Check if repository exists in cache
    - Validate cache freshness
    - Clean up stale cache entries
    - Handle cache directory creation

2. **Repository Operations**:

    - Clone new repositories
    - Pull updates for existing repos
    - Handle git lock files
    - Clean up failed operations

3. **Error Recovery**:
    - Handle network timeouts
    - Recover from corrupt repositories
    - Clean up partial clones
    - Retry failed operations

## MetadataScanner

The MetadataScanner is responsible for reading and parsing package metadata from repositories.

### Responsibilities

- Scanning directories for package metadata files
- Parsing YAML metadata into structured objects
- Building component hierarchies
- Supporting localized metadata
- Validating metadata structure

### Implementation Details

```typescript
class MetadataScanner {
	private git: SimpleGit
	private localizationOptions: LocalizationOptions

	/**
	 * Scan directory for package metadata
	 * @param directoryPath Directory to scan
	 * @param baseUrl Base repository URL
	 * @param sourceName Source repository name
	 * @returns Array of package items
	 */
	public async scanDirectory(
		directoryPath: string,
		baseUrl?: string,
		sourceName?: string,
	): Promise<PackageManagerItem[]> {
		// Implementation details
	}

	/**
	 * Parse metadata file
	 * @param filePath Path to metadata file
	 * @returns Parsed metadata
	 */
	private async parseMetadataFile(filePath: string): Promise<ComponentMetadata> {
		// Implementation details
	}
}
```

## PackageManagerManager

The PackageManagerManager is the central component that manages package data, caching, and operations.

### Responsibilities

- Managing concurrent operations
- Handling repository caching
- Coordinating with GitFetcher
- Applying filters and sorting
- Managing package sources

### Implementation Details

```typescript
class PackageManagerManager {
	private currentItems: PackageManagerItem[] = []
	private cache: Map<string, { data: PackageManagerRepository; timestamp: number }>
	private gitFetcher: GitFetcher
	private activeSourceOperations = new Set<string>()
	private isMetadataScanActive = false
	private pendingOperations: Array<() => Promise<void>> = []

	/**
	 * Queue an operation to run when no metadata scan is active
	 */
	private async queueOperation(operation: () => Promise<void>): Promise<void> {
		// Implementation details
	}

	/**
	 * Get package manager items from sources
	 */
	public async getPackageManagerItems(
		sources: PackageManagerSource[],
	): Promise<{ items: PackageManagerItem[]; errors?: string[] }> {
		// Implementation details
	}

	/**
	 * Filter items based on criteria
	 */
	public filterItems(
		items: PackageManagerItem[],
		filters: { type?: ComponentType; search?: string; tags?: string[] },
	): PackageManagerItem[] {
		// Implementation details
	}

	/**
	 * Sort items by field
	 */
	public sortItems(
		items: PackageManagerItem[],
		sortBy: keyof Pick<PackageManagerItem, "name" | "author" | "lastUpdated">,
		sortOrder: "asc" | "desc",
		sortSubcomponents: boolean = false,
	): PackageManagerItem[] {
		// Implementation details
	}
}
```

### Key Algorithms

#### Concurrency Control

The manager implements sophisticated concurrency control:

1. **Operation Queueing**:

    - Queue operations during active scans
    - Process operations sequentially
    - Handle operation dependencies
    - Maintain operation order

2. **Source Locking**:

    - Lock sources during operations
    - Prevent concurrent source access
    - Handle lock timeouts
    - Clean up stale locks

3. **Cache Management**:
    - Implement cache expiration
    - Handle cache invalidation
    - Clean up unused cache
    - Optimize cache storage

#### Advanced Filtering

The filtering system provides rich functionality:

1. **Multi-level Filtering**:

    - Filter parent items
    - Filter subcomponents
    - Handle package-specific logic
    - Track match information

2. **Match Information**:
    - Track match reasons
    - Handle partial matches
    - Support highlighting
    - Maintain match context

## PackageManagerViewStateManager

The PackageManagerViewStateManager handles UI state and view-level operations.

### Responsibilities

- Managing view-level state
- Handling UI filters
- Coordinating sorting
- Managing item visibility

### Implementation Details

```typescript
class PackageManagerViewStateManager {
	private items: PackageManagerItem[] = []
	private sortBy: "name" | "lastUpdated" = "name"
	private sortOrder: "asc" | "desc" = "asc"
	private filters: Filters = { type: "", search: "", tags: [] }

	/**
	 * Get filtered and sorted items
	 */
	public getFilteredAndSortedItems(): PackageManagerItem[] {
		// Implementation details
	}

	/**
	 * Check if item matches current filters
	 */
	private itemMatchesFilters(item: PackageManagerItem | Subcomponent): boolean {
		// Implementation details
	}
}
```

## Component Integration

The components work together through well-defined interfaces:

### Data Flow

1. **Repository Operations**:

    - PackageManagerManager coordinates with GitFetcher
    - GitFetcher manages repository state
    - MetadataScanner processes repository content
    - Results flow back to PackageManagerManager

2. **State Management**:

    - PackageManagerManager maintains backend state
    - ViewStateManager handles UI state
    - State changes trigger UI updates
    - Components react to state changes

3. **User Interactions**:
    - UI events trigger state updates
    - ViewStateManager processes changes
    - Changes propagate to backend
    - Results update UI state

## Performance Optimizations

The system includes several optimizations:

1. **Concurrent Operations**:

    - Operation queueing
    - Source locking
    - Parallel processing where safe
    - Resource management

2. **Efficient Caching**:

    - Multi-level cache
    - Cache invalidation
    - Lazy loading
    - Cache cleanup

3. **Smart Filtering**:

    - Optimized algorithms
    - Match tracking
    - Incremental updates
    - Result caching

4. **State Management**:
    - Minimal updates
    - State normalization
    - Change batching
    - Update optimization

---

**Previous**: [Package Manager Architecture](./01-architecture.md) | **Next**: [Data Structures](./03-data-structures.md)
