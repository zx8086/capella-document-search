// Standard client config - follows documentation pattern
import { backendConfig } from './backend-config';

export default {
    fetchParams() {
        return {
            headers: {
                'Content-Type': 'application/json'
            }
        }
    }
}; 