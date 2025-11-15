class SSEManager {
    constructor() {
        this.clients = new Map(); // tatamiId -> Set<res>
    }

    addClient(tatamiId, res) {
        if (!this.clients.has(tatamiId)) {
            this.clients.set(tatamiId, new Set());
        }
        this.clients.get(tatamiId).add(res);
    }

    removeClient(tatamiId, res) {
        const clients = this.clients.get(tatamiId);
        if (clients) {
            clients.delete(res);
            if (clients.size === 0) {
                this.clients.delete(tatamiId);
            }
        }
    }

    broadcast(tatamiId, event, data) {
        const clients = this.clients.get(tatamiId);
        if (!clients) return;

        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

        clients.forEach(res => {
            try {
                res.write(message);
            } catch (err) {
                this.removeClient(tatamiId, res);
            }
        });
    }
}

module.exports = new SSEManager();