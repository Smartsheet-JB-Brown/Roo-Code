import { PackageManagerItem } from "@services/package-manager"

export class PackageManagerViewStateManager {
	private items: PackageManagerItem[] = []
	private sortBy: "name" | "lastUpdated" = "name"
	private sortOrder: "asc" | "desc" = "asc"

	setItems(items: PackageManagerItem[]) {
		this.items = items
	}

	setSortBy(sortBy: "name" | "lastUpdated") {
		this.sortBy = sortBy
	}

	setSortOrder(sortOrder: "asc" | "desc") {
		this.sortOrder = sortOrder
	}

	getFilteredAndSortedItems(): PackageManagerItem[] {
		return [...this.items].sort((a, b) => {
			const aValue = this.sortBy === "name" ? a.name : a.lastUpdated || ""
			const bValue = this.sortBy === "name" ? b.name : b.lastUpdated || ""

			const comparison = aValue.localeCompare(bValue)
			return this.sortOrder === "asc" ? comparison : -comparison
		})
	}
}
