import { QueryStore } from '../runtime/stores/query'
import artifact from '$houdini/artifacts/SearchDocuments'
import { initClient } from '$houdini/plugins/houdini-svelte/runtime/client'

export class SearchDocumentsStore extends QueryStore {
	constructor() {
		super({
			artifact,
			storeName: "SearchDocumentsStore",
			variables: true,
		})
	}
}

export async function load_SearchDocuments(params) {
	await initClient()

	const store = new SearchDocumentsStore()

	await store.fetch(params)

	return {
		SearchDocuments: store,
	}
}
