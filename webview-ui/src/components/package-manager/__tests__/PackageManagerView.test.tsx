import { render, screen, fireEvent, act } from "@testing-library/react"
import PackageManagerView from "../PackageManagerView"
import { ComponentMetadata, PackageManagerItem } from "../../../../../src/services/package-manager/types"

// Mock vscode API for external communication
const mockPostMessage = jest.fn()
jest.mock("@/utils/vscode", () => ({
	vscode: {
		postMessage: (msg: any) => mockPostMessage(msg),
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
			repoUrl: "test-url",
			url: "test-url",
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
		fireEvent.change(searchInput, { target: { value: "test" } })

		// Verify search input value is updated
		expect(searchInput).toHaveValue("test")

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

	it("should preserve filter state during tab switches", async () => {
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
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "state",
						state: {
							packageManagerItems: mockItems,
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
})
