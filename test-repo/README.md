# Minimal Package Manager Repository

This is a minimal example of a package manager repository structure that meets the basic requirements. The structure is intentionally kept as simple as possible to help diagnose any validation issues.

## Structure

```
/
├── metadata.en.yml         # Required: Repository metadata (must be exactly this name)
└── mcp-servers/           # Optional: Directory for MCP servers
    └── test-server/       # Must be a directory
        └── metadata.en.yml # Must match pattern metadata.[locale].yml
```

## metadata.en.yml

```yaml
name: Test Repository
description: A minimal test repository
version: 1.0.0
```

## mcp-servers/test-server/metadata.en.yml

```yaml
name: Test Server
description: A minimal test server
type: mcp server
version: 1.0.0
```

## Key Points

1. File names must be exactly:
    - metadata.en.yml (not metadata.yml or any other variation)
2. Components must be in directories
3. No empty lines in YAML files
4. No quotes around values
5. No extra fields
6. No special characters
7. No complex YAML features (arrays, nested objects, etc.)

Try copying this exact structure to your GitHub repository to test. The validation should pass with this minimal setup.

## Validation Process

1. First, it checks for metadata.en.yml in the root
2. Then it scans for component directories
3. For each directory, it looks for metadata.en.yml files
4. Each metadata file is validated for required fields
5. Component metadata must have a valid type ("mcp server", "mode", "prompt", or "package")
