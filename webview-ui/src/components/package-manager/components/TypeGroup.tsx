import React from "react"
import { cn } from "@/lib/utils"

interface TypeGroupProps {
	type: string
	items: Array<{
		name: string
		description?: string
		metadata?: any
		path?: string
	}>
	className?: string
	searchTerm?: string
}

export const TypeGroup: React.FC<TypeGroupProps> = ({ type, items, className, searchTerm }) => {
	const getTypeLabel = (type: string) => {
		switch (type) {
			case "mode":
				return "Modes"
			case "mcp server":
				return "MCP Servers"
			case "prompt":
				return "Prompts"
			case "package":
				return "Packages"
			default:
				return `${type.charAt(0).toUpperCase()}${type.slice(1)}s`
		}
	}

	if (!items?.length) {
		return null
	}

	// Check if an item matches the search term
	const itemMatchesSearch = (item: { name: string; description?: string }) => {
		if (!searchTerm) return false
		const term = searchTerm.toLowerCase()
		return item.name.toLowerCase().includes(term) || (item.description || "").toLowerCase().includes(term)
	}

	return (
		<div className={cn("mb-4", className)}>
			<h4 className="text-sm font-medium text-vscode-foreground mb-2">{getTypeLabel(type)}</h4>
			<ol className="list-decimal list-inside space-y-1">
				{items.map((item, index) => {
					const matches = itemMatchesSearch(item)
					return (
						<li
							key={`${item.path || index}`}
							className={cn(
								"text-sm pl-1",
								matches ? "text-vscode-foreground font-medium" : "text-vscode-foreground",
							)}
							title={item.path}>
							<span className={cn("font-medium", matches ? "text-vscode-textLink" : "")}>
								{item.name}
							</span>
							{item.description && (
								<span className="text-vscode-descriptionForeground"> - {item.description}</span>
							)}
							{matches && (
								<span className="ml-2 text-xs bg-vscode-badge-background text-vscode-badge-foreground px-1 py-0.5 rounded">
									match
								</span>
							)}
						</li>
					)
				})}
			</ol>
		</div>
	)
}
