# Package Manager Repository Structure

## Directory Structure Overview

The package manager repository uses a flat directory structure where component types are determined by metadata rather than directory hierarchy. This approach:

1. **Simplified Navigation**

    - No deep nested directories like `items/mcp-servers/` or `packages/`
    - Components are placed directly in their parent directory
    - Type information is stored in metadata, not directory structure

2. **Type Determination**

    - Each component's type is specified in its metadata.yml
    - Types include: mcp-server, memory, role, package, group
    - Type field determines how the component is handled and displayed

3. **Localization**

    - Each component has language-specific metadata files named `metadata.{locale}.yml`
    - English metadata (metadata.en.yml) is required for component visibility
    - Other languages are optional (e.g., metadata.es.yml, metadata.fr.yml)

4. **Organization**
    - Groups can contain any type of component
    - Packages reference their components by path
    - Components can be standalone or part of a package/group

## Real-World Examples

### 1. Simple Single-Item Repository

Basic repository sharing individual components:

```
simple-tools/
├── metadata.en.yml
├── log-analyzer/        # Type determined by metadata
│   ├── metadata.en.yml
│   └── server.js
└── reviewer/           # Type determined by metadata
    ├── metadata.en.yml
    └── role.md
```

```yaml
# simple-tools/metadata.en.yml
name: "Simple Tools Collection"
description: "Collection of independent development tools"
version: "1.0.0"
```

```yaml
# log-analyzer/metadata.en.yml
name: "Log Analyzer"
description: "Simple log analysis tool"
type: "mcp-server"
version: "1.0.0"
tags: ["logs", "analysis"]
```

Note: The `items` field is only needed when referencing components that exist outside the package's directory.

### 2. Complex Development Toolkit Package

Full-featured development environment setup:

```
dev-toolkit/
├── metadata.en.yml
├── full-dev-env/           # Type: package
│   ├── metadata.en.yml
│   ├── metadata.es.yml
│   ├── code-analyzer/      # Type: mcp-server
│   │   ├── metadata.en.yml
│   │   ├── metadata.es.yml
│   │   └── server.js
│   ├── git-memory/        # Type: memory
│   │   ├── metadata.en.yml
│   │   ├── metadata.es.yml
│   │   └── memory.js
│   └── dev-role/          # Type: role
│       ├── metadata.en.yml
│       ├── metadata.es.yml
│       └── role.md
```

```yaml
# full-dev-env/metadata.en.yml
name: "Full Development Environment"
description: "Complete development setup with code analysis and version control"
version: "2.0.0"
type: "package"
```

Example with external component reference:

```yaml
# full-dev-env/metadata.en.yml
name: "Full Development Environment"
description: "Complete development setup with code analysis and version control"
version: "2.0.0"
type: "package"
items: # Only needed for components outside this directory
    - type: "mcp-server"
      path: "../shared/security-scanner" # External component
```

```yaml
# full-dev-env/metadata.es.yml
name: "Entorno de Desarrollo Completo"
description: "Configuración completa de desarrollo con análisis de código y control de versiones"
version: "2.0.0"
type: "package"
```

### 3. Large Enterprise Data Platform

Complex organization with multiple groups and shared resources:

```
data-platform/
├── metadata.en.yml          # Repository metadata
├── metadata.es.yml
├── data-engineering/        # Type: group
│   ├── metadata.en.yml
│   ├── metadata.es.yml
│   ├── base-role/          # Type: role
│   │   ├── metadata.en.yml
│   │   └── metadata.es.yml
│   ├── data-lake-memory/   # Type: memory
│   │   ├── metadata.en.yml
│   │   └── metadata.es.yml
│   ├── batch-processor/    # Type: mcp-server
│   │   ├── metadata.en.yml
│   │   └── metadata.es.yml
│   ├── stream-processor/   # Type: mcp-server
│   │   ├── metadata.en.yml
│   │   └── metadata.es.yml
│   ├── model-trainer/      # Type: mcp-server
│   │   ├── metadata.en.yml
│   │   └── metadata.es.yml
│   └── model-inference/    # Type: mcp-server
│       ├── metadata.en.yml
│       └── metadata.es.yml
├── analytics/             # Type: group
│   ├── metadata.en.yml
│   ├── metadata.es.yml
│   ├── reporting-tool/    # Type: mcp-server
│   │   ├── metadata.en.yml
│   │   └── metadata.es.yml
│   └── dashboard-builder/ # Type: mcp-server
│       ├── metadata.en.yml
│       └── metadata.es.yml
└── starter-kit/          # Type: package
    ├── metadata.en.yml
    └── metadata.es.yml
```

```yaml
# data-engineering/en/metadata.yml
name: "Data Engineering"
type: "group"
tags: ["data-engineering"]
```

### 4. Localized Community Tools

Repository with multilingual support, using language-specific metadata:

```
community-tools/
└── web-dev-toolkit/        # Type: package
    ├── metadata.en.yml     # English metadata
    ├── metadata.es.yml     # Spanish metadata
    ├── metadata.fr.yml     # French metadata
    ├── code-formatter/     # Type: mcp-server
    │   ├── metadata.en.yml
    │   ├── metadata.es.yml
    │   ├── metadata.fr.yml
    │   └── server.js
    └── web-role/           # Type: role
        ├── metadata.en.yml
        ├── metadata.es.yml
        ├── metadata.fr.yml
        └── role.md
```

```yaml
# web-dev-toolkit/metadata.en.yml
name: "Web Development Toolkit"
description: "Complete toolkit for web development"
version: "1.0.0"
type: "package"
```

```yaml
# web-dev-toolkit/metadata.es.yml
name: "Herramientas de Desarrollo Web"
description: "Kit de herramientas completo para desarrollo web"
version: "1.0.0"
type: "package"
```

Note: Components (code-formatter and web-role) are automatically discovered by scanning subdirectories and reading their metadata files.

```yaml
# web-dev-toolkit/code-formatter/metadata.es.yml
name: "Formateador de Código"
description: "Herramienta de formateo de código"
version: "1.0.0"
type: "mcp-server"
```

This structure:

- Places all metadata in language-specific folders
- Uses 'en' as the fallback locale
- Components without 'en' metadata are not displayed
- Supports independent translation management
- Simplifies locale resolution logic

### 5. Evolution Example: From Simple to Complex

#### Stage 1: Simple Single Component

```
code-formatter/
└── metadata.en.yml
```

```yaml
# metadata.en.yml
name: "Simple Code Formatter"
description: "Basic code formatting tool"
version: "1.0.0"
type: "mcp-server"
```

#### Stage 2: Basic Package with Local Components

```
code-formatter-plus/
├── metadata.en.yml      # Basic package metadata
├── formatter/
│   ├── metadata.en.yml  # MCP server metadata
│   └── server.js
└── git-memory/
    ├── metadata.en.yml  # Memory metadata
    └── memory.js
```

```yaml
# metadata.en.yml
name: "Code Formatter Plus"
description: "Enhanced code formatting with git integration"
version: "1.5.0"
type: "package"
```

#### Stage 3: Package with External Component

```
code-quality-suite/
├── metadata.en.yml
├── metadata.es.yml
├── formatter/           # Local component
│   ├── metadata.en.yml
│   ├── metadata.es.yml
│   └── server.js
└── shared-scanner/     # Reference to external component
    └── metadata.yml    # Points to actual component elsewhere
```

```yaml
# metadata.en.yml
name: "Code Quality Suite"
description: "Complete code quality toolkit"
version: "2.0.0"
type: "package"
items: # Only needed because we reference an external component
    - type: "mcp-server"
      path: "../security/vulnerability-scanner"
```

```yaml
# metadata.es.yml
name: "Suite de Calidad de Código"
description: "Kit de herramientas completo para calidad de código"
version: "2.0.0"
type: "package"
```

Note: Advanced features like dependencies and configuration can be added later when needed. The basic structure focuses on essential metadata and local components.

[Previous sections unchanged]
