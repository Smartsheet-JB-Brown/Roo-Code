import { PackageManagerItem } from "../../../../../src/services/package-manager/types"

export interface GroupedItems {
	[type: string]: {
		type: string
		items: Array<{
			name: string
			description?: string
			metadata?: any
			path?: string
			matchInfo?: {
				matched: boolean
				matchReason?: Record<string, boolean>
			}
		}>
	}
}

/**
 * Groups package items by their type
 * @param items Array of items to group
 * @returns Object with items grouped by type
 */
export function groupItemsByType(items: PackageManagerItem["items"] = []): GroupedItems {
	if (!items?.length) {
		return {}
	}

	return items.reduce((groups: GroupedItems, item) => {
		if (!item.type) {
			return groups
		}

		if (!groups[item.type]) {
			groups[item.type] = {
				type: item.type,
				items: [],
			}
		}

		groups[item.type].items.push({
			name: item.metadata?.name || "Unnamed item",
			description: item.metadata?.description,
			metadata: item.metadata,
			path: item.path,
			matchInfo: item.matchInfo,
		})

		return groups
	}, {})
}

/**
 * Gets a formatted string representation of an item
 * @param item The item to format
 * @returns Formatted string with name and description
 */
export function formatItemText(item: { name: string; description?: string }): string {
	if (!item.description) {
		return item.name
	}

	// Truncate description if it's too long
	const maxDescriptionLength = 100
	const description =
		item.description.length > maxDescriptionLength
			? `${item.description.substring(0, maxDescriptionLength)}...`
			: item.description

	return `${item.name} - ${description}`
}

/**
 * Gets the total number of items across all groups
 * @param groups Grouped items object
 * @returns Total number of items
 */
export function getTotalItemCount(groups: GroupedItems): number {
	return Object.values(groups).reduce((total, group) => total + group.items.length, 0)
}

/**
 * Gets an array of unique types from the grouped items
 * @param groups Grouped items object
 * @returns Array of type strings
 */
export function getUniqueTypes(groups: GroupedItems): string[] {
	return Object.keys(groups).sort()
}
