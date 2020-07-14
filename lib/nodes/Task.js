const { uid } = require('@hkube/uid');

class Task {
    constructor(options) {
        this.taskId = options.taskId || this._createTaskID();
    }

    _createTaskID() {
        return uid({ length: 8 });
    }
}

module.exports = Task;
