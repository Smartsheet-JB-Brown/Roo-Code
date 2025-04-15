import { useCallback, useReducer } from "react"
import { PackageManagerItem, PackageManagerSource } from "@services/package-manager"
import { PackageManagerViewStateManager } from "./PackageManagerViewStateManager"

interface State {
	allItems: PackageManagerItem[]
	displayItems: PackageManagerItem[]
	isFetching: boolean
	activeTab: "browse" | "sources"
	filters: {
		search: string
		type: string
		tags: string[]
	}
	sortConfig: {
		by: "name" | "lastUpdated"
		order: "asc" | "desc"
	}
	sources: PackageManagerSource[]
	refreshingUrls: string[]
}

type Action =
	| { type: "FETCH_ITEMS" }
	| { type: "SET_ACTIVE_TAB"; payload: { tab: "browse" | "sources" } }
	| { type: "UPDATE_FILTERS"; payload: { filters: Partial<State["filters"]> } }
	| { type: "UPDATE_SORT"; payload: { sortConfig: Partial<State["sortConfig"]> } }
	| { type: "UPDATE_SOURCES"; payload: { sources: PackageManagerSource[] } }
	| { type: "REFRESH_SOURCE"; payload: { url: string } }

const initialState: State = {
	allItems: [],
	displayItems: [],
	isFetching: false,
	activeTab: "browse",
	filters: {
		search: "",
		type: "",
		tags: [],
	},
	sortConfig: {
		by: "name",
		order: "asc",
	},
	sources: [],
	refreshingUrls: [],
}

const stateManager = new PackageManagerViewStateManager()

function reducer(state: State, action: Action): State {
	switch (action.type) {
		case "FETCH_ITEMS":
			return {
				...state,
				isFetching: true,
			}

		case "SET_ACTIVE_TAB":
			return {
				...state,
				activeTab: action.payload.tab,
			}

		case "UPDATE_FILTERS":
			const newFilters = {
				...state.filters,
				...action.payload.filters,
			}
			stateManager.setItems(state.allItems)
			return {
				...state,
				filters: newFilters,
				displayItems: stateManager.getFilteredAndSortedItems(),
			}

		case "UPDATE_SORT":
			const newSortConfig = {
				...state.sortConfig,
				...action.payload.sortConfig,
			}
			stateManager.setSortBy(newSortConfig.by)
			stateManager.setSortOrder(newSortConfig.order)
			stateManager.setItems(state.allItems)
			return {
				...state,
				sortConfig: newSortConfig,
				displayItems: stateManager.getFilteredAndSortedItems(),
			}

		case "UPDATE_SOURCES":
			return {
				...state,
				sources: action.payload.sources,
			}

		case "REFRESH_SOURCE":
			return {
				...state,
				refreshingUrls: [...state.refreshingUrls, action.payload.url],
			}

		default:
			return state
	}
}

export function useStateManager() {
	const [state, dispatch] = useReducer(reducer, initialState)

	const transition = useCallback((action: Action) => {
		dispatch(action)
	}, [])

	return [state, { transition }] as const
}
