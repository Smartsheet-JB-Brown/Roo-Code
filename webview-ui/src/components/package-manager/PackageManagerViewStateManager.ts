import { PackageManagerItem, PackageManagerSource } from "../../../../src/services/package-manager/types"
import { vscode } from "../../utils/vscode"
import { WebviewMessage } from "../../../../src/shared/WebviewMessage"
import { DEFAULT_PACKAGE_MANAGER_SOURCE } from "../../../../src/services/package-manager/constants"

export interface ViewState {
	allItems: PackageManagerItem[]
	displayItems?: PackageManagerItem[] // Items currently being displayed (filtered or all)
	isFetching: boolean
	activeTab: "browse" | "sources"
	refreshingUrls: string[]
	sources: PackageManagerSource[]
	filters: {
		type: string
		search: string
		tags: string[]
	}
	sortConfig: {
		by: "name" | "author" | "lastUpdated"
		order: "asc" | "desc"
	}
}

type TransitionPayloads = {
	FETCH_ITEMS: undefined
	FETCH_COMPLETE: { items: PackageManagerItem[] }
	FETCH_ERROR: undefined
	SET_ACTIVE_TAB: { tab: ViewState["activeTab"] }
	UPDATE_FILTERS: { filters: Partial<ViewState["filters"]> }
	UPDATE_SORT: { sortConfig: Partial<ViewState["sortConfig"]> }
	REFRESH_SOURCE: { url: string }
	REFRESH_SOURCE_COMPLETE: { url: string }
	UPDATE_SOURCES: { sources: PackageManagerSource[] }
}

export interface ViewStateTransition {
	type: keyof TransitionPayloads
	payload?: TransitionPayloads[keyof TransitionPayloads]
}

export type StateChangeHandler = (state: ViewState) => void

export class PackageManagerViewStateManager {
	private state: ViewState
	private fetchTimeoutId?: NodeJS.Timeout
	private readonly FETCH_TIMEOUT = 30000 // 30 seconds
	private stateChangeHandlers: Set<StateChangeHandler> = new Set()
	private sourcesModified = false // Track if sources have been modified

	constructor() {
		this.state = {
			allItems: [],
			displayItems: [] as PackageManagerItem[],
			isFetching: false,
			activeTab: "browse",
			refreshingUrls: [],
			sources: [DEFAULT_PACKAGE_MANAGER_SOURCE],
			filters: {
				type: "",
				search: "",
				tags: [],
			},
			sortConfig: {
				by: "name",
				order: "asc",
			},
		}
	}

	public initialize(): void {
		// Send initial sources to extension
		vscode.postMessage({
			type: "packageManagerSources",
			sources: [DEFAULT_PACKAGE_MANAGER_SOURCE],
		} as WebviewMessage)
	}

	public onStateChange(handler: StateChangeHandler): () => void {
		this.stateChangeHandlers.add(handler)
		return () => this.stateChangeHandlers.delete(handler)
	}

	public cleanup(): void {
		this.stateChangeHandlers.clear()
		if (this.fetchTimeoutId) clearTimeout(this.fetchTimeoutId)
	}

	public getState(): ViewState {
		console.log("getState called, returning:", this.state)
		// Create a deep copy to ensure React sees changes
		return JSON.parse(JSON.stringify(this.state))
	}

	private notifyStateChange(): void {
		console.log("=== State Change Notification ===")
		console.log("Current state:", {
			allItems: this.state.allItems,
			displayItems: this.state.displayItems,
			itemsLength: this.state.allItems.length,
			displayItemsLength: this.state.displayItems?.length,
			isFetching: this.state.isFetching,
			activeTab: this.state.activeTab,
			filters: this.state.filters,
		})

		// Create a deep copy to ensure React sees changes
		const newState = JSON.parse(JSON.stringify(this.state))

		console.log("Notifying handlers with state:", {
			allItems: newState.allItems,
			displayItems: newState.displayItems,
			itemsLength: newState.allItems.length,
			displayItemsLength: newState.displayItems?.length,
			isFetching: newState.isFetching,
			activeTab: newState.activeTab,
			filters: newState.filters,
		})

		this.stateChangeHandlers.forEach((handler) => {
			console.log("Calling state change handler")
			handler(newState)
		})

		console.log("=== End State Change Notification ===")
	}

	public async transition(transition: ViewStateTransition): Promise<void> {
		console.log(`ViewStateManager: Processing transition ${transition.type}`)

		switch (transition.type) {
			case "FETCH_ITEMS": {
				if (this.state.isFetching) {
					console.log("ViewStateManager: Fetch already in progress, skipping")
					return
				}

				console.log("=== Starting Fetch ===")
				console.log("Before setting isFetching:", {
					isFetching: this.state.isFetching,
					allItems: this.state.allItems.length,
				})

				// Create a new state object to ensure React sees the change
				const newState = {
					...this.state,
					isFetching: true,
				}

				// Clear any existing timeout before starting new fetch
				this.clearFetchTimeout()

				// Update state and notify before starting fetch
				this.state = newState
				this.notifyStateChange()

				// Set timeout for fetch operation
				this.fetchTimeoutId = setTimeout(() => {
					void this.transition({ type: "FETCH_ERROR" })
				}, this.FETCH_TIMEOUT)

				// Request items from extension
				vscode.postMessage({
					type: "fetchPackageManagerItems",
					bool: true,
				} as WebviewMessage)

				console.log("=== Fetch Started ===")
				break
			}

			case "FETCH_COMPLETE": {
				const { items } = transition.payload as TransitionPayloads["FETCH_COMPLETE"]
				console.log("=== FETCH_COMPLETE Started ===")
				console.log("Before state update:", {
					isFetching: this.state.isFetching,
					currentItems: this.state.allItems.length,
					receivedItems: items.length,
				})

				// Clear any existing timeout
				this.clearFetchTimeout()

				// Create a new state object with sorted items
				const sortedItems = this.sortItems([...items])
				const newState = {
					...this.state,
					isFetching: false,
					displayItems: sortedItems, // Use items directly from backend
				}

				// Only update allItems if this isn't a filter response
				if (!this.isFilterActive()) {
					newState.allItems = sortedItems
				}

				// Update state and notify
				this.state = newState

				console.log("After state update:", {
					isFetching: this.state.isFetching,
					allItems: this.state.allItems.length,
					firstItem: this.state.allItems[0],
				})

				this.notifyStateChange()
				console.log("=== FETCH_COMPLETE Finished ===")
				break
			}

			case "FETCH_ERROR": {
				this.clearFetchTimeout()

				// Create a new state object to ensure React sees the change
				this.state = {
					...this.state,
					isFetching: false,
				}

				this.notifyStateChange()
				break
			}

			case "SET_ACTIVE_TAB": {
				const { tab } = transition.payload as TransitionPayloads["SET_ACTIVE_TAB"]

				// Create a new state object
				const newState = {
					...this.state,
					activeTab: tab,
				}

				// Add default source when switching to sources tab if no sources exist
				if (tab === "sources" && newState.sources.length === 0) {
					newState.sources = [DEFAULT_PACKAGE_MANAGER_SOURCE]
					vscode.postMessage({
						type: "packageManagerSources",
						sources: [DEFAULT_PACKAGE_MANAGER_SOURCE],
					} as WebviewMessage)
				}

				// Update state and notify
				this.state = newState
				this.notifyStateChange()

				// Handle browse tab switch
				if (tab === "browse") {
					// Clear any existing timeouts
					this.clearFetchTimeout()

					// Always fetch when switching to browse if sources were modified
					if (this.sourcesModified) {
						this.sourcesModified = false // Reset the flag
						void this.transition({ type: "FETCH_ITEMS" })
					} else if (this.state.allItems.length === 0) {
						// Only fetch if we don't have any items yet
						void this.transition({ type: "FETCH_ITEMS" })
					}
				}
				break
			}

			case "UPDATE_FILTERS": {
				const { filters = {} } = (transition.payload as TransitionPayloads["UPDATE_FILTERS"]) || {}
				console.log("=== UPDATE_FILTERS Started ===", {
					currentFilters: this.state.filters,
					newFilters: filters,
				})

				// Create new filters object, preserving existing filters unless explicitly changed
				const updatedFilters = {
					type: filters.type ?? this.state.filters.type,
					search: filters.search ?? this.state.filters.search,
					tags: filters.tags ?? this.state.filters.tags,
				}

				// Update state with new filters
				this.state = {
					...this.state,
					filters: updatedFilters,
				}
				this.notifyStateChange()

				// Send filter request immediately
				vscode.postMessage({
					type: "filterPackageManagerItems",
					filters: updatedFilters,
				} as WebviewMessage)

				console.log("=== UPDATE_FILTERS Finished ===")
				break
			}

			case "UPDATE_SORT": {
				const { sortConfig } = transition.payload as TransitionPayloads["UPDATE_SORT"]
				this.state.sortConfig = {
					...this.state.sortConfig,
					...sortConfig,
				}
				// Apply sorting to both allItems and displayItems
				this.state.allItems = this.sortItems(this.state.allItems)
				if (this.state.displayItems) {
					this.state.displayItems = this.sortItems(this.state.displayItems)
				}
				this.notifyStateChange()
				break
			}

			case "REFRESH_SOURCE": {
				const { url } = transition.payload as TransitionPayloads["REFRESH_SOURCE"]
				if (!this.state.refreshingUrls.includes(url)) {
					this.state.refreshingUrls = [...this.state.refreshingUrls, url]
					this.notifyStateChange()
					vscode.postMessage({
						type: "refreshPackageManagerSource",
						url,
					} as WebviewMessage)
				}
				break
			}

			case "REFRESH_SOURCE_COMPLETE": {
				const { url } = transition.payload as TransitionPayloads["REFRESH_SOURCE_COMPLETE"]
				this.state.refreshingUrls = this.state.refreshingUrls.filter((existingUrl) => existingUrl !== url)
				this.notifyStateChange()
				break
			}

			case "UPDATE_SOURCES": {
				const { sources } = transition.payload as TransitionPayloads["UPDATE_SOURCES"]
				// If all sources are removed, add the default source
				const updatedSources = sources.length === 0 ? [DEFAULT_PACKAGE_MANAGER_SOURCE] : sources
				this.state.sources = updatedSources
				this.sourcesModified = true // Set the flag when sources are modified

				// Reset fetching state first
				this.state.isFetching = false
				this.notifyStateChange()

				// Send sources update to extension
				vscode.postMessage({
					type: "packageManagerSources",
					sources: updatedSources,
				} as WebviewMessage)

				// Only start fetching if we have sources
				if (updatedSources.length > 0) {
					// Set fetching state and notify
					this.state.isFetching = true
					this.notifyStateChange()

					// Send fetch request
					vscode.postMessage({
						type: "fetchPackageManagerItems",
						bool: true,
					} as WebviewMessage)
				}
				break
			}
		}
	}

	private clearFetchTimeout(): void {
		// Clear fetch timeout
		if (this.fetchTimeoutId) {
			clearTimeout(this.fetchTimeoutId)
			this.fetchTimeoutId = undefined
		}
	}

	public isFilterActive(): boolean {
		return !!(this.state.filters.type || this.state.filters.search || this.state.filters.tags.length > 0)
	}

	public filterItems(items: PackageManagerItem[]): PackageManagerItem[] {
		const { type, search, tags } = this.state.filters

		return items.filter((item) => {
			// Check if the item itself matches all filters
			const mainItemMatches =
				(!type || item.type === type) &&
				(!search ||
					item.name.toLowerCase().includes(search.toLowerCase()) ||
					(item.description || "").toLowerCase().includes(search.toLowerCase()) ||
					(item.author || "").toLowerCase().includes(search.toLowerCase())) &&
				(!tags.length || item.tags?.some((tag) => tags.includes(tag)))

			if (mainItemMatches) return true

			// For packages, check if any subcomponent matches all filters
			if (item.type === "package" && item.items?.length) {
				return item.items.some(
					(subItem) =>
						(!type || subItem.type === type) &&
						(!search ||
							(subItem.metadata &&
								(subItem.metadata.name.toLowerCase().includes(search.toLowerCase()) ||
									subItem.metadata.description.toLowerCase().includes(search.toLowerCase())))) &&
						(!tags.length || subItem.metadata?.tags?.some((tag) => tags.includes(tag))),
				)
			}

			return false
		})
	}

	private sortItems(items: PackageManagerItem[]): PackageManagerItem[] {
		const { by, order } = this.state.sortConfig
		return [...items].sort((a, b) => {
			let aValue = a[by] || ""
			let bValue = b[by] || ""

			// Handle dates for lastUpdated
			if (by === "lastUpdated") {
				aValue = aValue || "1970-01-01T00:00:00Z"
				bValue = bValue || "1970-01-01T00:00:00Z"
			}

			const comparison = aValue.localeCompare(bValue)
			return order === "asc" ? comparison : -comparison
		})
	}

	public async handleMessage(message: any): Promise<void> {
		console.log("=== Handling Message ===", {
			messageType: message.type,
			hasPackageManagerItems: !!message.state?.packageManagerItems,
			itemsLength: message.state?.packageManagerItems?.length,
			currentState: {
				isFetching: this.state.isFetching,
				itemCount: this.state.allItems.length,
			},
		})

		// Handle state updates from extension
		if (message.type === "state") {
			console.log("Processing state update:", {
				isFetching: message.state?.isFetching,
				itemCount: message.state?.packageManagerItems?.length,
				firstItem: message.state?.packageManagerItems?.[0],
				sources: message.state?.sources,
				currentState: {
					isFetching: this.state.isFetching,
					itemCount: this.state.allItems.length,
					sources: this.state.sources,
				},
			})

			// Update sources from either sources or packageManagerSources in state
			if (message.state?.sources || message.state?.packageManagerSources) {
				const sources = message.state.packageManagerSources || message.state.sources
				this.state.sources = sources?.length > 0 ? sources : [DEFAULT_PACKAGE_MANAGER_SOURCE]
				this.notifyStateChange()
			}

			if (message.state?.packageManagerItems) {
				console.log("State includes items, transitioning to FETCH_COMPLETE")
				void this.transition({
					type: "FETCH_COMPLETE",
					payload: { items: message.state.packageManagerItems },
				})
			}
		}

		// Handle repository refresh completion
		if (message.type === "repositoryRefreshComplete" && message.url) {
			void this.transition({
				type: "REFRESH_SOURCE_COMPLETE",
				payload: { url: message.url },
			})
		}

		// Handle package manager button clicks
		if (message.type === "packageManagerButtonClicked") {
			if (message.text) {
				// Error case
				void this.transition({ type: "FETCH_ERROR" })
			} else {
				// Refresh request
				void this.transition({ type: "FETCH_ITEMS" })
			}
		}
	}
}
