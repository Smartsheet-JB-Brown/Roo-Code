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
		// Only create new arrays if they exist and have items
		const displayItems = this.state.displayItems?.length ? [...this.state.displayItems] : this.state.displayItems
		const refreshingUrls = this.state.refreshingUrls.length ? [...this.state.refreshingUrls] : []
		const tags = this.state.filters.tags.length ? [...this.state.filters.tags] : []

		// Create minimal new state object
		return {
			...this.state,
			allItems: this.state.allItems.length ? [...this.state.allItems] : [],
			displayItems,
			refreshingUrls,
			sources: this.state.sources.length ? [...this.state.sources] : [DEFAULT_PACKAGE_MANAGER_SOURCE],
			filters: {
				...this.state.filters,
				tags,
			},
		}
	}

	private notifyStateChange(): void {
		const newState = this.getState() // Use getState to ensure proper copying
		this.stateChangeHandlers.forEach((handler) => {
			handler(newState)
		})
	}

	public async transition(transition: ViewStateTransition): Promise<void> {
		switch (transition.type) {
			case "FETCH_ITEMS": {
				if (this.state.isFetching) {
					return
				}

				// Clear any existing timeout before starting new fetch
				this.clearFetchTimeout()

				// Update state directly
				this.state.isFetching = true
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

				break
			}

			case "FETCH_COMPLETE": {
				const { items } = transition.payload as TransitionPayloads["FETCH_COMPLETE"]
				// Clear any existing timeout
				this.clearFetchTimeout()

				// Create a new state object with sorted items
				// Sort items in place to avoid creating unnecessary copies
				const sortedItems = this.sortItems(items)

				// Minimize state updates
				if (this.isFilterActive()) {
					this.state.displayItems = sortedItems
					this.state.isFetching = false
				} else {
					this.state.allItems = sortedItems
					this.state.displayItems = sortedItems
					this.state.isFetching = false
				}

				// Notify state change
				this.notifyStateChange()
				break
			}

			case "FETCH_ERROR": {
				this.clearFetchTimeout()

				// Update state directly
				this.state.isFetching = false
				this.notifyStateChange()
				break
			}

			case "SET_ACTIVE_TAB": {
				const { tab } = transition.payload as TransitionPayloads["SET_ACTIVE_TAB"]

				// Update state directly
				this.state.activeTab = tab

				// Add default source when switching to sources tab if no sources exist
				if (tab === "sources" && this.state.sources.length === 0) {
					this.state.sources = [DEFAULT_PACKAGE_MANAGER_SOURCE]
					vscode.postMessage({
						type: "packageManagerSources",
						sources: [DEFAULT_PACKAGE_MANAGER_SOURCE],
					} as WebviewMessage)
				}

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

				break
			}

			case "UPDATE_SORT": {
				const { sortConfig } = transition.payload as TransitionPayloads["UPDATE_SORT"]
				// Create new state with updated sort config
				this.state = {
					...this.state,
					sortConfig: {
						...this.state.sortConfig,
						...sortConfig,
					},
				}
				// Apply sorting to both allItems and displayItems
				// Sort items immutably
				// Sort arrays in place
				if (this.state.allItems.length) {
					this.sortItems(this.state.allItems)
				}
				if (this.state.displayItems?.length) {
					this.sortItems(this.state.displayItems)
				}
				this.notifyStateChange()
				break
			}

			case "REFRESH_SOURCE": {
				const { url } = transition.payload as TransitionPayloads["REFRESH_SOURCE"]
				if (!this.state.refreshingUrls.includes(url)) {
					this.state = {
						...this.state,
						refreshingUrls: [...this.state.refreshingUrls, url],
					}
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
				this.state = {
					...this.state,
					refreshingUrls: this.state.refreshingUrls.filter((existingUrl) => existingUrl !== url),
				}
				this.notifyStateChange()
				break
			}

			case "UPDATE_SOURCES": {
				const { sources } = transition.payload as TransitionPayloads["UPDATE_SOURCES"]
				// If all sources are removed, add the default source
				const updatedSources = sources.length === 0 ? [DEFAULT_PACKAGE_MANAGER_SOURCE] : [...sources]
				this.state = {
					...this.state,
					sources: updatedSources,
					isFetching: false, // Reset fetching state first
				}
				this.sourcesModified = true // Set the flag when sources are modified

				this.notifyStateChange()

				// Send sources update to extension
				vscode.postMessage({
					type: "packageManagerSources",
					sources: updatedSources,
				} as WebviewMessage)

				// Only start fetching if we have sources
				if (updatedSources.length > 0) {
					// Set fetching state and notify
					this.state = {
						...this.state,
						isFetching: true,
					}
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

		// Sort array in place
		items.sort((a, b) => {
			const aValue = by === "lastUpdated" ? a[by] || "1970-01-01T00:00:00Z" : a[by] || ""
			const bValue = by === "lastUpdated" ? b[by] || "1970-01-01T00:00:00Z" : b[by] || ""

			return order === "asc" ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
		})

		return items
	}

	public async handleMessage(message: any): Promise<void> {
		// Handle state updates from extension
		if (message.type === "state") {
			// Update sources from either sources or packageManagerSources in state
			if (message.state?.sources || message.state?.packageManagerSources) {
				const sources = message.state.packageManagerSources || message.state.sources
				this.state = {
					...this.state,
					sources: sources?.length > 0 ? [...sources] : [DEFAULT_PACKAGE_MANAGER_SOURCE],
				}
				this.notifyStateChange()
			}

			if (message.state?.packageManagerItems) {
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
