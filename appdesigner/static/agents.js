class AgentAPI {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }

    async processUserInstructions(instruction) {
        try {
            const response = await fetch(`${this.baseUrl}/process-user-instructions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ instruction })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error processing instruction:', error);
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
            console.error('Error fetching history:', error);
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
            console.error('Error fetching logs:', error);
            throw error;
        }
    }
}

// Create global instance
const agentAPI = new AgentAPI();

export { AgentAPI, agentAPI };