const States = require('../const/NodeStates');

class GraphNode {
    create(options) {
        return {
            status: States.CREATING,
            batch: [],
            ...options
        };
    }
}

module.exports = new GraphNode();
