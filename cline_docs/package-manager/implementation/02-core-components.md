# Core Components

This document provides detailed information about the core components of the Package Manager system, their responsibilities, implementation details, and interactions.

## MetadataScanner

The MetadataScanner is responsible for reading and parsing package metadata from various sources, including local file systems and remote Git repositories.

### Responsibilities

- Scanning directories for package metadata files
- Parsing YAML metadata into structured objects
- Building component hierarchies
- Handling file system and Git operations
- Supporting localized metadata

### Implementation Details

```typescript
class MetadataScanner {
	/**
	 * Scans a directory for package metadata
	 * @param directoryPath Path to the directory to scan
	 * @param baseUrl Base URL for the repository (for remote sources)
	 * @returns Array of package items
	 */
	public async scanDirectory(directoryPath: string, baseUrl?: string): Promise<PackageManagerItem[]> {
		// Implementation details
	}

	/**
	 * Scans a Git repository for package metadata
	 * @param repoUrl URL of the Git repository
	 * @returns Array of package items
	 */
	public async scanRepository(repoUrl: string): Promise<PackageManagerItem[]> {
		// Implementation details
	}

	/**
	 * Parses a YAML metadata file
	 * @param filePath Path to the metadata file
	 * @returns Parsed metadata object
	 */
	private async parseMetadataFile(filePath: string): Promise<any> {
		// Implementation details
	}

	/**
	 * Builds a component hierarchy from flat items
	 * @param items Array of items to organize
	 * @returns Hierarchical structure of items
	 */
	private buildComponentHierarchy(items: any[]): PackageManagerItem[] {
		// Implementation details
	}
}
```

### Key Algorithms

#### Directory Scanning

The directory scanning algorithm recursively traverses directories looking for metadata files:

1. Start at the root directory
2. Look for `metadata.*.yml` files in the current directory
3. Parse found metadata files
4. For each subdirectory:
    - Determine the component type based on directory name
    - Recursively scan the subdirectory
    - Associate child components with parent components
5. Build the component hierarchy

#### Metadata Parsing

The metadata parsing process handles multiple formats and localizations:

1. Read the YAML file content
2. Parse the YAML into a JavaScript object
3. Extract the locale from the filename (e.g., `en` from `metadata.en.yml`)
4. Validate required fields (name, description, version)
5. Process optional fields (tags, author, etc.)
6. Return a structured metadata object

### Error Handling

The MetadataScanner includes robust error handling:

- Invalid YAML files are reported with specific parsing errors
- Missing required fields trigger validation errors
- File system access issues are caught and reported
- Network errors during Git operations are handled gracefully
- Partial results are returned when possible, with error flags

## PackageManagerManager

The PackageManagerManager is the central component that manages package items, applies filters, and handles package operations.

### Responsibilities

- Storing and managing package items
- Applying filters and search criteria
- Managing package sources
- Handling package operations
- Maintaining state between sessions

### Implementation Details

```typescript
class PackageManagerManager {
	private currentItems: PackageManagerItem[] = []
	private sources: PackageManagerSource[] = []

	/**
	 * Constructor
	 * @param context VS Code extension context
	 */
	constructor(private context: vscode.ExtensionContext) {
		// Initialize from stored state
	}

	/**
	 * Get all items
	 * @returns Array of all package items
	 */
	public getItems(): PackageManagerItem[] {
		return this.currentItems
	}

	/**
	 * Filter items based on criteria
	 * @param filters Filter criteria
	 * @returns Filtered array of items
	 */
	public filterItems(filters: { type?: string; search?: string; tags?: string[] }): PackageManagerItem[] {
		// Implementation details
	}

	/**
	 * Add a new package source
	 * @param url Source repository URL
	 * @param name Optional source name
	 * @returns Success status
	 */
	public async addSource(url: string, name?: string): Promise<boolean> {
		// Implementation details
	}

	/**
	 * Remove a package source
	 * @param url Source repository URL
	 * @returns Success status
	 */
	public removeSource(url: string): boolean {
		// Implementation details
	}

	/**
	 * Refresh all sources
	 * @returns Updated items
	 */
	public async refreshSources(): Promise<PackageManagerItem[]> {
		// Implementation details
	}

	/**
	 * Save state to persistent storage
	 */
	private saveState(): void {
		// Implementation details
	}
}
```

### Key Algorithms

#### Item Filtering

The filtering algorithm applies multiple criteria to the package items:

1. Start with the complete set of items
2. If a type filter is specified:
    - Keep only items matching the specified type
3. If a search term is specified:
    - Check item name, description, and author for matches
    - Check subcomponents for matches
    - Keep items that match or have matching subcomponents
    - Add match information to the items
4. If tag filters are specified:
    - Keep only items that have at least one of the specified tags
5. Return the filtered items with match information

#### Source Management

The source management process handles adding, removing, and refreshing sources:

1. For adding a source:

    - Validate the repository URL
    - Check if the source already exists
    - Add the source to the list
    - Scan the repository for items
    - Add the items to the current set
    - Save the updated source list

2. For removing a source:

    - Find the source in the list
    - Remove items from that source
    - Remove the source from the list
    - Save the updated source list

3. For refreshing sources:
    - Clear the current items
    - For each enabled source:
        - Scan the repository for items
        - Add the items to the current set
    - Return the updated items

### State Persistence

The PackageManagerManager maintains state between sessions:

- Source configurations are stored in extension global state
- User preferences are persisted
- Cached metadata can be stored for performance
- State is loaded during initialization
- State is saved after significant changes

## packageManagerMessageHandler

The packageManagerMessageHandler is responsible for routing messages between the UI and the backend components.

### Responsibilities

- Processing messages from the UI
- Calling appropriate PackageManagerManager methods
- Returning results to the UI
- Handling errors and status updates
- Managing asynchronous operations

### Implementation Details

```typescript
/**
 * Handle package manager messages
 * @param message The message to handle
 * @param packageManager The package manager instance
 * @returns Response object
 */
export async function handlePackageManagerMessages(message: any, packageManager: PackageManagerManager): Promise<any> {
	switch (message.type) {
		case "getItems":
			return {
				type: "items",
				data: packageManager.getItems(),
			}

		case "search":
			return {
				type: "searchResults",
				data: packageManager.filterItems({
					search: message.search,
					type: message.typeFilter,
					tags: message.tagFilters,
				}),
			}

		case "addSource":
			try {
				const success = await packageManager.addSource(message.url, message.name)
				return {
					type: "sourceAdded",
					data: { success },
				}
			} catch (error) {
				return {
					type: "error",
					error: error.message,
				}
			}

		// Additional message handlers...

		default:
			return {
				type: "error",
				error: `Unknown message type: ${message.type}`,
			}
	}
}
```

### Message Types

The message handler processes several types of messages:

#### Input Messages

1. **getItems**: Request all package items

    ```typescript
    {
    	type: "getItems"
    }
    ```

2. **search**: Apply search and filter criteria

    ```typescript
    {
      type: "search",
      search: "search term",
      typeFilter: "mode",
      tagFilters: ["tag1", "tag2"]
    }
    ```

3. **addSource**: Add a new package source

    ```typescript
    {
      type: "addSource",
      url: "https://github.com/username/repo.git",
      name: "Custom Source"
    }
    ```

4. **removeSource**: Remove a package source

    ```typescript
    {
      type: "removeSource",
      url: "https://github.com/username/repo.git"
    }
    ```

5. **refreshSources**: Refresh all sources
    ```typescript
    {
    	type: "refreshSources"
    }
    ```

#### Output Messages

1. **items**: Response with all items

    ```typescript
    {
      type: "items",
      data: [/* package items */]
    }
    ```

2. **searchResults**: Response with filtered items

    ```typescript
    {
      type: "searchResults",
      data: [/* filtered items */]
    }
    ```

3. **sourceAdded**: Response after adding a source

    ```typescript
    {
      type: "sourceAdded",
      data: { success: true }
    }
    ```

4. **error**: Error response
    ```typescript
    {
      type: "error",
      error: "Error message"
    }
    ```

### Asynchronous Processing

The message handler manages asynchronous operations:

1. Asynchronous methods return promises
2. Errors are caught and returned as error messages
3. Long-running operations can provide progress updates
4. The UI can display loading indicators during processing

## UI Components

The Package Manager includes several key UI components that render the interface and handle user interactions.

### PackageManagerView

The main container component that manages the overall UI:

```tsx
const PackageManagerView: React.FC = () => {
	const [items, setItems] = useState<PackageManagerItem[]>([])
	const [filters, setFilters] = useState({ type: "", search: "", tags: [] })
	const [activeTab, setActiveTab] = useState<"browse" | "sources">("browse")

	// Implementation details...

	return (
		<div className="package-manager-container">
			<div className="tabs">
				<button className={activeTab === "browse" ? "active" : ""} onClick={() => setActiveTab("browse")}>
					Browse
				</button>
				<button className={activeTab === "sources" ? "active" : ""} onClick={() => setActiveTab("sources")}>
					Sources
				</button>
			</div>

			{activeTab === "browse" ? (
				<div className="browse-container">
					<FilterPanel filters={filters} setFilters={setFilters} />
					<div className="results-area">
						{items.map((item) => (
							<PackageManagerItemCard
								key={item.name}
								item={item}
								filters={filters}
								setFilters={setFilters}
								activeTab={activeTab}
								setActiveTab={setActiveTab}
							/>
						))}
					</div>
				</div>
			) : (
				<SourcesPanel />
			)}
		</div>
	)
}
```

### Component Interactions

The UI components interact through props and state:

1. **Parent-Child Communication**:

    - Parent components pass data and callbacks to children
    - Children invoke callbacks to notify parents of events

2. **State Management**:

    - Component state for UI-specific state
    - Shared state for filters and active tab
    - Backend state accessed through messages

3. **Event Handling**:
    - UI events trigger state updates
    - State updates cause re-renders
    - Messages are sent to the backend when needed

### Accessibility Features

The UI components include several accessibility features:

1. **Keyboard Navigation**:

    - Tab order follows logical flow
    - Focus indicators are visible
    - Keyboard shortcuts for common actions

2. **Screen Reader Support**:

    - ARIA attributes for dynamic content
    - Semantic HTML structure
    - Descriptive labels and announcements

3. **Visual Accessibility**:
    - High contrast mode support
    - Resizable text
    - Color schemes that work with color blindness

## Component Integration

The core components work together to provide a complete package management experience:

### Initialization Flow

1. The Package Manager is activated
2. The PackageManagerManager loads stored state
3. The UI sends an initial "getItems" message
4. The message handler calls PackageManagerManager.getItems()
5. The UI receives and displays the items

### Search and Filter Flow

1. The user enters a search term or selects filters
2. The UI sends a "search" message with the criteria
3. The message handler calls PackageManagerManager.filterItems()
4. The PackageManagerManager applies the filters
5. The UI receives and displays the filtered items

### Source Management Flow

1. The user adds a new source
2. The UI sends an "addSource" message
3. The message handler calls PackageManagerManager.addSource()
4. The PackageManagerManager adds the source and scans for items
5. The UI receives confirmation and updates the display

## Performance Optimizations

The core components include several performance optimizations:

1. **Lazy Loading**:

    - Items are loaded on demand
    - Heavy operations are deferred
    - Components render incrementally

2. **Caching**:

    - Parsed metadata is cached
    - Filter results can be cached
    - Repository data is cached when possible

3. **Efficient Filtering**:

    - Filtering happens on the backend
    - Only necessary data is transferred
    - Algorithms optimize for common cases

4. **UI Optimizations**:
    - Virtual scrolling for large lists
    - Debounced search input
    - Optimized rendering of complex components

---

**Previous**: [Package Manager Architecture](./01-architecture.md) | **Next**: [Data Structures](./03-data-structures.md)
