const NodeBase = require('./node-base');

class Stateless extends NodeBase {
    constructor(options) {
        super(options);
        this.statelessIndex = options.statelessIndex;
    }
}

module.exports = Stateless;
