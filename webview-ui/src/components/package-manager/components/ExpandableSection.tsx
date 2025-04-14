import React, { useState } from "react"
import { cn } from "@/lib/utils"

interface ExpandableSectionProps {
	title: string
	children: React.ReactNode
	className?: string
	defaultExpanded?: boolean
}

export const ExpandableSection: React.FC<ExpandableSectionProps> = ({
	title,
	children,
	className,
	defaultExpanded = false,
}) => {
	const [isExpanded, setIsExpanded] = useState(defaultExpanded)

	return (
		<div className={cn("border-t border-vscode-panel-border mt-4", className)}>
			<button
				className="w-full flex items-center justify-between py-2 text-sm text-vscode-foreground hover:text-vscode-textLink"
				onClick={() => setIsExpanded(!isExpanded)}
				aria-expanded={isExpanded}
				aria-controls="details-content">
				<span className="font-medium">{title}</span>
				<span
					className={cn(
						"codicon",
						isExpanded ? "codicon-chevron-down" : "codicon-chevron-right",
						"transition-transform duration-200",
					)}
				/>
			</button>
			<div
				id="details-content"
				className={cn(
					"overflow-hidden transition-[max-height,opacity] duration-200 ease-in-out",
					isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0",
				)}
				role="region"
				aria-labelledby="details-button">
				<div className="py-2">{children}</div>
			</div>
		</div>
	)
}
