# Package Manager Localization Improvements

## Issue Identified

The current implementation of the Package Manager only uses English metadata (`metadata.en.yml`) for all functionality, regardless of the user's locale. While the system loads metadata files for other locales, it doesn't actually use them. The correct behavior should be:

1. Use the locale-specific version for each package item if it is present
2. Fall back to the English version if the locale-specific version is not available
3. Skip the item if neither the locale-specific nor the English version is available

## Implementation Changes Needed

### 1. Add User Locale Detection

```typescript
// Add to src/services/package-manager/types.ts
export interface LocalizationOptions {
  userLocale: string;
  fallbackLocale: string;
}
```

```typescript
// Add to src/services/package-manager/utils.ts
export function getUserLocale(): string {
  // Get from VS Code API or system locale
  const vscodeLocale = vscode.env.language;
  // Extract just the language part (e.g., "en-US" -> "en")
  return vscodeLocale.split('-')[0].toLowerCase();
}
```

### 2. Modify MetadataScanner to Use Locale Preference

```typescript
// Update MetadataScanner constructor
constructor(git?: SimpleGit, private localizationOptions?: LocalizationOptions) {
  this.git = git;
  this.localizationOptions = localizationOptions || {
    userLocale: getUserLocale(),
    fallbackLocale: 'en'
  };
}
```

### 3. Update Component Creation Logic

```typescript
// Update scanDirectory method in MetadataScanner.ts
async scanDirectory(rootDir: string, repoUrl: string, sourceName?: string): Promise<PackageManagerItem[]> {
  const items: PackageManagerItem[] = [];

  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const componentDir = path.join(rootDir, entry.name);
      const metadata = await this.loadComponentMetadata(componentDir);

      // Skip if no metadata found at all
      if (!metadata) continue;

      // Get localized metadata with fallback
      const localizedMetadata = this.getLocalizedMetadata(metadata);
      if (!localizedMetadata) continue;

      const item = await this.createPackageManagerItem(localizedMetadata, componentDir, repoUrl, sourceName);
      if (item) {
        // Process package subcomponents with the same localization logic
        // ...rest of the method
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${rootDir}:`, error);
  }

  return items;
}
```

### 4. Add Localization Selection Helper

```typescript
// Add to MetadataScanner.ts
private getLocalizedMetadata(metadata: LocalizedMetadata<ComponentMetadata>): ComponentMetadata | null {
  const { userLocale, fallbackLocale } = this.localizationOptions;

  // First try user's locale
  if (metadata[userLocale]) {
    return metadata[userLocale];
  }

  // Fall back to English
  if (metadata[fallbackLocale]) {
    return metadata[fallbackLocale];
  }

  // No suitable metadata found
  return null;
}
```

### 5. Update Subcomponent Processing

```typescript
// Update the subcomponent processing in scanDirectory
if (this.isPackageMetadata(localizedMetadata)) {
  // Load metadata for items listed in package metadata
  if (localizedMetadata.items) {
    const subcomponents = await Promise.all(
      localizedMetadata.items.map(async (subItem) => {
        const subPath = path.join(componentDir, subItem.path);
        const subMetadata = await this.loadComponentMetadata(subPath);

        // Skip if no metadata found
        if (!subMetadata) return null;

        // Get localized metadata with fallback
        const localizedSubMetadata = this.getLocalizedMetadata(subMetadata);
        if (!localizedSubMetadata) return null;

        return {
          type: subItem.type,
          path: subItem.path,
          metadata: localizedSubMetadata,
          lastUpdated: await this.getLastModifiedDate(subPath),
        };
      }),
    );
    item.items = subcomponents.filter((sub): sub is NonNullable<typeof sub> => sub !== null);
  }

  // Also scan directory for unlisted subcomponents with localization support
  await this.scanPackageSubcomponents(componentDir, item);
}
```

### 6. Update scanPackageSubcomponents Method

```typescript
// Update scanPackageSubcomponents in MetadataScanner.ts
private async scanPackageSubcomponents(
  packageDir: string,
  packageItem: PackageManagerItem,
  parentPath: string = "",
): Promise<void> {
  const entries = await fs.readdir(packageDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const subPath = path.join(packageDir, entry.name);
    const relativePath = parentPath ? path.join(parentPath, entry.name) : entry.name;

    // Try to load metadata directly
    const subMetadata = await this.loadComponentMetadata(subPath);

    if (subMetadata) {
      const isListed = packageItem.items?.some((i) => i.path === relativePath);

      if (!isListed) {
        // Get localized metadata with fallback
        const localizedSubMetadata = this.getLocalizedMetadata(subMetadata);
        if (localizedSubMetadata) {
          const subItem = {
            type: localizedSubMetadata.type,
            path: relativePath,
            metadata: localizedSubMetadata,
            lastUpdated: await this.getLastModifiedDate(subPath),
          };
          packageItem.items = packageItem.items || [];
          packageItem.items.push(subItem);
        }
      }
    }

    // Recursively scan this directory
    await this.scanPackageSubcomponents(subPath, packageItem, relativePath);
  }
}
```

### 7. Update PackageManagerManager to Pass Locale

```typescript
// Update PackageManagerManager.ts
constructor(private readonly context: vscode.ExtensionContext) {
  const userLocale = getUserLocale();
  this.gitFetcher = new GitFetcher(context, { userLocale, fallbackLocale: 'en' });
}
```

## Test Cases

### Unit Tests

1. **Test Locale Fallback Logic**

```typescript
describe('Localization Fallback', () => {
  let metadataScanner: MetadataScanner;

  beforeEach(() => {
    // Mock fs and other dependencies
  });

  test('should use user locale when available', async () => {
    // Setup mock metadata with both user locale and English
    const mockMetadata = {
      'en': { name: 'English Name', description: 'English Description' },
      'fr': { name: 'Nom Français', description: 'Description Française' }
    };

    // Initialize with French locale
    metadataScanner = new MetadataScanner(null, { userLocale: 'fr', fallbackLocale: 'en' });

    // Call the getLocalizedMetadata method
    const result = metadataScanner['getLocalizedMetadata'](mockMetadata);

    // Expect French metadata to be used
    expect(result.name).toBe('Nom Français');
    expect(result.description).toBe('Description Française');
  });

  test('should fall back to English when user locale not available', async () => {
    // Setup mock metadata with only English
    const mockMetadata = {
      'en': { name: 'English Name', description: 'English Description' }
    };

    // Initialize with French locale
    metadataScanner = new MetadataScanner(null, { userLocale: 'fr', fallbackLocale: 'en' });

    // Call the getLocalizedMetadata method
    const result = metadataScanner['getLocalizedMetadata'](mockMetadata);

    // Expect English metadata to be used as fallback
    expect(result.name).toBe('English Name');
    expect(result.description).toBe('English Description');
  });

  test('should return null when neither user locale nor English available', async () => {
    // Setup mock metadata with neither user locale nor English
    const mockMetadata = {
      'de': { name: 'Deutscher Name', description: 'Deutsche Beschreibung' }
    };

    // Initialize with French locale
    metadataScanner = new MetadataScanner(null, { userLocale: 'fr', fallbackLocale: 'en' });

    // Call the getLocalizedMetadata method
    const result = metadataScanner['getLocalizedMetadata'](mockMetadata);

    // Expect null result
    expect(result).toBeNull();
  });
});
```

2. **Test Component Loading with Localization**

```typescript
describe('Component Loading with Localization', () => {
  let metadataScanner: MetadataScanner;

  beforeEach(() => {
    // Mock fs and other dependencies
  });

  test('should load components with user locale preference', async () => {
    // Setup mock directory structure with multiple locales
    mockFs.readdir.mockImplementation((dir, options) => {
      if (dir === '/test/repo') {
        return Promise.resolve([
          { name: 'component1', isDirectory: () => true },
          { name: 'component2', isDirectory: () => true }
        ]);
      }
      return Promise.resolve([]);
    });

    // Mock loadComponentMetadata to return different locales
    jest.spyOn(MetadataScanner.prototype, 'loadComponentMetadata').mockImplementation((dir) => {
      if (dir === '/test/repo/component1') {
        return Promise.resolve({
          'en': { name: 'Component 1 EN', description: 'Description EN', type: 'mode' },
          'fr': { name: 'Component 1 FR', description: 'Description FR', type: 'mode' }
        });
      } else if (dir === '/test/repo/component2') {
        return Promise.resolve({
          'en': { name: 'Component 2 EN', description: 'Description EN', type: 'mcp server' }
        });
      }
      return Promise.resolve(null);
    });

    // Initialize with French locale
    metadataScanner = new MetadataScanner(null, { userLocale: 'fr', fallbackLocale: 'en' });

    // Scan directory
    const items = await metadataScanner.scanDirectory('/test/repo', 'https://example.com');

    // Expect French for component1, English for component2
    expect(items.length).toBe(2);
    expect(items[0].name).toBe('Component 1 FR');
    expect(items[1].name).toBe('Component 2 EN');
  });
});
```

3. **Test Subcomponent Processing with Localization**

```typescript
describe('Subcomponent Processing with Localization', () => {
  // Similar tests for subcomponents
});
```

### Integration Tests

1. **Test End-to-End Localization Flow**

```typescript
describe('End-to-End Localization', () => {
  test('should display components in user locale with fallback', async () => {
    // Setup test repository with multiple locales
    // Initialize PackageManagerManager with specific locale
    // Verify that components are displayed in the correct locale
  });
});
```

2. **Test with Real Package Repository**

```typescript
describe('Real Package Repository with Localization', () => {
  test('should handle real-world package repository with multiple locales', async () => {
    // Use a real package repository with multiple locales
    // Verify correct locale selection and fallback
  });
});
```

## UI Changes

1. **Add Locale Selector in UI (Optional Enhancement)**

```typescript
// Add to webview-ui/src/components/package-manager/PackageManagerView.tsx
const [currentLocale, setCurrentLocale] = useState(getUserLocale());

// Add locale selector dropdown
<Select
  value={currentLocale}
  onChange={(e) => {
    setCurrentLocale(e.target.value);
    // Trigger refresh with new locale
  }}
>
  <option value="en">English</option>
  <option value="fr">Français</option>
  <option value="es">Español</option>
  {/* Add more languages as needed */}
</Select>
```

## Documentation Updates

Update the documentation to reflect the correct localization behavior:

```markdown
### Localization Support

You can provide metadata in multiple languages by using locale-specific files:

- `metadata.en.yml` - English metadata (required as fallback)
- `metadata.es.yml` - Spanish metadata
- `metadata.fr.yml` - French metadata

**Important Notes on Localization:**
- Only files with the pattern `metadata.{locale}.yml` are supported
- The Package Manager will display metadata in the user's locale if available
- If the user's locale is not available, it will fall back to English
- The English locale (`metadata.en.yml`) is required as a fallback
- Files without a locale code (e.g., just `metadata.yml`) are not supported
```

## Implementation Plan

1. Add localization options and user locale detection
2. Modify MetadataScanner to use locale preference with fallback
3. Update component creation logic to handle localization
4. Add tests to verify localization behavior
5. Update documentation to reflect the correct behavior
6. (Optional) Add UI controls for locale selection