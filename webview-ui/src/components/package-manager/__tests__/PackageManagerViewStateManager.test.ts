import { PackageManagerViewStateManager } from "../PackageManagerViewStateManager"
import { vscode } from "../../../utils/vscode"
import {
	ComponentType,
	PackageManagerItem,
	PackageManagerSource,
} from "../../../../../src/services/package-manager/types"

const createTestItem = (overrides = {}): PackageManagerItem => ({
	name: "test",
	type: "mode" as ComponentType,
	description: "Test mode",
	url: "https://github.com/test/repo",
	repoUrl: "https://github.com/test/repo",
	author: "Test Author",
	version: "1.0.0",
	sourceName: "Test Source",
	sourceUrl: "https://github.com/test/repo",
	...overrides,
})

const createTestSources = (): PackageManagerSource[] => [
	{ url: "https://github.com/test/repo1", enabled: true },
	{ url: "https://github.com/test/repo2", enabled: true },
	{ url: "https://github.com/test/repo3", enabled: true },
]

// Mock vscode.postMessage
jest.mock("../../../utils/vscode", () => ({
	vscode: {
		postMessage: jest.fn(),
	},
}))

describe("PackageManagerViewStateManager", () => {
	let manager: PackageManagerViewStateManager

	beforeEach(() => {
		jest.clearAllMocks()
		manager = new PackageManagerViewStateManager()
	})

	describe("Initial State", () => {
		it("should initialize with default state", () => {
			const state = manager.getState()
			expect(state).toEqual({
				allItems: [],
				isFetching: false,
				activeTab: "browse",
				refreshingUrls: [],
				sources: [],
				filters: {
					type: "",
					search: "",
					tags: [],
				},
				sortConfig: {
					by: "name",
					order: "asc",
				},
			})
		})
	})

	describe("Fetch Transitions", () => {
		it("should handle FETCH_ITEMS transition", async () => {
			await manager.transition({ type: "FETCH_ITEMS" })

			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "fetchPackageManagerItems",
				bool: true,
			})

			const state = manager.getState()
			expect(state.isFetching).toBe(true)
		})

		it("should not start a new fetch if one is in progress", async () => {
			// Start first fetch
			await manager.transition({ type: "FETCH_ITEMS" })

			// Try to start second fetch
			await manager.transition({ type: "FETCH_ITEMS" })

			// postMessage should only be called once
			expect(vscode.postMessage).toHaveBeenCalledTimes(1)
		})

		it("should handle FETCH_COMPLETE transition", async () => {
			const testItems = [createTestItem()]

			await manager.transition({ type: "FETCH_ITEMS" })
			await manager.transition({
				type: "FETCH_COMPLETE",
				payload: { items: testItems },
			})

			const state = manager.getState()
			expect(state.isFetching).toBe(false)
			expect(state.allItems).toEqual(testItems)
		})

		it("should handle FETCH_ERROR transition", async () => {
			await manager.transition({ type: "FETCH_ITEMS" })
			await manager.transition({ type: "FETCH_ERROR" })

			const state = manager.getState()
			expect(state.isFetching).toBe(false)
		})
	})

	describe("Race Conditions", () => {
		beforeEach(() => {
			jest.useFakeTimers()
		})

		afterEach(() => {
			jest.useRealTimers()
		})

		it("should handle rapid tab switching during initial load", async () => {
			// Start initial load
			await manager.transition({ type: "FETCH_ITEMS" })

			// Quickly switch to sources tab
			await manager.transition({
				type: "SET_ACTIVE_TAB",
				payload: { tab: "sources" },
			})

			// Switch back to browse before load completes
			await manager.transition({
				type: "SET_ACTIVE_TAB",
				payload: { tab: "browse" },
			})

			// Complete the initial load
			await manager.handleMessage({
				type: "state",
				state: { packageManagerItems: [createTestItem()] },
			})

			const state = manager.getState()
			expect(state.activeTab).toBe("browse")
			expect(state.allItems).toHaveLength(1)
			expect(state.isFetching).toBe(false)
		})

		it("should handle rapid filtering during initial load", async () => {
			// Start initial load
			await manager.transition({ type: "FETCH_ITEMS" })

			// Quickly apply filters
			await manager.transition({
				type: "UPDATE_FILTERS",
				payload: { filters: { type: "mode" } },
			})

			// Complete the initial load
			await manager.handleMessage({
				type: "state",
				state: { packageManagerItems: [createTestItem()] },
			})

			// Fast-forward past debounce time
			jest.advanceTimersByTime(300)

			const state = manager.getState()
			expect(state.filters.type).toBe("mode")
			expect(state.allItems).toHaveLength(1)
			expect(vscode.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "filterPackageManagerItems",
					filters: expect.objectContaining({ type: "mode" }),
				}),
			)
		})

		it("should handle concurrent filter operations", async () => {
			// Reset mock before test
			;(vscode.postMessage as jest.Mock).mockClear()

			// Apply first filter
			await manager.transition({
				type: "UPDATE_FILTERS",
				payload: { filters: { search: "test" } },
			})

			// Wait a bit but not enough to trigger debounce
			jest.advanceTimersByTime(100)

			// Apply second filter
			await manager.transition({
				type: "UPDATE_FILTERS",
				payload: { filters: { type: "mode" } },
			})

			// Wait for debounce to complete
			jest.advanceTimersByTime(300)

			// Should only send one filter message with combined filters
			expect(vscode.postMessage).toHaveBeenCalledTimes(1)
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "filterPackageManagerItems",
				filters: {
					search: "test",
					type: "mode",
					tags: undefined,
				},
			})
		})

		it("should handle rapid source deletions", async () => {
			// Reset mock before test
			;(vscode.postMessage as jest.Mock).mockClear()

			// Create test sources
			const testSources = createTestSources()

			// Set initial sources and wait for state update
			await manager.transition({
				type: "UPDATE_SOURCES",
				payload: { sources: testSources },
			})

			// Delete all sources at once
			await manager.transition({
				type: "UPDATE_SOURCES",
				payload: { sources: [] },
			})

			// Wait for state to settle
			jest.runAllTimers()

			const state = manager.getState()
			expect(state.sources).toEqual([])

			// Should send the final sources state to webview
			expect(vscode.postMessage).toHaveBeenLastCalledWith({
				type: "packageManagerSources",
				sources: [],
			})
		})

		it("should handle rapid source operations during fetch", async () => {
			// Start a fetch
			await manager.transition({ type: "FETCH_ITEMS" })

			// Rapidly update sources while fetch is in progress
			const sources = [{ url: "https://github.com/test/repo1", enabled: true }]

			await manager.transition({
				type: "UPDATE_SOURCES",
				payload: { sources },
			})

			// Complete the fetch
			await manager.handleMessage({
				type: "state",
				state: { packageManagerItems: [createTestItem()] },
			})

			const state = manager.getState()
			expect(state.sources).toEqual(sources)
			expect(state.allItems).toHaveLength(1)
			expect(state.isFetching).toBe(false)
		})
	})

	describe("Error Handling", () => {
		beforeEach(() => {
			jest.useFakeTimers()
		})

		afterEach(() => {
			jest.useRealTimers()
		})

		it("should handle fetch timeout", async () => {
			await manager.transition({ type: "FETCH_ITEMS" })

			// Fast-forward past the timeout
			jest.advanceTimersByTime(30000)

			const state = manager.getState()
			expect(state.isFetching).toBe(false)
		})

		it("should handle invalid message types gracefully", () => {
			manager.handleMessage({ type: "invalidType" })
			const state = manager.getState()
			expect(state.isFetching).toBe(false)
			expect(state.allItems).toEqual([])
		})

		it("should handle invalid state message format", () => {
			manager.handleMessage({ type: "state", state: {} })
			const state = manager.getState()
			expect(state.allItems).toEqual([])
		})

		it("should handle invalid transition payloads", async () => {
			// @ts-ignore - Testing invalid payload
			await manager.transition({ type: "UPDATE_FILTERS", payload: { invalid: true } })
			const state = manager.getState()
			expect(state.filters).toEqual({
				type: "",
				search: "",
				tags: [],
			})
		})
	})

	describe("Filter Behavior", () => {
		beforeEach(() => {
			jest.useFakeTimers()
		})

		afterEach(() => {
			jest.useRealTimers()
		})

		it("should debounce filter updates", async () => {
			// Reset mock before test
			;(vscode.postMessage as jest.Mock).mockClear()

			// Apply first filter
			await manager.transition({
				type: "UPDATE_FILTERS",
				payload: { filters: { search: "test1" } },
			})

			// Wait a bit but not enough to trigger debounce
			jest.advanceTimersByTime(100)

			// Apply second filter
			await manager.transition({
				type: "UPDATE_FILTERS",
				payload: { filters: { search: "test2" } },
			})

			// Wait a bit but not enough to trigger debounce
			jest.advanceTimersByTime(100)

			// Apply third filter
			await manager.transition({
				type: "UPDATE_FILTERS",
				payload: { filters: { search: "test3" } },
			})

			// Wait for debounce to complete
			jest.advanceTimersByTime(300)

			// Should only send the last update
			expect(vscode.postMessage).toHaveBeenCalledTimes(1)
			expect(vscode.postMessage).toHaveBeenLastCalledWith({
				type: "filterPackageManagerItems",
				filters: {
					type: undefined,
					search: "test3",
					tags: undefined,
				},
			})
		})

		it("should not send filter message if no filters are active", async () => {
			await manager.transition({
				type: "UPDATE_FILTERS",
				payload: {
					filters: {
						type: "",
						search: "",
						tags: [],
					},
				},
			})

			// Fast-forward past debounce time
			jest.advanceTimersByTime(300)

			// Should not send filter message
			expect(vscode.postMessage).not.toHaveBeenCalledWith(
				expect.objectContaining({
					type: "filterPackageManagerItems",
				}),
			)
		})
	})

	describe("Message Handling", () => {
		it("should handle repository refresh completion", () => {
			const url = "https://example.com/repo"

			// First add URL to refreshing list
			manager.transition({
				type: "REFRESH_SOURCE",
				payload: { url },
			})

			// Then handle completion message
			manager.handleMessage({
				type: "repositoryRefreshComplete",
				url,
			})

			const state = manager.getState()
			expect(state.refreshingUrls).not.toContain(url)
		})

		it("should handle package manager button click with error", () => {
			manager.handleMessage({
				type: "packageManagerButtonClicked",
				text: "error",
			})

			const state = manager.getState()
			expect(state.isFetching).toBe(false)
		})

		it("should handle package manager button click for refresh", () => {
			manager.handleMessage({
				type: "packageManagerButtonClicked",
			})

			const state = manager.getState()
			expect(state.isFetching).toBe(true)
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "fetchPackageManagerItems",
				bool: true,
			})
		})
	})

	describe("Tab Management", () => {
		it("should handle SET_ACTIVE_TAB transition", async () => {
			await manager.transition({
				type: "SET_ACTIVE_TAB",
				payload: { tab: "sources" },
			})

			const state = manager.getState()
			expect(state.activeTab).toBe("sources")
		})

		it("should trigger fetch when switching to browse tab", async () => {
			await manager.transition({
				type: "SET_ACTIVE_TAB",
				payload: { tab: "browse" },
			})

			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "fetchPackageManagerItems",
				bool: true,
			})
		})

		it("should not trigger fetch when switching to sources tab", async () => {
			await manager.transition({
				type: "SET_ACTIVE_TAB",
				payload: { tab: "sources" },
			})

			expect(vscode.postMessage).not.toHaveBeenCalledWith({
				type: "fetchPackageManagerItems",
				bool: true,
			})
		})
	})

	describe("Fetch Timeout Handling", () => {
		beforeEach(() => {
			jest.useFakeTimers()
		})

		afterEach(() => {
			jest.useRealTimers()
		})

		it("should handle fetch timeout", async () => {
			await manager.transition({ type: "FETCH_ITEMS" })

			// Fast-forward past the timeout
			jest.advanceTimersByTime(30000)

			const state = manager.getState()
			expect(state.isFetching).toBe(false)
		})

		it("should clear timeout on successful fetch", async () => {
			await manager.transition({ type: "FETCH_ITEMS" })

			// Complete fetch before timeout
			await manager.transition({
				type: "FETCH_COMPLETE",
				payload: { items: [createTestItem()] },
			})

			// Fast-forward past the timeout
			jest.advanceTimersByTime(30000)

			// State should still reflect successful fetch
			const state = manager.getState()
			expect(state.isFetching).toBe(false)
			expect(state.allItems).toHaveLength(1)
		})

		it("should prevent concurrent fetches during timeout period", async () => {
			// Start first fetch
			await manager.transition({ type: "FETCH_ITEMS" })

			// Attempt second fetch before timeout
			jest.advanceTimersByTime(15000)
			await manager.transition({ type: "FETCH_ITEMS" })

			// postMessage should only be called once
			expect(vscode.postMessage).toHaveBeenCalledTimes(1)
		})
	})

	// Filter behavior tests are already covered in the previous describe block

	describe("Source Management", () => {
		it("should handle UPDATE_SOURCES transition", async () => {
			const sources = [
				{ url: "https://github.com/test/repo", enabled: true },
				{ url: "https://github.com/test/repo2", enabled: false },
			]

			await manager.transition({
				type: "UPDATE_SOURCES",
				payload: { sources },
			})

			const state = manager.getState()
			expect(state.sources).toEqual(sources)
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "packageManagerSources",
				sources,
			})
		})

		it("should handle REFRESH_SOURCE transition", async () => {
			const url = "https://github.com/test/repo"

			await manager.transition({
				type: "REFRESH_SOURCE",
				payload: { url },
			})

			const state = manager.getState()
			expect(state.refreshingUrls).toContain(url)
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "refreshPackageManagerSource",
				url,
			})
		})

		it("should handle REFRESH_SOURCE_COMPLETE transition", async () => {
			const url = "https://github.com/test/repo"

			// First add URL to refreshing list
			await manager.transition({
				type: "REFRESH_SOURCE",
				payload: { url },
			})

			// Then complete the refresh
			await manager.transition({
				type: "REFRESH_SOURCE_COMPLETE",
				payload: { url },
			})

			const state = manager.getState()
			expect(state.refreshingUrls).not.toContain(url)
		})
	})

	describe("Filter Transitions", () => {
		it("should handle UPDATE_FILTERS transition", async () => {
			const filters = {
				type: "mode",
				search: "test",
				tags: ["tag1"],
			}

			await manager.transition({
				type: "UPDATE_FILTERS",
				payload: { filters },
			})

			const state = manager.getState()
			expect(state.filters).toEqual(filters)

			// Wait for debounce
			await new Promise((resolve) => setTimeout(resolve, 300))

			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "filterPackageManagerItems",
				filters: {
					type: "mode",
					search: "test",
					tags: ["tag1"],
				},
			})
		})
	})

	describe("Sort Transitions", () => {
		it("should handle UPDATE_SORT transition", async () => {
			const sortConfig = {
				by: "lastUpdated" as const,
				order: "desc" as const,
			}

			await manager.transition({
				type: "UPDATE_SORT",
				payload: { sortConfig },
			})

			const state = manager.getState()
			expect(state.sortConfig).toEqual(sortConfig)
		})
	})

	describe("Message Handling", () => {
		it("should handle state message with package manager items", () => {
			const testItems = [createTestItem()]

			// We need to use any here since we're testing the raw message handling
			manager.handleMessage({
				type: "state",
				state: { packageManagerItems: testItems },
			} as any)

			const state = manager.getState()
			expect(state.allItems).toEqual(testItems)
		})

		it("should handle repositoryRefreshComplete message", () => {
			const url = "https://example.com/repo"

			// First add URL to refreshing list
			manager.transition({
				type: "REFRESH_SOURCE",
				payload: { url },
			})

			// Then handle completion message
			manager.handleMessage({
				type: "repositoryRefreshComplete",
				url,
			})

			const state = manager.getState()
			expect(state.refreshingUrls).not.toContain(url)
		})

		it("should handle packageManagerButtonClicked message with error", () => {
			manager.handleMessage({
				type: "packageManagerButtonClicked",
				text: "error",
			})

			const state = manager.getState()
			expect(state.isFetching).toBe(false)
		})

		it("should handle packageManagerButtonClicked message for refresh", () => {
			manager.handleMessage({
				type: "packageManagerButtonClicked",
			})

			const state = manager.getState()
			expect(state.isFetching).toBe(true)
		})
	})
})
