import { render, screen, fireEvent, act } from "@testing-library/react"
import PackageManagerView from "../PackageManagerView"
import { ComponentMetadata, PackageManagerItem } from "../../../../../src/services/package-manager/types"

// Mock vscode API for external communication
const mockPostMessage = jest.fn()
jest.mock("../../../utils/vscode", () => ({
	vscode: {
		postMessage: (msg: any) => mockPostMessage(msg),
		getState: () => undefined,
		setState: (state: any) => state,
	},
}))

// Mock ExtensionStateContext
jest.mock("../../../context/ExtensionStateContext", () => ({
	useExtensionState: () => ({
		packageManagerSources: [{ url: "test-url", enabled: true }],
		setPackageManagerSources: jest.fn(),
	}),
}))

const mockMetadata: ComponentMetadata = {
	name: "Test Server",
	description: "A test server",
	type: "mcp server",
	version: "1.0.0",
}

describe("PackageManagerView", () => {
	beforeAll(() => {
		jest.setTimeout(5000) // 5 second timeout for all tests
	})

	const mockItems: PackageManagerItem[] = [
		{
			name: "Test Package",
			description: "A test package",
			type: "package",
			repoUrl: "https://github.com/org/repo",
			url: "test-url",
			defaultBranch: "main",
			tags: ["test", "mock"],
			items: [
				{
					type: "mcp server",
					path: "test/path",
					metadata: mockMetadata,
				},
			],
		},
		{
			name: "Another Package",
			description: "Another test package",
			type: "package",
			repoUrl: "test-url-2",
			url: "test-url-2",
			tags: ["test", "another"],
		},
	]

	beforeEach(() => {
		jest.useFakeTimers()
		mockPostMessage.mockClear()

		// Mock window event listener to handle messages
		const listeners = new Map()
		window.addEventListener = jest.fn((event, handler) => {
			console.log("=== Test: Adding event listener ===", { event })
			// Store the handler with the correct event type
			if (event === "message") {
				console.log("=== Test: Registering message event handler ===")
				listeners.set("message", handler)
			} else {
				listeners.set(event, handler)
			}
		})
		window.removeEventListener = jest.fn()
		window.dispatchEvent = jest.fn((event: Event) => {
			const messageEvent = event as MessageEvent
			console.log("=== Test: Dispatching event ===", {
				type: messageEvent.type,
				data: messageEvent.data,
				state: messageEvent.data?.state,
				isFetching: messageEvent.data?.state?.isFetching,
				itemCount: messageEvent.data?.state?.packageManagerItems?.length,
			})
			const handler = listeners.get(messageEvent.type)
			if (handler) {
				console.log("=== Test: Handler found, executing ===")
				handler(messageEvent)
				console.log("=== Test: Handler execution complete ===")
			} else {
				console.log("=== Test: No handler found for event type:", messageEvent.type)
			}
			return true
		})
	})

	it("should automatically fetch items on mount", async () => {
		render(<PackageManagerView />)

		// Should immediately trigger a fetch
		expect(mockPostMessage).toHaveBeenCalledWith({
			type: "fetchPackageManagerItems",
			bool: true,
		})

		// Should show loading state
		expect(screen.getByText("Loading items...")).toBeInTheDocument()

		// Simulate receiving items
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "state",
						state: {
							packageManagerItems: mockItems,
							isFetching: false,
							activeTab: "browse",
							refreshingUrls: [],
							sources: [],
							filters: { type: "", search: "", tags: [] },
							sortConfig: { by: "name", order: "asc" },
						},
					},
				}),
			)
		})

		// Should show items
		expect(screen.getByText("2 items total")).toBeInTheDocument()
		expect(screen.getByText("Test Package")).toBeInTheDocument()
		expect(screen.getByText("Another Package")).toBeInTheDocument()
	})

	it("should show empty state when fetch returns no items", async () => {
		render(<PackageManagerView />)

		// Should show loading state while fetching
		expect(screen.getByText("Loading items...")).toBeInTheDocument()

		// Simulate receiving empty items from fetch
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "state",
						state: {
							packageManagerItems: [],
							isFetching: false,
							activeTab: "browse",
							refreshingUrls: [],
							sources: [],
							filters: { type: "", search: "", tags: [] },
							sortConfig: { by: "name", order: "asc" },
						},
					},
				}),
			)
		})

		// Should show empty state
		expect(screen.getByText("No package manager items found")).toBeInTheDocument()
	})

	it("should handle filter state transitions", async () => {
		render(<PackageManagerView />)

		// Should show loading state initially
		expect(screen.getByText("Loading items...")).toBeInTheDocument()

		// Simulate receiving items
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "state",
						state: {
							packageManagerItems: mockItems,
							isFetching: false,
							activeTab: "browse",
							refreshingUrls: [],
							sources: [],
							filters: { type: "", search: "", tags: [] },
							sortConfig: { by: "name", order: "asc" },
						},
					},
				}),
			)
		})

		// Verify initial items are shown
		expect(screen.getByText("2 items total")).toBeInTheDocument()
		expect(screen.getByText("Test Package")).toBeInTheDocument()
		expect(screen.getByText("Another Package")).toBeInTheDocument()

		// Apply search filter
		const searchInput = screen.getByPlaceholderText("Search package manager items...")
		await act(async () => {
			fireEvent.change(searchInput, { target: { value: "test" } })
		})

		// Wait for the input value to update
		await screen.findByDisplayValue("test")

		// Update state with filtered results and filter flag
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "state",
						state: {
							packageManagerItems: [mockItems[0]],
							isFetching: false,
							activeTab: "browse",
							refreshingUrls: [],
							sources: [],
							filters: { type: "", search: "test", tags: [] },
							sortConfig: { by: "name", order: "asc" },
							isFiltered: true,
						},
					},
				}),
			)
		})

		// Wait for filtered state to be applied
		await screen.findByDisplayValue("test")

		// Verify filtered results
		expect(screen.getByText(/1 item.*found.*filtered/)).toBeInTheDocument()
		expect(screen.getByText("Test Package")).toBeInTheDocument()
		expect(screen.queryByText("Another Package")).not.toBeInTheDocument()
	})

	it("should handle tab switching correctly", async () => {
		render(<PackageManagerView />)

		// Should show loading state initially
		expect(screen.getByText("Loading items...")).toBeInTheDocument()

		// Load initial items
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "state",
						state: {
							packageManagerItems: mockItems,
							isFetching: false,
							activeTab: "browse",
							refreshingUrls: [],
							sources: [],
							filters: { type: "", search: "", tags: [] },
							sortConfig: { by: "name", order: "asc" },
						},
					},
				}),
			)
		})

		// Verify initial items are shown
		expect(screen.getByText("2 items total")).toBeInTheDocument()
		expect(screen.getByText("Test Package")).toBeInTheDocument()
		expect(screen.getByText("Another Package")).toBeInTheDocument()

		// Switch to sources tab
		const sourcesTab = screen.getByRole("button", { name: "Sources" })
		fireEvent.click(sourcesTab)

		// Verify sources view is shown
		expect(screen.getByText("Configure Package Manager Sources")).toBeInTheDocument()

		// Switch back to browse tab
		const browseTab = screen.getByRole("button", { name: "Browse" })
		fireEvent.click(browseTab)

		// Update state with items
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "state",
						state: {
							packageManagerItems: mockItems,
							isFetching: false,
							activeTab: "browse",
							refreshingUrls: [],
							sources: [],
							filters: { type: "", search: "", tags: [] },
							sortConfig: { by: "name", order: "asc" },
						},
					},
				}),
			)
		})

		// Verify items are restored
		expect(screen.getByText("2 items total")).toBeInTheDocument()
		expect(screen.getByText("Test Package")).toBeInTheDocument()
		expect(screen.getByText("Another Package")).toBeInTheDocument()
	})

	it("should handle source changes correctly", async () => {
		render(<PackageManagerView />)

		// Should show loading state initially
		expect(screen.getByText("Loading items...")).toBeInTheDocument()

		// Ensure state is updated and synchronized
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "state",
						state: {
							packageManagerItems: [],
							isFetching: false,
							activeTab: "browse",
							refreshingUrls: [],
							sources: [],
							filters: { type: "", search: "", tags: [] },
							sortConfig: { by: "name", order: "asc" },
						},
					},
				}),
			)
		})

		// Verify empty state persists after state update
		expect(screen.getByText("No package manager items found")).toBeInTheDocument()

		// Switch to sources tab
		const sourcesTab = screen.getByRole("button", { name: "Sources" })
		fireEvent.click(sourcesTab)

		// Wait for sources view to render
		await screen.findByText("Configure Package Manager Sources")

		// Add new source
		const urlInput = screen.getByPlaceholderText(/^Git repository URL/)
		fireEvent.change(urlInput, { target: { value: "https://github.com/test/repo" } })

		const addButton = screen.getByText("Add Source")
		fireEvent.click(addButton)

		// Should have sent sources update
		expect(mockPostMessage).toHaveBeenCalledWith({
			type: "packageManagerSources",
			sources: expect.any(Array),
		})

		// Switch back to browse tab
		const browseTab = screen.getByText("Browse")
		fireEvent.click(browseTab)

		// Should have sent fetch request
		expect(mockPostMessage).toHaveBeenCalledWith({
			type: "fetchPackageManagerItems",
			bool: true,
		})
	})

	it.skip("should preserve filter state during tab switches", async () => {
		render(<PackageManagerView />)

		// Should show loading state initially
		expect(screen.getByText("Loading items...")).toBeInTheDocument()

		// Load initial items with explicit state transitions
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "state",
						state: {
							packageManagerItems: mockItems,
							isFetching: false,
							activeTab: "browse",
							refreshingUrls: [],
							sources: [],
							filters: { type: "", search: "", tags: [] },
							sortConfig: { by: "name", order: "asc" },
						},
					},
				}),
			)
		})

		// Wait for items to appear
		await screen.findByText("2 items total")

		// Apply search filter by updating state directly
		// First set loading state without items
		// First set loading state without filters
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "state",
						state: {
							packageManagerItems: [],
							isFetching: true,
							activeTab: "browse",
							refreshingUrls: [],
							sources: [],
							filters: { type: "", search: "", tags: [] },
							sortConfig: { by: "name", order: "asc" },
						},
					},
				}),
			)
		})

		// Wait for loading state
		await screen.findByText("Loading items...")

		// Then update filters and send items
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "state",
						state: {
							packageManagerItems: mockItems,
							isFetching: false,
							activeTab: "browse",
							refreshingUrls: [],
							sources: [],
							filters: { type: "", search: "test", tags: [] },
							sortConfig: { by: "name", order: "asc" },
						},
					},
				}),
			)
		})

		// Wait for loading state
		await screen.findByText("Loading items...")

		// Then send items in a second event
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "state",
						state: {
							packageManagerItems: mockItems,
							isFetching: false,
							activeTab: "browse",
							refreshingUrls: [],
							sources: [],
							filters: { type: "", search: "test", tags: [] },
							sortConfig: { by: "name", order: "asc" },
						},
					},
				}),
			)
		})

		// Wait for loading state
		await screen.findByText("Loading items...")

		// Complete the filter operation
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "state",
						state: {
							packageManagerItems: [mockItems[0]],
							isFetching: false,
							activeTab: "browse",
							refreshingUrls: [],
							sources: [],
							filters: { type: "", search: "test", tags: [] }, // Keep search filter
							sortConfig: { by: "name", order: "asc" },
						},
					},
				}),
			)
		})

		// Verify filtered results
		await screen.findByText("1 item total")
		expect(screen.getByText("Test Package")).toBeInTheDocument()
		expect(screen.queryByText("Another Package")).not.toBeInTheDocument()

		// Update search input and filter state
		const searchInput = screen.getByPlaceholderText("Search package manager items...")
		fireEvent.change(searchInput, { target: { value: "test" } })

		// Wait for the filter to be applied
		await screen.findByDisplayValue("test")

		// Update state with filtered results
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "state",
						state: {
							packageManagerItems: [mockItems[0]],
							isFetching: false,
							activeTab: "browse",
							refreshingUrls: [],
							sources: [],
							filters: { type: "", search: "test", tags: [] },
							sortConfig: { by: "name", order: "asc" },
							isFiltered: true,
						},
					},
				}),
			)
		})

		// Verify filtered text appears (handle both singular and plural cases)
		await screen.findByText(/1 item.*found.*filtered|1 items.*found.*filtered/)

		// Switch to sources tab
		const sourcesTab = screen.getByRole("button", { name: "Sources" })
		fireEvent.click(sourcesTab)

		// Wait for sources view
		await screen.findByText("Configure Package Manager Sources")

		// Switch back to browse tab
		const browseTab = screen.getByRole("button", { name: "Browse" })
		fireEvent.click(browseTab)

		// Wait for filter operation to complete
		await act(async () => {
			// First set loading state
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "state",
						state: {
							packageManagerItems: [],
							isFetching: true,
							activeTab: "browse",
							refreshingUrls: [],
							sources: [],
							filters: { type: "", search: "test", tags: [] },
							sortConfig: { by: "name", order: "asc" },
						},
					},
				}),
			)
		})

		// Wait for loading state
		await screen.findByText("Loading items...")

		// Complete filter operation with results
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "state",
						state: {
							packageManagerItems: [mockItems[0]],
							isFetching: false,
							activeTab: "browse",
							refreshingUrls: [],
							sources: [],
							filters: { type: "", search: "test", tags: [] },
							sortConfig: { by: "name", order: "asc" },
							isFiltered: true,
						},
					},
				}),
			)
		})

		// Verify filtered results are preserved
		await screen.findByText(/1 item.*found.*filtered|1 items.*found.*filtered/)
		expect(screen.getByText("Test Package")).toBeInTheDocument()
		expect(screen.queryByText("Another Package")).not.toBeInTheDocument()
	})

	it("should include packages with matching subcomponents when filtering by type", async () => {
		render(<PackageManagerView />)

		// Should show loading state initially
		expect(screen.getByText("Loading items...")).toBeInTheDocument()

		// Load initial items including a package with MCP server subcomponent
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "state",
						state: {
							packageManagerItems: [
								{
									name: "Standalone MCP Server",
									description: "A standalone MCP server",
									type: "mcp server",
									repoUrl: "test-url-1",
									url: "test-url-1",
								},
								{
									name: "Package with MCP Server",
									description: "A package containing an MCP server",
									type: "package",
									repoUrl: "test-url-2",
									url: "test-url-2",
									items: [
										{
											type: "mcp server",
											path: "servers/test-server",
											metadata: {
												name: "Test Server",
												description: "A test server",
												type: "mcp server",
												version: "1.0.0",
											},
										},
									],
								},
								{
									name: "Package without MCP Server",
									description: "A package without an MCP server",
									type: "package",
									repoUrl: "test-url-3",
									url: "test-url-3",
									items: [
										{
											type: "mode",
											path: "modes/test-mode",
											metadata: {
												name: "Test Mode",
												description: "A test mode",
												type: "mode",
												version: "1.0.0",
											},
										},
									],
								},
							],
							isFetching: false,
							activeTab: "browse",
							refreshingUrls: [],
							sources: [],
							filters: { type: "", search: "", tags: [] },
							sortConfig: { by: "name", order: "asc" },
						},
					},
				}),
			)
		})

		// Verify initial items are shown
		expect(screen.getByText("3 items total")).toBeInTheDocument()
		expect(screen.getByText("Standalone MCP Server")).toBeInTheDocument()
		expect(screen.getByText("Package with MCP Server")).toBeInTheDocument()
		expect(screen.getByText("Package without MCP Server")).toBeInTheDocument()

		// Select MCP Server from type filter
		const typeFilter = screen.getByLabelText("Filter by type:")
		await act(async () => {
			fireEvent.change(typeFilter, { target: { value: "mcp server" } })
		})

		// Update state with filtered results
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "state",
						state: {
							packageManagerItems: [
								{
									name: "Standalone MCP Server",
									description: "A standalone MCP server",
									type: "mcp server",
									repoUrl: "test-url-1",
									url: "test-url-1",
								},
								{
									name: "Package with MCP Server",
									description: "A package containing an MCP server",
									type: "package",
									repoUrl: "test-url-2",
									url: "test-url-2",
									items: [
										{
											type: "mcp server",
											path: "servers/test-server",
											metadata: {
												name: "Test Server",
												description: "A test server",
												type: "mcp server",
												version: "1.0.0",
											},
										},
									],
								},
							],
							isFetching: false,
							activeTab: "browse",
							refreshingUrls: [],
							sources: [],
							filters: { type: "mcp server", search: "", tags: [] },
							sortConfig: { by: "name", order: "asc" },
							isFiltered: true,
						},
					},
				}),
			)
		})

		// Verify filtered results include both standalone MCP server and package with MCP server
		expect(screen.getByText(/2 items.*found.*filtered/)).toBeInTheDocument()
		expect(screen.getByText("Standalone MCP Server")).toBeInTheDocument()
		expect(screen.getByText("Package with MCP Server")).toBeInTheDocument()
		expect(screen.queryByText("Package without MCP Server")).not.toBeInTheDocument()
	})
	it("should update display items when receiving filtered results from backend", async () => {
		render(<PackageManagerView />)

		// Load initial items
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "state",
						state: {
							packageManagerItems: [
								{
									name: "MCP Server 1",
									type: "mcp server",
									repoUrl: "test-url-1",
									url: "test-url-1",
								},
								{
									name: "Mode 1",
									type: "mode",
									repoUrl: "test-url-2",
									url: "test-url-2",
								},
								{
									name: "MCP Server 2",
									type: "mcp server",
									repoUrl: "test-url-3",
									url: "test-url-3",
								},
							],
							isFetching: false,
							activeTab: "browse",
							refreshingUrls: [],
							sources: [],
							filters: { type: "", search: "", tags: [] },
							sortConfig: { by: "name", order: "asc" },
						},
					},
				}),
			)
		})

		// Verify initial items are shown
		expect(screen.getByText("3 items total")).toBeInTheDocument()
		expect(screen.getByText("MCP Server 1")).toBeInTheDocument()
		expect(screen.getByText("Mode 1")).toBeInTheDocument()
		expect(screen.getByText("MCP Server 2")).toBeInTheDocument()

		// Select MCP Server from type filter
		const typeFilter = screen.getByLabelText("Filter by type:")
		await act(async () => {
			fireEvent.change(typeFilter, { target: { value: "mcp server" } })
		})

		// Verify initial fetch and filter requests were sent
		expect(mockPostMessage).toHaveBeenCalledTimes(2)
		expect(mockPostMessage).toHaveBeenLastCalledWith({
			type: "filterPackageManagerItems",
			filters: { type: "mcp server", search: undefined, tags: undefined },
		})

		// Simulate backend response with filtered items
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "state",
						state: {
							packageManagerItems: [
								{
									name: "MCP Server 1",
									type: "mcp server",
									repoUrl: "test-url-1",
									url: "test-url-1",
								},
								{
									name: "MCP Server 2",
									type: "mcp server",
									repoUrl: "test-url-3",
									url: "test-url-3",
								},
							],
							isFetching: false,
							activeTab: "browse",
							refreshingUrls: [],
							sources: [],
							filters: { type: "mcp server", search: "", tags: [] },
							sortConfig: { by: "name", order: "asc" },
						},
					},
				}),
			)
		})

		// Verify filtered results are shown
		expect(screen.getByText(/2 items.*found.*filtered/)).toBeInTheDocument()
		expect(screen.getByText("MCP Server 1")).toBeInTheDocument()
		expect(screen.getByText("MCP Server 2")).toBeInTheDocument()
		expect(screen.queryByText("Mode 1")).not.toBeInTheDocument()

		// Now test that the display updates when backend sends new filtered results
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "state",
						state: {
							packageManagerItems: [
								{
									name: "MCP Server 2",
									type: "mcp server",
									repoUrl: "test-url-3",
									url: "test-url-3",
								},
							],
							isFetching: false,
							activeTab: "browse",
							refreshingUrls: [],
							sources: [],
							filters: { type: "mcp server", search: "", tags: [] },
							sortConfig: { by: "name", order: "asc" },
						},
					},
				}),
			)
		})

		// Verify updated filtered results are shown
		expect(screen.getByText(/1 item.*found.*filtered/)).toBeInTheDocument()
		expect(screen.queryByText("MCP Server 1")).not.toBeInTheDocument()
		expect(screen.getByText("MCP Server 2")).toBeInTheDocument()
		expect(screen.queryByText("Mode 1")).not.toBeInTheDocument()
	})

	it("should construct correct source URLs for packages and subcomponents", async () => {
		render(<PackageManagerView />)

		// Load initial items
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "state",
						state: {
							packageManagerItems: [
								{
									name: "Test Package",
									description: "A test package",
									type: "package",
									repoUrl: "https://github.com/org/repo",
									url: "test-url",
									defaultBranch: "main",
									items: [
										{
											type: "mcp server",
											path: "servers/test-server",
											metadata: {
												name: "Test Server",
												description: "A test server",
												type: "mcp server",
												version: "1.0.0",
											},
										},
									],
								},
							],
							isFetching: false,
							activeTab: "browse",
							refreshingUrls: [],
							sources: [],
							filters: { type: "", search: "", tags: [] },
							sortConfig: { by: "name", order: "asc" },
						},
					},
				}),
			)
		})

		// Find and click the package source button
		const packageSourceButton = screen.getByRole("button", {
			name: (name, element) => {
				return name === "Source" && element.querySelector(".codicon-link-external") !== null
			},
		})
		fireEvent.click(packageSourceButton)

		// Get the most recent call to mockPostMessage and verify URL
		const postMessageCalls = mockPostMessage.mock.calls
		const lastCallArgs = postMessageCalls[postMessageCalls.length - 1][0]
		expect(lastCallArgs).toEqual({
			type: "openExternal",
			url: "https://github.com/org/repo/tree/main",
		})
	})
	it("should send filter request when typing in search box", async () => {
		render(<PackageManagerView />)

		// Load initial items
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "state",
						state: {
							packageManagerItems: [],
							isFetching: false,
							activeTab: "browse",
							refreshingUrls: [],
							sources: [],
							filters: { type: "", search: "", tags: [] },
							sortConfig: { by: "name", order: "asc" },
						},
					},
				}),
			)
		})

		// Clear mock to ignore initial fetch
		mockPostMessage.mockClear()

		// Find and update search input
		const searchInput = screen.getByPlaceholderText("Search package manager items...")
		fireEvent.change(searchInput, { target: { value: "test" } })

		// Verify filter request was sent immediately
		expect(mockPostMessage).toHaveBeenCalledWith({
			type: "filterPackageManagerItems",
			filters: {
				type: "",
				search: "test",
				tags: [],
			},
		})
	})
})
