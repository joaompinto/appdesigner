class AgentAPI {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
        this.maxRetries = 3;
    }

    async processUserInstructions(instruction, counter = 1, retryCount = 0) {
        try {
            const response = await fetch(`${this.baseUrl}/process-user-instructions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    instruction,
                    counter 
                })
            });

            if (!response.ok) {
                const error = await response.json();
                if (error?.error?.type === 'overloaded_error') {
                    // Return special error object for overloaded state
                    throw {
                        type: 'overloaded',
                        retryCount,
                        maxRetries: this.maxRetries,
                        retry: async () => this.processUserInstructions(instruction, counter, retryCount + 1)
                    };
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            throw error;
        }
    }

    async getHistory() {
        try {
            const response = await fetch(`${this.baseUrl}/api/history`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            throw error;
        }
    }

    async getLogs() {
        try {
            const response = await fetch(`${this.baseUrl}/api/logs`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            throw error;
        }
    }
}

// Create global instance
const agentAPI = new AgentAPI();

export { AgentAPI, agentAPI };