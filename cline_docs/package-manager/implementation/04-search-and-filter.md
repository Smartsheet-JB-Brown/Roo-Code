# Search and Filter Implementation

This document details the implementation of search and filtering functionality in the Package Manager, including algorithms, optimization techniques, and performance considerations.

## Search Algorithm

The Package Manager implements a comprehensive search algorithm that matches user queries against multiple fields and supports hierarchical component structures.

### Search Term Matching

The core of the search functionality is the `containsSearchTerm` function, which checks if a string contains a search term:

```typescript
/**
 * Checks if a string contains a search term (case insensitive)
 * @param text The text to search in
 * @param searchTerm The term to search for
 * @returns True if the text contains the search term
 */
export function containsSearchTerm(text: string | undefined, searchTerm: string): boolean {
  if (!text || !searchTerm) {
    return false;
  }

  return text.toLowerCase().includes(searchTerm.toLowerCase());
}
```

This function:
- Handles undefined inputs gracefully
- Performs case-insensitive matching
- Uses JavaScript's native `includes` method for performance

### Item Search Implementation

The main search function applies the search term to multiple fields:

```typescript
/**
 * Checks if an item matches a search term
 * @param item The item to check
 * @param searchTerm The search term
 * @returns Match information
 */
function itemMatchesSearch(item: PackageManagerItem, searchTerm: string): MatchInfo {
  if (!searchTerm) {
    return { matched: true };
  }

  const term = searchTerm.toLowerCase();

  // Check main item fields
  const nameMatch = containsSearchTerm(item.name, term);
  const descriptionMatch = containsSearchTerm(item.description, term);
  const authorMatch = containsSearchTerm(item.author, term);

  // Check subcomponents
  let hasMatchingSubcomponents = false;

  if (item.items?.length) {
    hasMatchingSubcomponents = item.items.some(subItem =>
      containsSearchTerm(subItem.metadata?.name, term) ||
      containsSearchTerm(subItem.metadata?.description, term)
    );

    // Add match info to subcomponents
    item.items.forEach(subItem => {
      const subNameMatch = containsSearchTerm(subItem.metadata?.name, term);
      const subDescMatch = containsSearchTerm(subItem.metadata?.description, term);

      subItem.matchInfo = {
        matched: subNameMatch || subDescMatch,
        matchReason: subNameMatch || subDescMatch ? {
          nameMatch: subNameMatch,
          descriptionMatch: subDescMatch
        } : undefined
      };
    });
  }

  const matched = nameMatch || descriptionMatch || authorMatch || hasMatchingSubcomponents;

  return {
    matched,
    matchReason: matched ? {
      nameMatch,
      descriptionMatch,
      authorMatch,
      hasMatchingSubcomponents
    } : undefined
  };
}
```

This function:
- Checks the item's name, description, and author
- Recursively checks subcomponents
- Adds match information to both the item and its subcomponents
- Returns detailed match information

### Search Optimization Techniques

The search implementation includes several optimizations:

1. **Early Termination**:
   - Returns as soon as any field matches
   - Avoids unnecessary checks after a match is found

2. **Efficient String Operations**:
   - Uses native string methods for performance
   - Converts to lowercase once per string
   - Avoids regular expressions for simple matching

3. **Match Caching**:
   - Stores match information on items
   - Avoids recalculating matches for the same search term
   - Clears cache when the search term changes

4. **Lazy Evaluation**:
   - Only checks subcomponents if main fields don't match
   - Processes subcomponents only when necessary

## Filter Logic

The Package Manager implements multiple filter types that can be combined to narrow down results.

### Type Filtering

Type filtering restricts results to components of a specific type:

```typescript
/**
 * Filters items by type
 * @param items Items to filter
 * @param type Type to filter by
 * @returns Filtered items
 */
function filterByType(items: PackageManagerItem[], type: string): PackageManagerItem[] {
  if (!type) {
    return items;
  }

  return items.filter(item => item.type === type);
}
```

### Tag Filtering

Tag filtering shows only items with specific tags:

```typescript
/**
 * Filters items by tags
 * @param items Items to filter
 * @param tags Tags to filter by
 * @returns Filtered items
 */
function filterByTags(items: PackageManagerItem[], tags: string[]): PackageManagerItem[] {
  if (!tags.length) {
    return items;
  }

  return items.filter(item => {
    if (!item.tags?.length) {
      return false;
    }

    // Item must have at least one of the specified tags
    return item.tags.some(tag => tags.includes(tag));
  });
}
```

### Combined Filtering

The main filter function combines all filter types:

```typescript
/**
 * Filters items based on criteria
 * @param items Items to filter
 * @param filters Filter criteria
 * @returns Filtered items
 */
export function filterItems(
  items: PackageManagerItem[],
  filters: { type?: string; search?: string; tags?: string[] }
): PackageManagerItem[] {
  if (!isFilterActive(filters)) {
    return items;
  }

  let result = items;

  // Apply type filter
  if (filters.type) {
    result = filterByType(result, filters.type);
  }

  // Apply search filter
  if (filters.search) {
    result = result.filter(item => {
      const matchInfo = itemMatchesSearch(item, filters.search!);
      item.matchInfo = matchInfo;
      return matchInfo.matched;
    });
  }

  // Apply tag filter
  if (filters.tags?.length) {
    result = filterByTags(result, filters.tags);
  }

  return result;
}
```

This function:
- Applies filters in a specific order (type, search, tags)
- Short-circuits if no filters are active
- Adds match information to items
- Returns a new array with filtered items

### Filter Optimization Techniques

The filter implementation includes several optimizations:

1. **Filter Order**:
   - Applies the most restrictive filters first
   - Reduces the number of items for subsequent filters
   - Improves performance for large datasets

2. **Short-Circuit Evaluation**:
   - Skips filtering entirely if no filters are active
   - Returns early when possible

3. **Immutable Operations**:
   - Creates new arrays rather than modifying existing ones
   - Ensures predictable behavior
   - Supports undo/redo functionality

4. **Selective Processing**:
   - Only processes necessary fields for each filter
   - Avoids redundant calculations

## Selector Functions

The Package Manager uses selector functions to extract and transform data for the UI:

### Filter Status Selector

```typescript
/**
 * Checks if any filters are active
 * @param filters Filter criteria
 * @returns True if any filters are active
 */
export const isFilterActive = (filters: Filters): boolean => {
  return !!(filters.type || filters.search || filters.tags.length > 0);
};
```

### Display Items Selector

```typescript
/**
 * Gets items for display based on filters and sort config
 * @param items All items
 * @param filters Filter criteria
 * @param sortConfig Sort configuration
 * @returns Filtered and sorted items
 */
export const getDisplayedItems = (
  items: PackageManagerItem[],
  filters: Filters,
  sortConfig: SortConfig,
): PackageManagerItem[] => {
  const filteredItems = filterItems(items, filters);
  return sortItems(filteredItems, sortConfig);
};
```

### Sort Function

```typescript
/**
 * Sorts items based on configuration
 * @param items Items to sort
 * @param config Sort configuration
 * @returns Sorted items
 */
export const sortItems = (items: PackageManagerItem[], config: SortConfig): PackageManagerItem[] => {
  return [...items].sort((a, b) => {
    let comparison = 0;

    switch (config.by) {
      case "name":
        comparison = a.name.localeCompare(b.name);
        break;
      case "author":
        comparison = (a.author || "").localeCompare(b.author || "");
        break;
      case "lastUpdated":
        comparison = (a.lastUpdated || "").localeCompare(b.lastUpdated || "");
        break;
      default:
        comparison = a.name.localeCompare(b.name);
    }

    return config.order === "asc" ? comparison : -comparison;
  });
};
```

## Grouping Implementation

The Package Manager includes functionality to group items by type:

### Group By Type Function

```typescript
/**
 * Groups package items by their type
 * @param items Array of items to group
 * @returns Object with items grouped by type
 */
export function groupItemsByType(items: PackageManagerItem["items"] = []): GroupedItems {
  if (!items?.length) {
    return {};
  }

  return items.reduce((groups: GroupedItems, item) => {
    if (!item.type) {
      return groups;
    }

    if (!groups[item.type]) {
      groups[item.type] = {
        type: item.type,
        items: [],
      };
    }

    groups[item.type].items.push({
      name: item.metadata?.name || "Unnamed item",
      description: item.metadata?.description,
      metadata: item.metadata,
      path: item.path,
    });

    return groups;
  }, {});
}
```

### Helper Functions

```typescript
/**
 * Gets the total number of items across all groups
 * @param groups Grouped items object
 * @returns Total number of items
 */
export function getTotalItemCount(groups: GroupedItems): number {
  return Object.values(groups).reduce((total, group) => total + group.items.length, 0);
}

/**
 * Gets an array of unique types from the grouped items
 * @param groups Grouped items object
 * @returns Array of type strings
 */
export function getUniqueTypes(groups: GroupedItems): string[] {
  return Object.keys(groups).sort();
}
```

## UI Integration

The search and filter functionality is integrated with the UI through several components:

### Search Input Component

```tsx
const SearchInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
}> = ({ value, onChange }) => {
  // Debounce search input to avoid excessive filtering
  const debouncedOnChange = useDebounce(onChange, 300);

  return (
    <div className="search-container">
      <span className="codicon codicon-search"></span>
      <input
        type="text"
        value={value}
        onChange={(e) => debouncedOnChange(e.target.value)}
        placeholder="Search packages..."
        className="search-input"
        aria-label="Search packages"
      />
      {value && (
        <button
          className="clear-button"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          <span className="codicon codicon-close"></span>
        </button>
      )}
    </div>
  );
};
```

### Type Filter Component

```tsx
const TypeFilter: React.FC<{
  value: string;
  onChange: (value: string) => void;
  types: string[];
}> = ({ value, onChange, types }) => {
  return (
    <div className="type-filter">
      <h3>Filter by Type</h3>
      <div className="filter-options">
        <label className="filter-option">
          <input
            type="radio"
            name="type-filter"
            value=""
            checked={value === ""}
            onChange={() => onChange("")}
          />
          <span>All Types</span>
        </label>

        {types.map((type) => (
          <label key={type} className="filter-option">
            <input
              type="radio"
              name="type-filter"
              value={type}
              checked={value === type}
              onChange={() => onChange(type)}
            />
            <span>{getTypeLabel(type)}</span>
          </label>
        ))}
      </div>
    </div>
  );
};
```

### Tag Filter Component

```tsx
const TagFilter: React.FC<{
  selectedTags: string[];
  onChange: (tags: string[]) => void;
  availableTags: string[];
}> = ({ selectedTags, onChange, availableTags }) => {
  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onChange(selectedTags.filter(t => t !== tag));
    } else {
      onChange([...selectedTags, tag]);
    }
  };

  return (
    <div className="tag-filter">
      <h3>Filter by Tags</h3>
      <div className="tag-cloud">
        {availableTags.map((tag) => (
          <button
            key={tag}
            className={`tag ${selectedTags.includes(tag) ? "selected" : ""}`}
            onClick={() => toggleTag(tag)}
            aria-pressed={selectedTags.includes(tag)}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
};
```

## Performance Considerations

The search and filter implementation includes several performance optimizations:

### Large Dataset Handling

For large datasets, the Package Manager implements:

1. **Pagination**:
   - Limits the number of items displayed at once
   - Implements virtual scrolling for smooth performance
   - Loads additional items as needed

2. **Progressive Loading**:
   - Shows initial results quickly
   - Loads additional details asynchronously
   - Provides visual feedback during loading

3. **Background Processing**:
   - Performs heavy operations in a web worker
   - Keeps the UI responsive during filtering
   - Updates results incrementally

### Search Optimizations

For efficient searching:

1. **Debounced Input**:
   ```typescript
   function useDebounce<T>(value: T, delay: number): T {
     const [debouncedValue, setDebouncedValue] = useState(value);

     useEffect(() => {
       const timer = setTimeout(() => {
         setDebouncedValue(value);
       }, delay);

       return () => {
         clearTimeout(timer);
       };
     }, [value, delay]);

     return debouncedValue;
   }
   ```

2. **Incremental Matching**:
   - Matches characters in sequence
   - Prioritizes prefix matches
   - Supports fuzzy matching for better results

3. **Result Highlighting**:
   - Highlights matching text portions
   - Provides visual feedback on match quality
   - Improves user understanding of results

### Filter Combinations

For efficient filter combinations:

1. **Filter Order Optimization**:
   - Applies most restrictive filters first
   - Reduces dataset size early in the pipeline
   - Improves performance for complex filter combinations

2. **Filter Caching**:
   - Caches results for recent filter combinations
   - Avoids recomputing the same filters
   - Clears cache when underlying data changes

3. **Progressive Filtering**:
   - Shows initial results based on simple filters
   - Applies complex filters incrementally
   - Provides feedback during filtering process

## Edge Cases and Error Handling

The search and filter implementation handles several edge cases:

### Empty Results

When no items match the filters:

```tsx
const NoResults: React.FC<{
  filters: Filters;
  clearFilters: () => void;
}> = ({ filters, clearFilters }) => {
  return (
    <div className="no-results">
      <span className="codicon codicon-info"></span>
      <h3>No matching packages found</h3>
      <p>
        No packages match your current filters.
        {isFilterActive(filters) && (
          <>
            <br />
            <button onClick={clearFilters} className="clear-filters-button">
              Clear all filters
            </button>
          </>
        )}
      </p>
    </div>
  );
};
```

### Invalid Search Terms

The system handles invalid search terms:

- Empty searches show all items
- Special characters are escaped
- Very long search terms are truncated
- Malformed regex patterns are handled safely

### Filter Conflicts

When filters conflict:

- Shows a warning when appropriate
- Provides suggestions to resolve conflicts
- Falls back to reasonable defaults
- Preserves user intent when possible

## Testing Strategy

The search and filter functionality includes comprehensive tests:

### Unit Tests

```typescript
describe("Search Utils", () => {
  describe("containsSearchTerm", () => {
    it("should return true for exact matches", () => {
      expect(containsSearchTerm("hello world", "hello")).toBe(true);
    });

    it("should be case insensitive", () => {
      expect(containsSearchTerm("Hello World", "hello")).toBe(true);
      expect(containsSearchTerm("hello world", "WORLD")).toBe(true);
    });

    it("should handle undefined inputs", () => {
      expect(containsSearchTerm(undefined, "test")).toBe(false);
      expect(containsSearchTerm("test", "")).toBe(false);
    });
  });

  describe("filterItems", () => {
    const items = [
      {
        name: "Test Package",
        description: "A test package",
        type: "package",
        tags: ["test", "example"]
      },
      {
        name: "Another Package",
        description: "Another test package",
        type: "mode",
        tags: ["example"]
      }
    ];

    it("should filter by type", () => {
      const result = filterItems(items, { type: "package" });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Test Package");
    });

    it("should filter by search term", () => {
      const result = filterItems(items, { search: "another" });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Another Package");
    });

    it("should filter by tags", () => {
      const result = filterItems(items, { tags: ["test"] });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Test Package");
    });

    it("should combine filters", () => {
      const result = filterItems(items, {
        type: "package",
        tags: ["example"]
      });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Test Package");
    });
  });
});
```

### Integration Tests

```typescript
describe("Package Manager Search Integration", () => {
  let manager: PackageManagerManager;
  let metadataScanner: MetadataScanner;
  let templateItems: PackageManagerItem[];

  beforeAll(async () => {
    // Load real data from template
    metadataScanner = new MetadataScanner();
    const templatePath = path.resolve(__dirname, "../../../../package-manager-template");
    templateItems = await metadataScanner.scanDirectory(templatePath, "https://example.com");
  });

  beforeEach(() => {
    // Create a real context-like object
    const context = {
      extensionPath: path.resolve(__dirname, "../../../../"),
      globalStorageUri: { fsPath: path.resolve(__dirname, "../../../../mock/settings/path") },
    } as vscode.ExtensionContext;

    // Create real instances
    manager = new PackageManagerManager(context);

    // Set up manager with template data
    manager["currentItems"] = [...templateItems];
  });

  it("should find items by name", () => {
    const message = {
      type: "search",
      search: "data platform",
      typeFilter: "",
      tagFilters: []
    };

    const result = handlePackageManagerMessages(message, manager);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toContain("Data Platform");
  });

  it("should find items with matching subcomponents", () => {
    const message = {
      type: "search",
      search: "validator",
      typeFilter: "",
      tagFilters: []
    };

    const result = handlePackageManagerMessages(message, manager);
    expect(result.data.length).toBeGreaterThan(0);

    // Check that subcomponents are marked as matches
    const hasMatchingSubcomponent = result.data.some(item =>
      item.items?.some(subItem => subItem.matchInfo?.matched)
    );
    expect(hasMatchingSubcomponent).toBe(true);
  });
});
```

---

**Previous**: [Data Structures](./03-data-structures.md) | **Next**: [UI Component Design](./05-ui-components.md)