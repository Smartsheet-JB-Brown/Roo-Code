import React from "react"
import { cn } from "@/lib/utils"
import { formatItemText } from "../utils/grouping"

interface TypeGroupProps {
	type: string
	items: Array<{
		name: string
		description?: string
		metadata?: any
		path?: string
	}>
	className?: string
}

export const TypeGroup: React.FC<TypeGroupProps> = ({ type, items, className }) => {
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

	return (
		<div className={cn("mb-4", className)}>
			<h4 className="text-sm font-medium text-vscode-foreground mb-2">{getTypeLabel(type)}</h4>
			<ol className="list-decimal list-inside space-y-1">
				{items.map((item, index) => (
					<li key={`${item.path || index}`} className="text-sm text-vscode-foreground pl-1" title={item.path}>
						<span className="text-vscode-descriptionForeground">{formatItemText(item)}</span>
					</li>
				))}
			</ol>
		</div>
	)
}
