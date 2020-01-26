const States = require('../const/NodeStates');

class GraphNode {
    constructor(options) {
        this.nodeName = options.nodeName;
        this.algorithmName = options.algorithmName;
        this.extraData = options.extraData;
        this.input = options.input;
        this.status = States.CREATING;
        this.parentOutput = options.parentOutput;
        this.batch = [];
        this.metrics = options.metrics;
        this.retry = options.retry;
        this.ttl = options.ttl;
        this.includeInResults = options.includeInResults;
    }
}

module.exports = GraphNode;
