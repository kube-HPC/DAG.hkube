class NodeExec {
    constructor(options) {
        this.algorithmExecution = true;
        this.nodeName = options.nodeName;
        this.algorithmName = options.algorithmName;
        this.level = options.level;
        this.batch = [];
    }
}

module.exports = NodeExec;
