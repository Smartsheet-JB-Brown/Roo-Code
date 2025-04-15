import { useState, useEffect } from "react"
import { PackageManagerViewStateManager, ViewState } from "./PackageManagerViewStateManager"

export function useStateManager() {
	const [manager] = useState(() => {
		console.log("=== Creating PackageManagerViewStateManager ===")
		return new PackageManagerViewStateManager()
	})

	const [state, setState] = useState(() => {
		const initialState = manager.getState()
		console.log("=== Initializing State ===", {
			allItems: initialState.allItems,
			itemsLength: initialState.allItems.length,
			isFetching: initialState.isFetching,
			activeTab: initialState.activeTab,
		})
		return initialState
	})

	useEffect(() => {
		console.log("=== Setting up state change subscription and message listener ===")
		let updateCount = 0

		const handleStateChange = (newState: ViewState) => {
			updateCount++
			console.log(`=== State Update #${updateCount} Received ===`, {
				allItems: newState.allItems,
				itemsLength: newState.allItems.length,
				isFetching: newState.isFetching,
				activeTab: newState.activeTab,
				previousFetching: state.isFetching,
				stateChanged: JSON.stringify(newState) !== JSON.stringify(state),
			})
			setState(newState)
		}

		const handleMessage = (event: MessageEvent) => {
			console.log("=== Message Event Received ===", {
				type: event.data?.type,
				hasState: !!event.data?.state,
				isFetching: event.data?.state?.isFetching,
				itemCount: event.data?.state?.packageManagerItems?.length,
			})
			manager.handleMessage(event.data)
		}

		window.addEventListener("message", handleMessage)
		const unsubscribe = manager.onStateChange(handleStateChange)

		return () => {
			console.log(`=== Cleaning up state manager (processed ${updateCount} updates) ===`)
			window.removeEventListener("message", handleMessage)
			unsubscribe()
			manager.cleanup()
		}
	}, [manager, state])

	return [state, manager] as const
}
