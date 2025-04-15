import { PackageManagerItem, PackageManagerSource } from "../../../../src/services/package-manager/types"
import { vscode } from "../../utils/vscode"
import { WebviewMessage } from "../../../../src/shared/WebviewMessage"
import { DEFAULT_PACKAGE_MANAGER_SOURCE } from "../../../../src/services/package-manager/constants"

export interface ViewState {
	allItems: PackageManagerItem[]
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
	private filterTimeoutId?: NodeJS.Timeout
	private readonly FETCH_TIMEOUT = 30000 // 30 seconds
	private readonly FILTER_DEBOUNCE = 300 // 300 milliseconds
	private stateChangeHandlers: Set<StateChangeHandler> = new Set()
	private sourcesModified = false // Track if sources have been modified

	constructor() {
		this.state = {
			allItems: [],
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
		if (this.filterTimeoutId) clearTimeout(this.filterTimeoutId)
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
			itemsLength: this.state.allItems.length,
			isFetching: this.state.isFetching,
			activeTab: this.state.activeTab,
		})

		// Create a deep copy to ensure React sees changes
		const newState = JSON.parse(JSON.stringify(this.state))

		console.log("Notifying handlers with state:", {
			allItems: newState.allItems,
			itemsLength: newState.allItems.length,
			isFetching: newState.isFetching,
			activeTab: newState.activeTab,
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
				this.state = {
					...this.state,
					isFetching: true,
				}

				console.log("After setting isFetching:", {
					isFetching: this.state.isFetching,
					allItems: this.state.allItems.length,
				})

				this.clearFetchTimeout()
				this.notifyStateChange()

				this.fetchTimeoutId = setTimeout(() => {
					void this.transition({ type: "FETCH_ERROR" })
				}, this.FETCH_TIMEOUT)

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

				this.clearFetchTimeout()

				// Create a new state object to ensure React sees the change
				this.state = {
					...this.state,
					isFetching: false,
					allItems: [...items],
				}

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
				this.state.isFetching = false
				this.notifyStateChange()
				break
			}

			case "SET_ACTIVE_TAB": {
				const { tab } = transition.payload as TransitionPayloads["SET_ACTIVE_TAB"]
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
				if (tab === "browse") {
					// Always fetch when switching to browse if sources were modified
					if (this.sourcesModified) {
						this.sourcesModified = false // Reset the flag
						void this.transition({ type: "FETCH_ITEMS" })
					} else {
						// Only fetch if we don't have any items yet
						if (this.state.allItems.length === 0) {
							void this.transition({ type: "FETCH_ITEMS" })
						}
					}
				}
				break
			}

			case "UPDATE_FILTERS": {
				const { filters } = transition.payload as TransitionPayloads["UPDATE_FILTERS"]
				console.log("=== UPDATE_FILTERS Started ===", {
					currentFilters: this.state.filters,
					newFilters: filters,
				})

				this.state.filters = {
					...this.state.filters,
					...filters,
				}
				this.notifyStateChange()

				const isActive = this.isFilterActive()
				console.log("Filter state:", {
					filters: this.state.filters,
					isActive,
					hasTimeout: !!this.filterTimeoutId,
				})

				if (isActive) {
					// Always use debounce
					if (this.filterTimeoutId) {
						console.log("Clearing existing filter timeout")
						clearTimeout(this.filterTimeoutId)
					}

					console.log("Setting up new filter timeout")
					this.filterTimeoutId = setTimeout(() => {
						console.log("Filter timeout executed, sending message")
						vscode.postMessage({
							type: "filterPackageManagerItems",
							filters: {
								type: this.state.filters.type || undefined,
								search: this.state.filters.search || undefined,
								tags: this.state.filters.tags.length > 0 ? this.state.filters.tags : undefined,
							},
						} as WebviewMessage)
						this.filterTimeoutId = undefined
					}, this.FILTER_DEBOUNCE)
				}
				console.log("=== UPDATE_FILTERS Finished ===")
				break
			}

			case "UPDATE_SORT": {
				const { sortConfig } = transition.payload as TransitionPayloads["UPDATE_SORT"]
				this.state.sortConfig = {
					...this.state.sortConfig,
					...sortConfig,
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
				this.state.isFetching = false // Reset fetching state when sources change
				this.notifyStateChange()

				// Send sources update to extension
				vscode.postMessage({
					type: "packageManagerSources",
					sources: updatedSources,
				} as WebviewMessage)

				// Schedule fetch for next tick to ensure sources message is sent first
				if (this.state.activeTab === "browse") {
					setTimeout(() => {
						void this.transition({ type: "FETCH_ITEMS" })
					}, 0)
				}
				break
			}
		}
	}

	private clearFetchTimeout(): void {
		if (this.fetchTimeoutId) {
			clearTimeout(this.fetchTimeoutId)
			this.fetchTimeoutId = undefined
		}
	}

	private isFilterActive(): boolean {
		return !!(this.state.filters.type || this.state.filters.search || this.state.filters.tags.length > 0)
	}

	public handleMessage(message: any): void {
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

			if (message.state?.isFetching) {
				console.log("State indicates fetching, transitioning to FETCH_ITEMS")
				void this.transition({
					type: "FETCH_ITEMS",
				})
			} else if (message.state?.packageManagerItems) {
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
