import { PackageManagerItem } from "../../../../src/services/package-manager/types"

interface Filters {
	type: string
	search: string
	tags: string[]
}

interface SortConfig {
	by: string
	order: "asc" | "desc"
}

export const isFilterActive = (filters: Filters): boolean => {
	return !!(filters.type || filters.search || filters.tags.length > 0)
}

export const filterItems = (items: PackageManagerItem[], filters: Filters): PackageManagerItem[] => {
	if (!isFilterActive(filters)) {
		return items
	}

	return items.filter((item) => {
		// Type filter
		if (filters.type && item.type !== filters.type) {
			return false
		}

		// Search filter
		if (filters.search) {
			const searchTerm = filters.search.toLowerCase()

			// Check if the main item matches
			const mainItemMatches =
				item.name.toLowerCase().includes(searchTerm) ||
				(item.description || "").toLowerCase().includes(searchTerm) ||
				(item.author || "").toLowerCase().includes(searchTerm)

			// Check if any subcomponents match
			const subcomponentMatches =
				item.items?.some(
					(subItem) =>
						(subItem.metadata?.name || "").toLowerCase().includes(searchTerm) ||
						(subItem.metadata?.description || "").toLowerCase().includes(searchTerm),
				) || false

			// Return false if neither the main item nor any subcomponents match
			if (!mainItemMatches && !subcomponentMatches) {
				return false
			}
		}

		// Tags filter
		if (filters.tags.length > 0) {
			const hasMatchingTag = item.tags?.some((tag) => filters.tags.includes(tag))
			if (!hasMatchingTag) {
				return false
			}
		}

		return true
	})
}

export const sortItems = (items: PackageManagerItem[], config: SortConfig): PackageManagerItem[] => {
	return [...items].sort((a, b) => {
		let comparison = 0

		switch (config.by) {
			case "name":
				comparison = a.name.localeCompare(b.name)
				break
			case "author":
				comparison = (a.author || "").localeCompare(b.author || "")
				break
			case "lastUpdated":
				comparison = (a.lastUpdated || "").localeCompare(b.lastUpdated || "")
				break
			default:
				comparison = a.name.localeCompare(b.name)
		}

		return config.order === "asc" ? comparison : -comparison
	})
}

export const getDisplayedItems = (
	items: PackageManagerItem[],
	filters: Filters,
	sortConfig: SortConfig,
): PackageManagerItem[] => {
	const filteredItems = filterItems(items, filters)
	return sortItems(filteredItems, sortConfig)
}
