<script lang="ts">
import { Button as ButtonPrimitive } from "bits-ui";
import { cn } from "$lib/utils.js";
import { buttonVariants, type Props } from "./index.js";

type $$Props = Props;

interface Props_1 {
  class?: $$Props["class"];
  variant?: $$Props["variant"];
  size?: $$Props["size"];
  children?: import("svelte").Snippet;
  [key: string]: any;
}

let {
  class: className = undefined,
  variant = "default",
  size = "default",
  children,
  ...rest
}: Props_1 = $props();
</script>

<ButtonPrimitive.Root
    class={cn(buttonVariants({ variant, size, className }))}
    type="button"
    {...rest}
>
    {@render children?.()}
</ButtonPrimitive.Root>
