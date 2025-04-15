import { ComponentMetadata, PackageManagerItem } from "@services/package-manager"

interface Filters {
	type: string
	search: string
	tags: string[]
}

type Subcomponent = {
	type: string
	path: string
	metadata?: ComponentMetadata
	lastUpdated?: string
}

export class PackageManagerViewStateManager {
	private items: PackageManagerItem[] = []
	private sortBy: "name" | "lastUpdated" = "name"
	private sortOrder: "asc" | "desc" = "asc"
	private filters: Filters = { type: "", search: "", tags: [] }

	setItems(items: PackageManagerItem[]) {
		this.items = items
	}

	setSortBy(sortBy: "name" | "lastUpdated") {
		this.sortBy = sortBy
	}

	setSortOrder(sortOrder: "asc" | "desc") {
		this.sortOrder = sortOrder
	}

	setFilters(filters: Partial<Filters>) {
		this.filters = { ...this.filters, ...filters }
	}

	private isParentItem(item: PackageManagerItem | Subcomponent): item is PackageManagerItem {
		return "name" in item && "description" in item
	}

	private isSubcomponent(item: PackageManagerItem | Subcomponent): item is Subcomponent {
		return "metadata" in item
	}

	private itemMatchesFilters(item: PackageManagerItem | Subcomponent): boolean {
		// Helper function to check if text matches search term
		const matchesSearch = (text: string) => {
			if (!this.filters.search) return true
			return text.toLowerCase().includes(this.filters.search.toLowerCase())
		}

		// Helper function to check if tags match
		const matchesTags = (tags?: string[]) => {
			if (!this.filters.tags.length) return true
			return tags?.some((tag) => this.filters.tags.includes(tag)) ?? false
		}

		// Helper function to check if type matches
		const matchesType = (type: string) => {
			if (!this.filters.type) return true
			return type === this.filters.type
		}

		// For parent items
		if (this.isParentItem(item)) {
			// For packages, check if any subcomponent matches the type filter
			if (this.filters.type && item.type === "package" && item.items?.length) {
				const hasMatchingSubcomponent = item.items.some((subItem) => subItem.type === this.filters.type)
				if (hasMatchingSubcomponent) {
					// If a subcomponent matches the type, only check other filters on the parent
					return (
						(!this.filters.search || matchesSearch(item.name) || matchesSearch(item.description)) &&
						(!this.filters.tags.length || matchesTags(item.tags))
					)
				}
			}

			// For non-packages or if no subcomponent matches, check all filters
			return (
				matchesType(item.type) &&
				(!this.filters.search || matchesSearch(item.name) || matchesSearch(item.description)) &&
				(!this.filters.tags.length || matchesTags(item.tags))
			)
		}

		// For subcomponents
		if (this.isSubcomponent(item)) {
			if (!item.metadata) return false
			return (
				matchesType(item.type) &&
				(!this.filters.search ||
					matchesSearch(item.metadata.name) ||
					matchesSearch(item.metadata.description)) &&
				(!this.filters.tags.length || matchesTags(item.metadata.tags))
			)
		}

		return false
	}

	getFilteredAndSortedItems(): PackageManagerItem[] {
		return [...this.items]
			.filter((item) => this.itemMatchesFilters(item))
			.sort((a, b) => {
				const aValue = this.sortBy === "name" ? a.name : a.lastUpdated || ""
				const bValue = this.sortBy === "name" ? b.name : b.lastUpdated || ""

				const comparison = aValue.localeCompare(bValue)
				return this.sortOrder === "asc" ? comparison : -comparison
			})
	}
}
