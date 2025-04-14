# Testing Strategy

This document outlines the comprehensive testing strategy for the Package Manager, including unit tests, integration tests, and test data management.

## Testing Philosophy

The Package Manager follows a multi-layered testing approach to ensure reliability and maintainability:

1. **Unit Testing**: Testing individual components in isolation
2. **Integration Testing**: Testing interactions between components
3. **End-to-End Testing**: Testing complete user workflows
4. **Test-Driven Development**: Writing tests before implementation when appropriate
5. **Continuous Testing**: Running tests automatically on code changes

## Unit Tests

Unit tests focus on testing individual functions, classes, and components in isolation.

### Backend Unit Tests

Backend unit tests verify the functionality of core services and utilities:

#### MetadataScanner Tests

```typescript
describe("MetadataScanner", () => {
  let scanner: MetadataScanner;

  beforeEach(() => {
    scanner = new MetadataScanner();
  });

  describe("parseMetadataFile", () => {
    it("should parse valid YAML metadata", async () => {
      // Mock file system
      jest.spyOn(fs, "readFile").mockImplementation((path, options, callback) => {
        callback(null, Buffer.from(`
          name: "Test Package"
          description: "A test package"
          version: "1.0.0"
          type: "package"
        `));
      });

      const result = await scanner["parseMetadataFile"]("test/path/metadata.en.yml");

      expect(result).toEqual({
        name: "Test Package",
        description: "A test package",
        version: "1.0.0",
        type: "package"
      });
    });

    it("should handle invalid YAML", async () => {
      // Mock file system with invalid YAML
      jest.spyOn(fs, "readFile").mockImplementation((path, options, callback) => {
        callback(null, Buffer.from(`
          name: "Invalid YAML
          description: Missing quote
        `));
      });

      await expect(scanner["parseMetadataFile"]("test/path/metadata.en.yml"))
        .rejects.toThrow();
    });
  });

  describe("scanDirectory", () => {
    // Tests for directory scanning
  });
});
```

#### PackageManagerManager Tests

```typescript
describe("PackageManagerManager", () => {
  let manager: PackageManagerManager;
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    // Create mock context
    mockContext = {
      extensionPath: "/test/path",
      globalStorageUri: { fsPath: "/test/storage" },
      globalState: {
        get: jest.fn().mockImplementation((key, defaultValue) => defaultValue),
        update: jest.fn().mockResolvedValue(undefined)
      }
    } as unknown as vscode.ExtensionContext;

    manager = new PackageManagerManager(mockContext);
  });

  describe("filterItems", () => {
    it("should filter by type", () => {
      // Set up test data
      manager["currentItems"] = [
        { name: "Item 1", type: "mode", description: "Test item 1" },
        { name: "Item 2", type: "package", description: "Test item 2" }
      ] as PackageManagerItem[];

      const result = manager.filterItems({ type: "mode" });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Item 1");
    });

    it("should filter by search term", () => {
      // Set up test data
      manager["currentItems"] = [
        { name: "Alpha Item", type: "mode", description: "Test item" },
        { name: "Beta Item", type: "package", description: "Another test" }
      ] as PackageManagerItem[];

      const result = manager.filterItems({ search: "alpha" });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Alpha Item");
    });

    // More filter tests...
  });

  describe("addSource", () => {
    // Tests for adding sources
  });
});
```

#### Search Utilities Tests

```typescript
describe("searchUtils", () => {
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

  describe("itemMatchesSearch", () => {
    it("should match on name", () => {
      const item = {
        name: "Test Item",
        description: "Description"
      };

      expect(itemMatchesSearch(item, "test")).toEqual({
        matched: true,
        matchReason: {
          nameMatch: true,
          descriptionMatch: false
        }
      });
    });

    // More search matching tests...
  });
});
```

### Frontend Unit Tests

Frontend unit tests verify the functionality of UI components:

#### PackageManagerItemCard Tests

```typescript
describe("PackageManagerItemCard", () => {
  const mockItem: PackageManagerItem = {
    name: "Test Package",
    description: "A test package",
    type: "package",
    url: "https://example.com",
    repoUrl: "https://github.com/example/repo",
    tags: ["test", "example"],
    version: "1.0.0",
    lastUpdated: "2025-04-01"
  };

  const mockFilters = { type: "", search: "", tags: [] };
  const mockSetFilters = jest.fn();
  const mockSetActiveTab = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly", () => {
    render(
      <PackageManagerItemCard
        item={mockItem}
        filters={mockFilters}
        setFilters={mockSetFilters}
        activeTab="browse"
        setActiveTab={mockSetActiveTab}
      />
    );

    expect(screen.getByText("Test Package")).toBeInTheDocument();
    expect(screen.getByText("A test package")).toBeInTheDocument();
    expect(screen.getByText("Package")).toBeInTheDocument();
  });

  it("handles tag clicks", () => {
    render(
      <PackageManagerItemCard
        item={mockItem}
        filters={mockFilters}
        setFilters={mockSetFilters}
        activeTab="browse"
        setActiveTab={mockSetActiveTab}
      />
    );

    fireEvent.click(screen.getByText("test"));

    expect(mockSetFilters).toHaveBeenCalledWith({
      type: "",
      search: "",
      tags: ["test"]
    });
  });

  // More component tests...
});
```

#### ExpandableSection Tests

```typescript
describe("ExpandableSection", () => {
  it("renders collapsed by default", () => {
    render(
      <ExpandableSection title="Test Section">
        <div>Test Content</div>
      </ExpandableSection>
    );

    expect(screen.getByText("Test Section")).toBeInTheDocument();
    expect(screen.queryByText("Test Content")).not.toBeVisible();
  });

  it("expands when clicked", () => {
    render(
      <ExpandableSection title="Test Section">
        <div>Test Content</div>
      </ExpandableSection>
    );

    fireEvent.click(screen.getByText("Test Section"));

    expect(screen.getByText("Test Content")).toBeVisible();
  });

  it("can be expanded by default", () => {
    render(
      <ExpandableSection title="Test Section" defaultExpanded={true}>
        <div>Test Content</div>
      </ExpandableSection>
    );

    expect(screen.getByText("Test Content")).toBeVisible();
  });

  // More component tests...
});
```

#### TypeGroup Tests

```typescript
describe("TypeGroup", () => {
  const mockItems = [
    { name: "Item 1", description: "Description 1" },
    { name: "Item 2", description: "Description 2" }
  ];

  it("renders type heading and items", () => {
    render(<TypeGroup type="mode" items={mockItems} />);

    expect(screen.getByText("Modes")).toBeInTheDocument();
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
  });

  it("highlights items matching search term", () => {
    render(<TypeGroup type="mode" items={mockItems} searchTerm="item 1" />);

    const item1 = screen.getByText("Item 1");
    const item2 = screen.getByText("Item 2");

    expect(item1.className).toContain("text-vscode-textLink");
    expect(item2.className).not.toContain("text-vscode-textLink");
    expect(screen.getByText("match")).toBeInTheDocument();
  });

  // More component tests...
});
```

## Integration Tests

Integration tests verify that different components work together correctly.

### Backend Integration Tests

```typescript
describe("Package Manager Integration", () => {
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

  describe("Message Handler Integration", () => {
    it("should handle search messages", async () => {
      const message = {
        type: "search",
        search: "data platform",
        typeFilter: "",
        tagFilters: []
      };

      const result = await handlePackageManagerMessages(message, manager);

      expect(result.type).toBe("searchResults");
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toContain("Data Platform");
    });

    it("should handle type filter messages", async () => {
      const message = {
        type: "search",
        search: "",
        typeFilter: "mode",
        tagFilters: []
      };

      const result = await handlePackageManagerMessages(message, manager);

      expect(result.type).toBe("searchResults");
      expect(result.data.every(item => item.type === "mode")).toBe(true);
    });

    // More message handler tests...
  });

  describe("End-to-End Flow", () => {
    it("should find items with matching subcomponents", async () => {
      const message = {
        type: "search",
        search: "validator",
        typeFilter: "",
        tagFilters: []
      };

      const result = await handlePackageManagerMessages(message, manager);

      expect(result.data.length).toBeGreaterThan(0);

      // Check that subcomponents are marked as matches
      const hasMatchingSubcomponent = result.data.some(item =>
        item.items?.some(subItem => subItem.matchInfo?.matched)
      );
      expect(hasMatchingSubcomponent).toBe(true);
    });

    // More end-to-end flow tests...
  });
});
```

### Frontend Integration Tests

```typescript
describe("Package Manager UI Integration", () => {
  const mockItems: PackageManagerItem[] = [
    {
      name: "Test Package",
      description: "A test package",
      type: "package",
      url: "https://example.com",
      repoUrl: "https://github.com/example/repo",
      tags: ["test", "example"],
      items: [
        {
          type: "mode",
          path: "/test/path",
          metadata: {
            name: "Test Mode",
            description: "A test mode",
            type: "mode"
          }
        }
      ]
    },
    {
      name: "Another Package",
      description: "Another test package",
      type: "mode",
      url: "https://example.com",
      repoUrl: "https://github.com/example/repo",
      tags: ["example"]
    }
  ];

  beforeEach(() => {
    // Mock VSCode API
    (vscode.postMessage as jest.Mock).mockClear();
  });

  it("should filter items when search is entered", async () => {
    render(<PackageManagerView initialItems={mockItems} />);

    // Both packages should be visible initially
    expect(screen.getByText("Test Package")).toBeInTheDocument();
    expect(screen.getByText("Another Package")).toBeInTheDocument();

    // Enter search term
    const searchInput = screen.getByPlaceholderText("Search packages...");
    fireEvent.change(searchInput, { target: { value: "another" } });

    // Wait for debounce
    await waitFor(() => {
      expect(screen.queryByText("Test Package")).not.toBeInTheDocument();
      expect(screen.getByText("Another Package")).toBeInTheDocument();
    });
  });

  it("should expand details when search matches subcomponents", async () => {
    render(<PackageManagerView initialItems={mockItems} />);

    // Enter search term that matches a subcomponent
    const searchInput = screen.getByPlaceholderText("Search packages...");
    fireEvent.change(searchInput, { target: { value: "test mode" } });

    // Wait for debounce and expansion
    await waitFor(() => {
      expect(screen.getByText("Test Mode")).toBeInTheDocument();
      expect(screen.getByText("A test mode")).toBeInTheDocument();
    });

    // Check that the match is highlighted
    const modeElement = screen.getByText("Test Mode");
    expect(modeElement.className).toContain("text-vscode-textLink");
  });

  // More UI integration tests...
});
```

## Test Data Management

The Package Manager uses several approaches to manage test data:

### Mock Data

Mock data is used for simple unit tests:

```typescript
const mockItems: PackageManagerItem[] = [
  {
    name: "Test Package",
    description: "A test package",
    type: "package",
    url: "https://example.com",
    repoUrl: "https://github.com/example/repo",
    tags: ["test", "example"],
    version: "1.0.0"
  },
  // More mock items...
];
```

### Test Fixtures

Test fixtures provide more complex data structures:

```typescript
// fixtures/metadata.ts
export const metadataFixtures = {
  basic: {
    name: "Basic Package",
    description: "A basic package for testing",
    version: "1.0.0",
    type: "package"
  },

  withTags: {
    name: "Tagged Package",
    description: "A package with tags",
    version: "1.0.0",
    type: "package",
    tags: ["test", "fixture", "example"]
  },

  withSubcomponents: {
    name: "Complex Package",
    description: "A package with subcomponents",
    version: "1.0.0",
    type: "package",
    items: [
      {
        type: "mode",
        path: "/test/path/mode",
        metadata: {
          name: "Test Mode",
          description: "A test mode",
          type: "mode"
        }
      },
      {
        type: "mcp server",
        path: "/test/path/server",
        metadata: {
          name: "Test Server",
          description: "A test server",
          type: "mcp server"
        }
      }
    ]
  }
};
```

### Template Data

Real template data is used for integration tests:

```typescript
beforeAll(async () => {
  // Load real data from template
  metadataScanner = new MetadataScanner();
  const templatePath = path.resolve(__dirname, "../../../../package-manager-template");
  templateItems = await metadataScanner.scanDirectory(templatePath, "https://example.com");
});
```

### Test Data Generators

Generators create varied test data:

```typescript
// Test data generator
function generatePackageItems(count: number): PackageManagerItem[] {
  const types: ComponentType[] = ["mode", "mcp server", "package", "prompt"];
  const tags = ["test", "example", "data", "ui", "server", "client"];

  return Array.from({ length: count }, (_, i) => {
    const type = types[i % types.length];
    const randomTags = tags
      .filter(() => Math.random() > 0.5)
      .slice(0, Math.floor(Math.random() * 4));

    return {
      name: `Test ${type} ${i + 1}`,
      description: `This is a test ${type} for testing purposes`,
      type,
      url: `https://example.com/${type}/${i + 1}`,
      repoUrl: "https://github.com/example/repo",
      tags: randomTags.length ? randomTags : undefined,
      version: "1.0.0",
      lastUpdated: new Date().toISOString(),
      items: type === "package" ? generateSubcomponents(Math.floor(Math.random() * 5) + 1) : undefined
    };
  });
}

function generateSubcomponents(count: number): PackageManagerItem["items"] {
  const types: ComponentType[] = ["mode", "mcp server", "prompt"];

  return Array.from({ length: count }, (_, i) => {
    const type = types[i % types.length];

    return {
      type,
      path: `/test/path/${type}/${i + 1}`,
      metadata: {
        name: `Test ${type} ${i + 1}`,
        description: `This is a test ${type} subcomponent`,
        type
      }
    };
  });
}
```

## Test Organization

The Package Manager tests are organized by functionality rather than by file structure:

### Consolidated Test Files

```
src/services/package-manager/__tests__/
├── PackageManager.consolidated.test.ts  # Combined tests
├── searchUtils.test.ts                  # Search utility tests
└── PackageSubcomponents.test.ts         # Subcomponent tests
```

### Test Structure

Tests are organized into logical groups:

```typescript
describe("Package Manager", () => {
  // Shared setup

  describe("Direct Filtering", () => {
    // Tests for filtering functionality
  });

  describe("Message Handler Integration", () => {
    // Tests for message handling
  });

  describe("Sorting", () => {
    // Tests for sorting functionality
  });
});
```

## Test Coverage

The Package Manager maintains high test coverage:

### Coverage Goals

- **Backend Logic**: 90%+ coverage
- **UI Components**: 80%+ coverage
- **Integration Points**: 85%+ coverage

### Coverage Reporting

```typescript
// jest.config.js
module.exports = {
  // ...other config
  collectCoverage: true,
  coverageReporters: ["text", "lcov", "html"],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    },
    "src/services/package-manager/*.ts": {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  }
};
```

### Critical Path Testing

Critical paths have additional test coverage:

1. **Search and Filter**: Comprehensive tests for all filter combinations
2. **Message Handling**: Tests for all message types and error conditions
3. **UI Interactions**: Tests for all user interaction flows

## Test Performance

The Package Manager tests are optimized for performance:

### Fast Unit Tests

```typescript
// Fast unit tests with minimal dependencies
describe("containsSearchTerm", () => {
  it("should return true for exact matches", () => {
    expect(containsSearchTerm("hello world", "hello")).toBe(true);
  });

  // More tests...
});
```

### Optimized Integration Tests

```typescript
// Optimized integration tests
describe("Package Manager Integration", () => {
  // Load template data once for all tests
  beforeAll(async () => {
    templateItems = await metadataScanner.scanDirectory(templatePath);
  });

  // Create fresh manager for each test
  beforeEach(() => {
    manager = new PackageManagerManager(mockContext);
    manager["currentItems"] = [...templateItems];
  });

  // Tests...
});
```

### Parallel Test Execution

```typescript
// jest.config.js
module.exports = {
  // ...other config
  maxWorkers: "50%", // Use 50% of available cores
  maxConcurrency: 5  // Run up to 5 tests concurrently
};
```

## Continuous Integration

The Package Manager tests are integrated into the CI/CD pipeline:

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v2

    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '16'

    - name: Install dependencies
      run: npm ci

    - name: Run tests
      run: npm test

    - name: Upload coverage
      uses: codecov/codecov-action@v2
      with:
        file: ./coverage/lcov.info
```

### Pre-commit Hooks

```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "jest --findRelatedTests"
    ]
  }
}
```

## Test Debugging

The Package Manager includes tools for debugging tests:

### Debug Logging

```typescript
// Debug logging in tests
describe("Complex integration test", () => {
  it("should handle complex search", async () => {
    // Enable debug logging for this test
    const originalDebug = process.env.DEBUG;
    process.env.DEBUG = "package-manager:*";

    // Test logic...

    // Restore debug setting
    process.env.DEBUG = originalDebug;
  });
});
```

### Visual Debugging

```typescript
// Visual debugging for UI tests
describe("UI component test", () => {
  it("should render correctly", async () => {
    const { container } = render(<PackageManagerItemCard item={mockItem} />);

    // Save screenshot for visual debugging
    if (process.env.SAVE_SCREENSHOTS) {
      const screenshot = await page.screenshot();
      fs.writeFileSync("./screenshots/item-card.png", screenshot);
    }

    // Test assertions...
  });
});
```

## Test Documentation

The Package Manager tests include comprehensive documentation:

### Test Comments

```typescript
/**
 * Tests the search functionality with various edge cases
 *
 * Edge cases covered:
 * - Empty search term
 * - Case sensitivity
 * - Special characters
 * - Very long search terms
 * - Matching in subcomponents
 */
describe("Search functionality", () => {
  // Tests...
});
```

### Test Scenarios

```typescript
describe("Package filtering", () => {
  /**
   * Scenario: User filters by type and search term
   * Given: A list of packages of different types
   * When: The user selects a type filter and enters a search term
   * Then: Only packages of the selected type containing the search term should be shown
   */
  it("should combine type and search filters", () => {
    // Test implementation...
  });
});
```

---

**Previous**: [UI Component Design](./05-ui-components.md) | **Next**: [Extending the Package Manager](./07-extending.md)