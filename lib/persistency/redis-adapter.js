
const pathLib = require('path');
const { Factory } = require('@hkube/redis-utils');
const PREFIX_GRAPH_PATH = 'hkube:pipeline:graph';

class RedisAdapter {
    constructor(options) {
        this._client = Factory.getClient(options);
    }

    setGraph({ jobId, data }) {
        const path = pathLib.join('/', PREFIX_GRAPH_PATH, jobId);
        return this._set(path, data);
    }

    getGraph({ jobId }) {
        const path = pathLib.join('/', PREFIX_GRAPH_PATH, jobId);
        return this._get(path);
    }

    _set(path, options) {
        return new Promise((resolve, reject) => {
            this._client.set(path, JSON.stringify(options), (err, res) => {
                if (err) {
                    return reject(err);
                }
                return resolve(res);
            });
        });
    }

    _get(path) {
        return new Promise((resolve, reject) => {
            this._client.get(path, (err, res) => {
                if (err) {
                    return reject(err);
                }
                return resolve(res);
            });
        });
    }
}

module.exports = RedisAdapter;
