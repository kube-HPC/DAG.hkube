const MongoDbAdapter = require('./mongodb-adapter');

class Persistency {
    async init(config) {
        const options = config || {};
        const { type, connection } = options;
        switch (type) {
            case 'mongodb':
            default:
                this._adapter = new MongoDbAdapter();
                await this._adapter.init(connection);
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
