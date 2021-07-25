const Task = require('./Task');
const States = require('../const/NodeStates');

class NodeBase extends Task {
    constructor(options) {
        super(options);
        this.nodeName = options.nodeName;
        this.algorithmName = options.algorithmName;
        this.extraData = options.extraData;
        this.input = options.input;
        this.storage = options.storage;
        this.status = options.status || States.CREATING;
        this.error = options.error;
        this.result = options.result;
        this.stateType = options.stateType;
    }
}

module.exports = NodeBase;
