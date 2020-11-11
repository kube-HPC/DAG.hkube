const RedisAdapter = require('./redis-adapter');

class Persistency {
    constructor(config) {
        const options = config || {};
        const { type, connection } = options;
        switch (type) {
            case 'redis':
                this._adapter = new RedisAdapter(connection);
                break;
            default:
                this._adapter = new RedisAdapter(connection);
                break;
        }
    }

    setGraph(...args) {
        return this._adapter.setGraph(...args);
    }

    getGraph(...args) {
        return this._adapter.getGraph(...args);
    }
}

module.exports = Persistency;
