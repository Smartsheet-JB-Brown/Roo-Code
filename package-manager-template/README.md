# Roo-Code Package Manager Template

This repository serves as a template for creating package manager items for Roo-Code. It contains examples of different types of package manager items and the required structure for each.

## Repository Structure

```
package manager-template/
├── README.md
├── metadata.yml
├── roles/
│   ├── developer-role/
│   │   ├── metadata.yml
│   │   └── role.md
│   └── architect-role/
│       ├── metadata.yml
│       └── role.md
├── mcp-servers/
│   ├── file-analyzer/
│   │   ├── metadata.yml
│   │   └── server.js
│   └── code-generator/
│       ├── metadata.yml
│       └── server.js
└── storage-systems/
    └── github-storage/
        ├── metadata.yml
        └── storage.js
```

## Root Metadata

The `metadata.yml` file at the root of the repository contains information about the repository itself:

```yaml
name: "Example Package Manager Repository"
description: "A collection of example package manager items for Roo-Code"
version: "1.0.0"
```

## Item Metadata

Each item in the package manager has its own `metadata.yml` file that contains information about the item:

```yaml
name: "Item Name"
description: "Item description"
type: "role|mcp-server|storage|other"
version: "1.0.0"
tags: ["tag1", "tag2"]
sourceUrl: "https://github.com/username/repo" # Optional URL for the "view source" button
```

## Testing

To test this repository with the Roo-Code Package Manager:

1. Create a new GitHub repository
2. Upload this template to the repository
3. In Roo-Code, go to the Package Manager tab
4. Click on the "Sources" tab
5. Add your repository URL
6. Go back to the "Browse" tab to see your package manager items