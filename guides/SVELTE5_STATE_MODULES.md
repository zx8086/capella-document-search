# Svelte 5 State Modules (.svelte.ts)

This guide documents the pattern for creating shared reactive state modules in Svelte 5 using runes.

## Overview

Svelte 5 introduces `.svelte.ts` modules that can use runes (`$state`, `$derived`, `$effect`) outside of components. These replace the traditional `writable()`/`readable()` stores from `svelte/store`.

## Benefits Over Traditional Stores

1. **No subscriptions required** - Direct property access with automatic reactivity
2. **Better TypeScript support** - Full type inference without manual type assertions
3. **Cleaner API** - No `$` prefix needed, no `get()` calls
4. **Unified reactivity model** - Same patterns in components and modules

## Pattern Template

```typescript
// src/lib/stores/example.svelte.ts

import type { ExampleType } from "../../models/example";

interface ExampleState {
  items: ExampleType[];
  isLoading: boolean;
  error: string | null;
}

function createExampleStore() {
  // Reactive state using $state rune
  let state = $state<ExampleState>({
    items: [],
    isLoading: false,
    error: null,
  });

  // Async actions
  async function fetchItems(): Promise<boolean> {
    state.isLoading = true;
    state.error = null;

    try {
      const response = await fetch("/api/example");
      const data = await response.json();

      if (data.error) {
        state.error = data.error;
        state.isLoading = false;
        return false;
      }

      state.items = data.items ?? [];
      state.isLoading = false;
      return true;
    } catch (error) {
      state.error = error instanceof Error ? error.message : "Unknown error";
      state.isLoading = false;
      return false;
    }
  }

  // Sync actions
  function set(items: ExampleType[]) {
    state.items = items;
  }

  function reset() {
    state.items = [];
    state.error = null;
  }

  // Return getters for reactive read access + methods
  return {
    get items() {
      return state.items;
    },
    get isLoading() {
      return state.isLoading;
    },
    get error() {
      return state.error;
    },
    fetchItems,
    set,
    reset,
  };
}

export const exampleStore = createExampleStore();
```

## Usage in Components

### Before (Traditional Store)

```svelte
<script lang="ts">
import { onMount } from "svelte";
import { get } from "svelte/store";
import { exampleStore } from "$lib/stores/exampleStore";

let items = $state([]);

onMount(() => {
  const unsubscribe = exampleStore.subscribe((value) => {
    items = value;
  });

  exampleStore.fetch();

  return () => unsubscribe();
});
</script>

{#each items as item}
  <div>{item.name}</div>
{/each}
```

### After (Runes-based Module)

```svelte
<script lang="ts">
import { onMount } from "svelte";
import { exampleStore } from "$lib/stores/example.svelte";

onMount(() => {
  exampleStore.fetchItems();
});
</script>

{#each exampleStore.items as item}
  <div>{item.name}</div>
{/each}
```

## Reactive Derived State

For derived values, use `$derived` in the store:

```typescript
function createCartStore() {
  let state = $state({
    items: [] as CartItem[],
  });

  // Derived values computed automatically
  const totalItems = $derived(state.items.reduce((sum, item) => sum + item.quantity, 0));
  const totalPrice = $derived(state.items.reduce((sum, item) => sum + item.price * item.quantity, 0));

  return {
    get items() { return state.items; },
    get totalItems() { return totalItems; },
    get totalPrice() { return totalPrice; },
    addItem(item: CartItem) {
      state.items = [...state.items, item];
    },
  };
}
```

## Reacting to Store Changes

Use `$effect` in components to react to store changes:

```svelte
<script lang="ts">
import { exampleStore } from "$lib/stores/example.svelte";

$effect(() => {
  // This runs whenever exampleStore.items changes
  console.log("Items updated:", exampleStore.items.length);
});
</script>
```

## Migration Checklist

When converting a traditional store to a `.svelte.ts` module:

1. [ ] Rename file from `*.ts` to `*.svelte.ts`
2. [ ] Replace `writable<T>()` with `$state<T>()`
3. [ ] Replace `derived()` with `$derived()`
4. [ ] Remove `subscribe`, `set`, `update` from exports
5. [ ] Add getter properties for reactive state access
6. [ ] Update all consumer imports to use new path
7. [ ] Replace `.subscribe()` calls with `$effect()` or direct access
8. [ ] Remove `get()` calls - use direct property access instead
9. [ ] Run `bun run check` to verify no type errors

## File Naming Convention

- Traditional stores: `exampleStore.ts`
- Runes-based modules: `example.svelte.ts`

The `.svelte.ts` extension signals that the file uses Svelte runes.

## Reference Implementation

See `src/lib/stores/collections.svelte.ts` for a complete example of this pattern in production.
