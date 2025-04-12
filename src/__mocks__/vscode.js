const vscode = {
	env: {
		language: "en", // Default language for tests
		appName: "Visual Studio Code Test",
		appHost: "desktop",
		appRoot: "/test/path",
		machineId: "test-machine-id",
		sessionId: "test-session-id",
		shell: "/bin/zsh",
		globalStorageUri: {
			fsPath: "/test/global-storage",
			scheme: "file",
			authority: "",
			path: "/test/global-storage",
			query: "",
			fragment: "",
			with: jest.fn(),
			toJSON: jest.fn(),
		},
	},
	window: {
		showInformationMessage: jest.fn(),
		showErrorMessage: jest.fn(),
		createTextEditorDecorationType: jest.fn().mockReturnValue({
			dispose: jest.fn(),
		}),
		tabGroups: {
			onDidChangeTabs: jest.fn(() => {
				return {
					dispose: jest.fn(),
				}
			}),
			all: [],
		},
	},
	workspace: {
		onDidSaveTextDocument: jest.fn(),
		createFileSystemWatcher: jest.fn().mockReturnValue({
			onDidCreate: jest.fn().mockReturnValue({ dispose: jest.fn() }),
			onDidDelete: jest.fn().mockReturnValue({ dispose: jest.fn() }),
			dispose: jest.fn(),
		}),
		fs: {
			stat: jest.fn().mockImplementation((uri) => {
				// Mock successful stat for cache directory
				if (uri.fsPath.includes("package-manager-cache")) {
					return Promise.resolve({
						type: vscode.FileType.Directory,
						ctime: Date.now(),
						mtime: Date.now(),
						size: 0,
					})
				}
				return Promise.reject(new Error("File not found"))
			}),
			readFile: jest.fn().mockImplementation((uri) => {
				// Mock successful file read for metadata files
				if (uri.fsPath.includes("package-with-externals")) {
					return Promise.resolve(
						Buffer.from(`
name: Package with Externals
description: A package with external item references
version: 1.0.0
type: package
items:
  - type: mcp server
    path: ../external/server
  - type: mode
    path: ../external/mode
`),
					)
				}
				if (uri.fsPath.includes("detailed-items")) {
					return Promise.resolve(
						Buffer.from(`
name: Detailed Component
description: A component with all optional fields
version: 1.0.0
type: mcp server
author: Test Author
tags:
  - test
  - detailed
sourceUrl: https://github.com/test/repo
lastUpdated: 2025-04-11T13:54:00Z
`),
					)
				}
				if (uri.fsPath.endsWith("metadata.en.yml")) {
					return Promise.resolve(
						Buffer.from(`
name: Test Component
description: Test description
version: 1.0.0
type: mcp server
`),
					)
				}
				if (uri.fsPath.endsWith("metadata.es.yml")) {
					return Promise.resolve(
						Buffer.from(`
name: Componente de Prueba
description: Descripción de prueba
version: 1.0.0
type: mcp server
`),
					)
				}
				if (uri.fsPath.endsWith("metadata.ja.yml")) {
					return Promise.resolve(
						Buffer.from(`
name: テストコンポーネント
description: テストの説明
version: 1.0.0
type: mcp server
`),
					)
				}
				return Promise.reject(new Error("File not found"))
			}),
			writeFile: jest.fn().mockResolvedValue(undefined),
			delete: jest.fn().mockResolvedValue(undefined),
			createDirectory: jest.fn().mockResolvedValue(undefined),
		},
	},
	Disposable: class {
		dispose() {}
	},
	Uri: {
		file: (path) => ({
			fsPath: path,
			scheme: "file",
			authority: "",
			path: path,
			query: "",
			fragment: "",
			with: jest.fn(),
			toJSON: jest.fn(),
		}),
	},
	EventEmitter: class {
		constructor() {
			this.event = jest.fn()
			this.fire = jest.fn()
		}
	},
	ConfigurationTarget: {
		Global: 1,
		Workspace: 2,
		WorkspaceFolder: 3,
	},
	Position: class {
		constructor(line, character) {
			this.line = line
			this.character = character
		}
	},
	Range: class {
		constructor(startLine, startCharacter, endLine, endCharacter) {
			this.start = new vscode.Position(startLine, startCharacter)
			this.end = new vscode.Position(endLine, endCharacter)
		}
	},
	ThemeColor: class {
		constructor(id) {
			this.id = id
		}
	},
	ExtensionMode: {
		Production: 1,
		Development: 2,
		Test: 3,
	},
	FileType: {
		Unknown: 0,
		File: 1,
		Directory: 2,
		SymbolicLink: 64,
	},
	TabInputText: class {
		constructor(uri) {
			this.uri = uri
		}
	},
	RelativePattern: class {
		constructor(base, pattern) {
			this.base = base
			this.pattern = pattern
		}
	},
	extensions: {
		getExtension: jest.fn().mockReturnValue({
			extensionUri: {
				fsPath: "/test/extension",
				scheme: "file",
				authority: "",
				path: "/test/extension",
				query: "",
				fragment: "",
				with: jest.fn(),
				toJSON: jest.fn(),
			},
			activate: jest.fn().mockResolvedValue({
				getPackageManager: jest.fn().mockReturnValue({
					addSource: jest.fn().mockResolvedValue(undefined),
					removeSource: jest.fn().mockResolvedValue(undefined),
					getSources: jest.fn().mockImplementation(async () => {
						return [
							{
								url: "https://github.com/roo-team/package-manager-template",
								enabled: true,
							},
						]
					}),
					getItems: jest.fn().mockImplementation(async () => {
						return [
							{
								name: "Test Component",
								description: "Test description",
								version: "1.0.0",
								type: "mcp server",
								url: "/test/path",
								repoUrl: "https://github.com/roo-team/package-manager-template",
								author: "Test Author",
								tags: ["test"],
								lastUpdated: "2025-04-11T13:54:00Z",
								sourceUrl: "https://github.com/test/repo",
								items: [
									{ type: "mcp server", path: "../external/server" },
									{ type: "mode", path: "../external/mode" },
								],
							},
						]
					}),
				}),
			}),
			exports: {
				getPackageManager: jest.fn().mockReturnValue({
					addSource: jest.fn().mockResolvedValue(undefined),
					removeSource: jest.fn().mockResolvedValue(undefined),
					getSources: jest.fn().mockImplementation(async () => {
						return [
							{
								url: "https://github.com/roo-team/package-manager-template",
								enabled: true,
							},
						]
					}),
					getItems: jest.fn().mockImplementation(async () => {
						return [
							{
								name: "Test Component",
								description: "Test description",
								version: "1.0.0",
								type: "mcp server",
								url: "/test/path",
								repoUrl: "https://github.com/roo-team/package-manager-template",
								author: "Test Author",
								tags: ["test"],
								lastUpdated: "2025-04-11T13:54:00Z",
								sourceUrl: "https://github.com/test/repo",
								items: [
									{ type: "mcp server", path: "../external/server" },
									{ type: "mode", path: "../external/mode" },
								],
							},
						]
					}),
				}),
			},
			isActive: true,
		}),
	},
}

module.exports = vscode
