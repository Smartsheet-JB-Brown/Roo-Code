import React from "react"
import { cn } from "@/lib/utils"

interface TypeGroupProps {
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
					<li
						key={`${item.path || index}`}
						className={cn(
							"text-sm pl-1",
							item.matchInfo?.matched ? "text-vscode-foreground font-medium" : "text-vscode-foreground",
						)}
						title={item.path}>
						<span className={cn("font-medium", item.matchInfo?.matched ? "text-vscode-textLink" : "")}>
							{item.name}
						</span>
						{item.description && (
							<span className="text-vscode-descriptionForeground"> - {item.description}</span>
						)}
						{item.matchInfo?.matched && (
							<span className="ml-2 text-xs bg-vscode-badge-background text-vscode-badge-foreground px-1 py-0.5 rounded">
								match
							</span>
						)}
					</li>
				))}
			</ol>
		</div>
	)
}
