class ExecBatch {
    constructor(options) {
        this.execId = options.execId;
        this.taskId = options.taskId;
        this.status = options.status;
        this.batchIndex = options.batchIndex;
        this.nodeName = options.nodeName;
        this.algorithmName = options.algorithmName;
        this.level = options.level;
    }
}

module.exports = ExecBatch;
