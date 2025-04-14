import { render, screen, fireEvent, act } from "@testing-library/react"
import PackageManagerView from "../PackageManagerView"
import { ComponentMetadata, PackageManagerItem } from "../../../../../src/services/package-manager/types"

// Mock vscode API
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
		mockPostMessage.mockClear()
		// Reset window event listeners
		window.removeEventListener = jest.fn()
		window.addEventListener = jest.fn()
	})

	it("should initialize with empty states", () => {
		render(<PackageManagerView />)

		// Should show empty state message
		expect(screen.getByText("No package manager items found")).toBeInTheDocument()

		// Should have sent initial fetch request
		expect(mockPostMessage).toHaveBeenCalledWith({
			type: "fetchPackageManagerItems",
			forceRefresh: true,
		})
	})

	it("should handle state updates correctly", async () => {
		render(<PackageManagerView />)

		// Initial fetch request sets isFetching to true
		expect(mockPostMessage).toHaveBeenCalledWith({
			type: "fetchPackageManagerItems",
			forceRefresh: true,
		})

		// Simulate receiving items from backend during initial fetch
		act(() => {
			// First simulate the fetch request
			const mockEventListener = (window.addEventListener as jest.Mock).mock.calls[0][1]
			mockEventListener({
				data: {
					type: "packageManagerButtonClicked",
				},
			})

			// Then simulate receiving items
			mockEventListener({
				data: {
					type: "state",
					state: { packageManagerItems: mockItems },
				},
			})
		})

		// Wait for items to appear
		await screen.findByText(/2 items/)

		// Should show both items
		await screen.findByText("Test Package")
		await screen.findByText("Another Package")
	})

	it("should handle filter state transitions", async () => {
		render(<PackageManagerView />)

		// Load initial items
		act(() => {
			const mockEventListener = (window.addEventListener as jest.Mock).mock.calls[0][1]
			mockEventListener({
				data: {
					type: "state",
					state: { packageManagerItems: mockItems },
				},
			})
		})

		// Apply search filter
		const searchInput = screen.getByPlaceholderText("Search package manager items...")
		fireEvent.change(searchInput, { target: { value: "test" } })

		// Wait for debounce
		await new Promise((resolve) => setTimeout(resolve, 400))

		// Should have sent filter request
		expect(mockPostMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "filterPackageManagerItems",
				filters: {
					type: undefined,
					search: "test",
					tags: undefined,
				},
			}),
		)

		// Simulate receiving filtered results
		act(() => {
			const mockEventListener = (window.addEventListener as jest.Mock).mock.calls[0][1]
			mockEventListener({
				data: {
					type: "state",
					state: { packageManagerItems: [mockItems[0]] },
				},
			})
		})

		// Should show filtered count
		await screen.findByText(/1 item.*found.*filtered/i)
	})

	it("should handle tab switching correctly", async () => {
		render(<PackageManagerView />)

		// Initial fetch request sets isFetching to true
		expect(mockPostMessage).toHaveBeenCalledWith({
			type: "fetchPackageManagerItems",
			forceRefresh: true,
		})

		// Load initial items during fetch
		act(() => {
			// First simulate the fetch request
			const mockEventListener = (window.addEventListener as jest.Mock).mock.calls[0][1]
			mockEventListener({
				data: {
					type: "packageManagerButtonClicked",
				},
			})

			// Then simulate receiving items
			mockEventListener({
				data: {
					type: "state",
					state: { packageManagerItems: mockItems },
				},
			})
		})

		// Wait for initial items to load
		await screen.findByText(/2 items/)

		// Switch to sources tab
		const sourcesTab = screen.getByText("Sources")
		fireEvent.click(sourcesTab)

		// Should show sources view
		await screen.findByText("Configure Package Manager Sources")

		// Switch back to browse tab
		const browseTab = screen.getByText("Browse")
		fireEvent.click(browseTab)

		// Simulate receiving items again
		act(() => {
			const mockEventListener = (window.addEventListener as jest.Mock).mock.calls[0][1]
			mockEventListener({
				data: {
					type: "state",
					state: { packageManagerItems: mockItems },
				},
			})
		})

		// Should restore items
		await screen.findByText(/2 items/i)
		await screen.findByText("Test Package")
		await screen.findByText("Another Package")
	})

	it("should handle source changes correctly", () => {
		render(<PackageManagerView />)

		// Switch to sources tab
		const sourcesTab = screen.getByText("Sources")
		fireEvent.click(sourcesTab)

		// Add new source
		const urlInput = screen.getByPlaceholderText(/Git repository URL/)
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
			forceRefresh: true,
		})
	})

	it("should preserve filter state during tab switches", async () => {
		render(<PackageManagerView />)

		// Initial fetch request sets isFetching to true
		expect(mockPostMessage).toHaveBeenCalledWith({
			type: "fetchPackageManagerItems",
			forceRefresh: true,
		})

		// Load initial items during fetch
		act(() => {
			// First simulate the fetch request
			const mockEventListener = (window.addEventListener as jest.Mock).mock.calls[0][1]
			mockEventListener({
				data: {
					type: "packageManagerButtonClicked",
				},
			})

			// Then simulate receiving items
			mockEventListener({
				data: {
					type: "state",
					state: { packageManagerItems: mockItems },
				},
			})
		})

		// Wait for initial items to load
		await screen.findByText(/2 items/)

		// Apply search filter
		const searchInput = screen.getByPlaceholderText("Search package manager items...")
		fireEvent.change(searchInput, { target: { value: "test" } })

		// Wait for debounce
		await new Promise((resolve) => setTimeout(resolve, 400))

		// Simulate receiving filtered results
		act(() => {
			const mockEventListener = (window.addEventListener as jest.Mock).mock.calls[0][1]
			mockEventListener({
				data: {
					type: "state",
					state: { packageManagerItems: [mockItems[0]] },
				},
			})
		})

		// Switch to sources tab and back
		const sourcesTab = screen.getByText("Sources")
		fireEvent.click(sourcesTab)
		const browseTab = screen.getByText("Browse")
		fireEvent.click(browseTab)

		// Wait for filter operation to complete
		await new Promise((resolve) => setTimeout(resolve, 400))

		// Simulate receiving filtered results
		act(() => {
			const mockEventListener = (window.addEventListener as jest.Mock).mock.calls[0][1]
			mockEventListener({
				data: {
					type: "state",
					state: { packageManagerItems: [mockItems[0]] },
				},
			})
		})

		// Should still show filtered results
		await screen.findByText(/1 item.*found.*filtered/i)
		await screen.findByText("Test Package")
		expect(screen.queryByText("Another Package")).not.toBeInTheDocument()
	})
})
