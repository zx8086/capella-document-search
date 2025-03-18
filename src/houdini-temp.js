// Temporary HoudiniClient implementation until the real one is generated
export class HoudiniClient {
    constructor(config) {
        this.url = config.url;
    }

    async sendRequest({ text, variables = {} }) {
        return fetch(this.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: text,
                variables
            })
        }).then(res => res.json());
    }
} 