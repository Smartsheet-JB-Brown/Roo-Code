# Package Manager Implementation

The package manager feature allows users to discover, browse, and manage Git-based package sources containing reusable components like modes, MCP servers, and prompts.

## Core Components

### Backend (VSCode Extension)

- **PackageManagerManager**: Central service that manages package sources, fetching, and caching
- **GitFetcher**: Handles Git operations for cloning and updating repositories
- **MetadataScanner**: Scans repositories for component metadata
- **PackageManagerSourceValidation**: Validates package manager source URLs and configurations

### Frontend (Webview UI)

- **PackageManagerView**: React component for the package manager interface
- **PackageManagerViewStateManager**: Manages frontend state and synchronization with backend
- **useStateManager**: React hook for accessing the state manager

## Key Features

- Git repository integration (HTTPS, SSH, Git protocol)
- Component metadata scanning and validation
- Source configuration management
- Caching and concurrent operation handling
- Component filtering and sorting
- Real-time state synchronization between frontend and backend

## Implementation Details

See the following documentation for detailed implementation information:

- [Architecture Overview](./architecture.md)
- [Class Diagram](./class-diagram.md)
- [Sequence Diagrams](./sequence-diagrams.md)
