const dbConnect = require('@hkube/db');

class MongoDbAdapter {
    constructor() {
        this._db = null;
    }

    async init(options) {
        const { provider, ...config } = options;
        this._db = dbConnect(config, provider);
        await this._db.init();
    }

    setGraph({ jobId, data }) {
        return this._db.jobs.updateGraph({ jobId, graph: data });
    }

    async getGraph({ jobId }) {
        const res = await this._db.jobs.fetchGraph({ jobId });
        if (!res) {
            return null;
        }
        if (Object.keys(res).length === 1 && res.jobId) {
            return null;
        }
        return res;
    }
}

module.exports = MongoDbAdapter;
