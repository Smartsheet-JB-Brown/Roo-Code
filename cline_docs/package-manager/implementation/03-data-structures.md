# Data Structures

This document details the key data structures used in the Package Manager, including their definitions, relationships, and usage patterns.

## Package and Component Types

The Package Manager uses a type system to categorize different kinds of components:

### ComponentType Enumeration

```typescript
/**
 * Supported component types
 */
export type ComponentType = "mode" | "prompt" | "package" | "mcp server";
```

These types represent the different kinds of components that can be managed by the Package Manager:

1. **mode**: AI assistant personalities with specialized capabilities
2. **prompt**: Pre-configured instructions for specific tasks
3. **package**: Collections of related components
4. **mcp server**: Model Context Protocol servers that provide additional functionality

The type system is extensible, allowing for new component types to be added in the future.

## Metadata Interfaces

The Package Manager uses a set of interfaces to define the structure of metadata for different components:

### BaseMetadata

```typescript
/**
 * Base metadata interface
 */
export interface BaseMetadata {
  name: string;
  description: string;
  version: string;
  tags?: string[];
}
```

This interface defines the common properties shared by all metadata types:

- **name**: The display name of the component
- **description**: A detailed explanation of the component's purpose
- **version**: The semantic version number
- **tags**: Optional array of relevant keywords

### RepositoryMetadata

```typescript
/**
 * Repository root metadata
 */
export interface RepositoryMetadata extends BaseMetadata {}
```

This interface represents the metadata for a package source repository. It currently inherits all properties from BaseMetadata without adding additional fields, but is defined separately to allow for future repository-specific extensions.

### ComponentMetadata

```typescript
/**
 * Component metadata with type
 */
export interface ComponentMetadata extends BaseMetadata {
  type: ComponentType;
}
```

This interface extends BaseMetadata to include a type field, which specifies the component type.

### PackageMetadata

```typescript
/**
 * Package metadata with optional subcomponents
 */
export interface PackageMetadata extends ComponentMetadata {
  type: "package";
  items?: {
    type: ComponentType;
    path: string;
    metadata?: ComponentMetadata;
  }[];
}
```

This interface represents packages that can contain subcomponents:

- **type**: Always "package" for this interface
- **items**: Optional array of subcomponents, each with:
  - **type**: The subcomponent type
  - **path**: The file system path to the subcomponent
  - **metadata**: Optional metadata for the subcomponent

### SubcomponentMetadata

```typescript
/**
 * Subcomponent metadata with parent reference
 */
export interface SubcomponentMetadata extends ComponentMetadata {
  parentPackage: {
    name: string;
    path: string;
  };
}
```

This interface represents components that are part of a parent package:

- All fields from ComponentMetadata
- **parentPackage**: Reference to the parent package
  - **name**: The name of the parent package
  - **path**: The file system path to the parent package

## Item Structures

The Package Manager uses several interfaces to represent items in the UI:

### MatchInfo

```typescript
/**
 * Information about why an item matched search/filter criteria
 */
export interface MatchInfo {
  matched: boolean;
  matchReason?: {
    nameMatch?: boolean;
    descriptionMatch?: boolean;
    tagMatch?: boolean;
    hasMatchingSubcomponents?: boolean;
  };
}
```

This interface provides information about why an item matched search or filter criteria:

- **matched**: Boolean indicating if the item matched
- **matchReason**: Optional object with specific match reasons
  - **nameMatch**: True if the name matched
  - **descriptionMatch**: True if the description matched
  - **tagMatch**: True if a tag matched
  - **hasMatchingSubcomponents**: True if a subcomponent matched

### PackageManagerItem

```typescript
/**
 * Represents an individual package manager item
 */
export interface PackageManagerItem {
  name: string;
  description: string;
  type: ComponentType;
  url: string;
  repoUrl: string;
  sourceName?: string;
  author?: string;
  tags?: string[];
  version?: string;
  lastUpdated?: string;
  sourceUrl?: string;
  items?: {
    type: ComponentType;
    path: string;
    metadata?: ComponentMetadata;
    lastUpdated?: string;
    matchInfo?: MatchInfo;
  }[];
  matchInfo?: MatchInfo;
}
```

This interface represents a complete package manager item as displayed in the UI:

- **name**: The display name of the item
- **description**: A detailed explanation of the item's purpose
- **type**: The component type
- **url**: The URL to the item's source
- **repoUrl**: The URL to the repository containing the item
- **sourceName**: Optional name of the source repository
- **author**: Optional author name
- **tags**: Optional array of relevant keywords
- **version**: Optional semantic version number
- **lastUpdated**: Optional date of last update
- **sourceUrl**: Optional URL to additional documentation
- **items**: Optional array of subcomponents
- **matchInfo**: Optional information about search/filter matches

### PackageManagerSource

```typescript
/**
 * Represents a Git repository source for package manager items
 */
export interface PackageManagerSource {
  url: string;
  name?: string;
  enabled: boolean;
}
```

This interface represents a package source repository:

- **url**: The URL to the Git repository
- **name**: Optional display name for the source
- **enabled**: Boolean indicating if the source is active

### PackageManagerRepository

```typescript
/**
 * Represents a repository with its metadata and items
 */
export interface PackageManagerRepository {
  metadata: RepositoryMetadata;
  items: PackageManagerItem[];
  url: string;
  error?: string;
}
```

This interface represents a complete repository with its metadata and items:

- **metadata**: The repository metadata
- **items**: Array of items in the repository
- **url**: The URL to the repository
- **error**: Optional error message if there was a problem loading the repository

### LocalizedMetadata

```typescript
/**
 * Utility type for metadata files with locale
 */
export type LocalizedMetadata<T> = {
  [locale: string]: T;
};
```

This utility type represents metadata that can be localized to different languages:

- **[locale: string]**: Keys are locale identifiers (e.g., "en", "fr")
- **T**: The type of metadata being localized

## UI Component Props

The Package Manager UI components use several prop interfaces:

### PackageManagerItemCardProps

```typescript
interface PackageManagerItemCardProps {
  item: PackageManagerItem;
  filters: { type: string; search: string; tags: string[] };
  setFilters: React.Dispatch<React.SetStateAction<{ type: string; search: string; tags: string[] }>>;
  activeTab: "browse" | "sources";
  setActiveTab: React.Dispatch<React.SetStateAction<"browse" | "sources">>;
}
```

This interface defines the props for the PackageManagerItemCard component:

- **item**: The package item to display
- **filters**: The current filter state
- **setFilters**: Function to update filters
- **activeTab**: The currently active tab
- **setActiveTab**: Function to change the active tab

### ExpandableSectionProps

```typescript
interface ExpandableSectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  defaultExpanded?: boolean;
  badge?: string;
}
```

This interface defines the props for the ExpandableSection component:

- **title**: The section header text
- **children**: The content to display when expanded
- **className**: Optional CSS class name
- **defaultExpanded**: Optional flag to set initial expanded state
- **badge**: Optional badge text to display

### TypeGroupProps

```typescript
interface TypeGroupProps {
  type: string;
  items: Array<{
    name: string;
    description?: string;
    metadata?: any;
    path?: string;
  }>;
  className?: string;
  searchTerm?: string;
}
```

This interface defines the props for the TypeGroup component:

- **type**: The component type to display
- **items**: Array of items of this type
- **className**: Optional CSS class name
- **searchTerm**: Optional search term for highlighting matches

## Grouped Items Structure

The Package Manager uses a specialized structure for grouping items by type:

### GroupedItems

```typescript
export interface GroupedItems {
  [type: string]: {
    type: string;
    items: Array<{
      name: string;
      description?: string;
      metadata?: any;
      path?: string;
    }>;
  };
}
```

This interface represents items grouped by their type:

- **[type: string]**: Keys are component types
- **type**: The component type (redundant with the key)
- **items**: Array of items of this type
  - **name**: The item name
  - **description**: Optional item description
  - **metadata**: Optional additional metadata
  - **path**: Optional file system path

## Filter and Sort Structures

The Package Manager uses several structures for filtering and sorting:

### Filters

```typescript
interface Filters {
  type: string;
  search: string;
  tags: string[];
}
```

This interface represents the filter criteria:

- **type**: The component type filter
- **search**: The search term
- **tags**: Array of tag filters

### SortConfig

```typescript
interface SortConfig {
  by: string;
  order: "asc" | "desc";
}
```

This interface represents the sort configuration:

- **by**: The field to sort by (e.g., "name", "author")
- **order**: The sort order ("asc" for ascending, "desc" for descending)

## Message Structures

The Package Manager uses a message-based architecture for communication:

### Input Messages

```typescript
// Get all items
{ type: "getItems" }

// Apply search and filter criteria
{
  type: "search",
  search: string,
  typeFilter: string,
  tagFilters: string[]
}

// Add a new package source
{
  type: "addSource",
  url: string,
  name?: string
}

// Remove a package source
{
  type: "removeSource",
  url: string
}

// Refresh all sources
{ type: "refreshSources" }
```

### Output Messages

```typescript
// Response with all items
{
  type: "items",
  data: PackageManagerItem[]
}

// Response with filtered items
{
  type: "searchResults",
  data: PackageManagerItem[]
}

// Response after adding a source
{
  type: "sourceAdded",
  data: { success: boolean }
}

// Error response
{
  type: "error",
  error: string
}
```

## Template Structure

The Package Manager uses a specific directory structure for templates:

### Basic Template Structure

```
package-manager-template/
├── metadata.en.yml           # Repository metadata
├── README.md                 # Repository documentation
├── packages/                 # Directory for package components
│   └── data-platform/        # Example package
│       └── metadata.en.yml   # Package metadata
├── modes/                    # Directory for mode components
│   └── developer-mode/       # Example mode
│       └── metadata.en.yml   # Mode metadata
├── mcp servers/              # Directory for MCP server components
│   ├── example-server/       # Example server
│   │   └── metadata.en.yml   # Server metadata
│   └── file-analyzer/        # Another example server
│       └── metadata.en.yml   # Server metadata
└── groups/                   # Directory for grouping components
    └── data-engineering/     # Example group
        └── metadata.en.yml   # Group metadata
```

### Metadata File Structure

```yaml
# Repository metadata (metadata.en.yml)
name: "Package Manager Template"
description: "A template repository for creating package manager sources"
version: "1.0.0"

# Component metadata (e.g., modes/developer-mode/metadata.en.yml)
name: "Developer Mode"
description: "A specialized mode for software development tasks"
version: "1.0.0"
type: "mode"
tags:
  - development
  - coding
  - software
```

## Data Flow and Transformations

The Package Manager transforms data through several stages:

### From File System to Metadata

1. Raw YAML files are read from the file system
2. YAML is parsed into JavaScript objects
3. Objects are validated against metadata interfaces
4. Localized metadata is combined into a single structure

### From Metadata to Items

1. Metadata objects are transformed into PackageManagerItem objects
2. File paths are converted to URLs
3. Parent-child relationships are established
4. Additional information is added (e.g., lastUpdated)

### From Items to UI

1. Items are filtered based on user criteria
2. Match information is added to items
3. Items are sorted according to user preferences
4. Items are grouped by type for display

## Data Validation

The Package Manager includes validation at several levels:

### Metadata Validation

```typescript
function validateMetadata(metadata: any): boolean {
  // Required fields
  if (!metadata.name || !metadata.description || !metadata.version) {
    return false;
  }

  // Type validation for components
  if (metadata.type && !["mode", "prompt", "package", "mcp server"].includes(metadata.type)) {
    return false;
  }

  // Additional validation...

  return true;
}
```

### URL Validation

```typescript
function isValidUrl(urlString: string): boolean {
  try {
    new URL(urlString);
    return true;
  } catch (e) {
    return false;
  }
}
```

### Tag Validation

```typescript
function validateTags(tags: any[]): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .filter(tag => typeof tag === "string" && tag.trim().length > 0)
    .map(tag => tag.trim());
}
```

## Data Relationships

The Package Manager maintains several important relationships between data structures:

### Parent-Child Relationships

Packages can contain subcomponents, creating a hierarchical structure:

```
Package
├── Mode
├── MCP Server
├── Prompt
└── Nested Package
    ├── Mode
    └── MCP Server
```

This relationship is represented in the data structures:

- Packages have an `items` array containing subcomponents
- Subcomponents have a `parentPackage` reference

### Source-Item Relationships

Items are associated with their source repositories:

- Each item has a `repoUrl` field pointing to its source
- Sources have a list of items they provide
- When a source is disabled, its items are hidden

### Type-Group Relationships

Items are grouped by their type for display:

- The `GroupedItems` interface organizes items by type
- Each type group contains items of that type
- The UI displays these groups separately

## Serialization and Persistence

The Package Manager serializes data for persistence:

### Source Persistence

```typescript
// Save sources to extension state
private saveState(): void {
  this.context.globalState.update("packageManagerSources", this.sources);
}

// Load sources from extension state
private loadState(): void {
  const savedSources = this.context.globalState.get<PackageManagerSource[]>("packageManagerSources", []);
  this.sources = savedSources;
}
```

### Metadata Caching

```typescript
// Cache metadata to improve performance
private cacheMetadata(url: string, metadata: any): void {
  const cacheKey = `metadata_${url}`;
  this.context.globalState.update(cacheKey, {
    timestamp: Date.now(),
    data: metadata
  });
}

// Retrieve cached metadata
private getCachedMetadata(url: string): any | null {
  const cacheKey = `metadata_${url}`;
  const cached = this.context.globalState.get(cacheKey);

  if (!cached || Date.now() - cached.timestamp > CACHE_TTL) {
    return null;
  }

  return cached.data;
}
```

## Data Structure Evolution

The Package Manager's data structures are designed for evolution:

### Versioning Strategy

- Interfaces include version fields
- New fields are added as optional
- Breaking changes are avoided when possible
- Migration code handles legacy data formats

### Extensibility Points

- The ComponentType can be extended with new types
- Metadata interfaces can be extended with new fields
- The message system can handle new message types
- The UI can adapt to display new data formats

---

**Previous**: [Core Components](./02-core-components.md) | **Next**: [Search and Filter Implementation](./04-search-and-filter.md)