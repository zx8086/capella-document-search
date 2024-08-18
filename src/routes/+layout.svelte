<!-- src/routes/+layout.svelte -->

<script>
    import "../app.css";
</script>

<div class="flex flex-col min-h-screen">
    <!-- Header Section -->
    <header class="bg-[#00174f] text-white py-4">
        <div class="container mx-auto text-center">
            <h1>Couchbase Capella Document Search</h1>
        </div>
    </header>

    <main class="flex-grow">
        <slot />
    </main>

    <footer class="bg-[#00174f] text-white py-4 mt-8">
        <div class="container mx-auto text-center">
            <p>
                &copy; {new Date().getFullYear()} PVH. Powered by B2B Platform Engineering.
            </p>
        </div>
    </footer>
</div>
