<!-- src/lib/components/CompletedProgress.svelte -->

<script lang="ts">
interface Props {
  completedNodes: string[];
  completedTools: { name: string; duration?: number }[];
  activeNode?: string;
  activeTool?: string;
  isProcessing?: boolean;
  responseTime?: number;
}

let {
  completedNodes,
  completedTools,
  activeNode,
  activeTool,
  isProcessing = false,
  responseTime,
}: Props = $props();

let isExpanded = $state(true);

// Node configuration with display names (matching langgraph-agent.ts node order)
const nodeConfig: Record<string, { label: string; activeLabel: string }> = {
  classify: { label: "Analyzed", activeLabel: "Analyzing..." },
  retriever: { label: "Fetched", activeLabel: "Fetching..." },
  toolRouter: { label: "Routed", activeLabel: "Routing..." },
  tools: { label: "Tools", activeLabel: "Running Tools..." },
  responder: { label: "Generated", activeLabel: "Generating..." },
};

function getToolDisplayName(toolName: string): string {
  return toolName
    .replace(/_tool$/, "")
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return "<1s";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}

// Order nodes for display (matching langgraph-agent.ts workflow)
const orderedNodes = ["classify", "retriever", "toolRouter", "tools", "responder"];

// Count only the completed nodes that are visible (match our nodeConfig)
const visibleCompletedCount = $derived(
  orderedNodes.filter((nodeId) => completedNodes.includes(nodeId)).length
);

// Check if tools were used (tools node completed or currently active)
const toolsUsed = $derived(
  completedNodes.includes("tools") ||
    activeNode === "tools" ||
    completedTools.length > 0 ||
    activeTool
);

const hasContent = $derived(isProcessing || visibleCompletedCount > 0 || completedTools.length > 0);
</script>

{#if hasContent}
	<div class="progress-container mb-2 text-xs">
		<button
			class="flex w-full items-center justify-between rounded-lg border px-3 py-2 transition-all duration-200
				{isProcessing
					? 'border-blue-200 bg-gradient-to-r from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200'
					: 'border-green-200 bg-gradient-to-r from-green-50 to-green-100 hover:from-green-100 hover:to-green-200'}
				{isExpanded ? 'rounded-b-none border-b-transparent' : ''}"
			onclick={() => (isExpanded = !isExpanded)}
			aria-expanded={isExpanded}
		>
			<div class="flex items-center gap-2">
				{#if isProcessing}
					<!-- Spinner during processing -->
					<div class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
					<span class="font-medium text-blue-800">
						{#if activeNode}
							{nodeConfig[activeNode]?.activeLabel || `Running ${activeNode}...`}
						{:else if activeTool}
							Executing {getToolDisplayName(activeTool)}...
						{:else}
							Processing...
						{/if}
						{#if visibleCompletedCount > 0}
							<span class="font-normal text-blue-500">({visibleCompletedCount} done)</span>
						{/if}
					</span>
				{:else}
					<!-- Checkmark when complete -->
					<svg class="h-3.5 w-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<span class="font-medium text-green-800">
						{visibleCompletedCount} steps completed
						{#if completedTools.length > 0}
							<span class="font-normal text-green-500"
								>({completedTools.length} tool{completedTools.length !== 1 ? "s" : ""})</span
							>
						{/if}
						{#if responseTime}
							<span class="ml-1 font-normal text-gray-500">in {formatDuration(responseTime)}</span>
						{/if}
					</span>
				{/if}
			</div>
			<svg
				class="h-4 w-4 transition-transform duration-200 {isExpanded ? 'rotate-180' : ''} {isProcessing ? 'text-blue-800' : 'text-green-800'}"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</button>

		{#if isExpanded}
			<div class="rounded-b-lg border border-t-0 p-3 {isProcessing ? 'border-blue-200 bg-blue-50' : 'border-green-200 bg-green-50'}">
				<!-- Nodes - show all stages -->
				<div class="flex flex-wrap gap-1.5">
					{#each orderedNodes as nodeId (nodeId)}
						{@const config = nodeConfig[nodeId]}
						{@const isActive = nodeId === activeNode}
						{@const isCompleted = completedNodes.includes(nodeId)}
						{@const isToolsNode = nodeId === "tools"}
						{@const isPending = !isActive && !isCompleted}
						{@const showAsGrey = isPending || (isToolsNode && !toolsUsed && !isProcessing)}
						<div
							class="flex items-center gap-1 rounded-full px-2 py-1 text-[0.625rem] font-medium
								{isActive
									? 'bg-blue-100 text-blue-700 border border-blue-300'
									: isCompleted && !(isToolsNode && !toolsUsed)
										? 'bg-green-100 text-green-700'
										: 'bg-gray-100 text-gray-400'}"
						>
							{#if isActive}
								<div class="h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
							{:else if isCompleted && !(isToolsNode && !toolsUsed)}
								<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M5 13l4 4L19 7"
									/>
								</svg>
							{/if}
							<span>{isActive ? config?.activeLabel?.replace("...", "") || nodeId : config?.label || nodeId}</span>
						</div>
					{/each}
				</div>

				<!-- Tools -->
				{#if completedTools.length > 0 || activeTool}
					<div class="mt-2 border-t pt-2 {isProcessing ? 'border-blue-200' : 'border-green-200'}">
						<div class="mb-1 text-[0.625rem] font-semibold uppercase tracking-wide text-slate-500">
							Tool Use:
						</div>
						<div class="flex flex-wrap gap-1.5">
							{#each completedTools as tool, index (`${tool.name}-${index}`)}
								<div
									class="flex items-center gap-1 rounded-md border border-green-300 bg-green-100 px-2 py-1 text-[0.625rem] font-medium text-green-700"
								>
									<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M5 13l4 4L19 7"
										/>
									</svg>
									<span>{getToolDisplayName(tool.name)}</span>
									{#if tool.duration !== undefined}
										<span class="font-normal text-gray-500">({formatDuration(tool.duration)})</span>
									{/if}
								</div>
							{/each}
							{#if activeTool}
								<div
									class="flex items-center gap-1 rounded-md border border-blue-300 bg-blue-100 px-2 py-1 text-[0.625rem] font-medium text-blue-700"
								>
									<div class="h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
									<span>{getToolDisplayName(activeTool)}</span>
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.progress-container {
		width: 100%;
	}
</style>
