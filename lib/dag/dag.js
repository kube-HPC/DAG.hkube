const EventEmitter = require('events');
const graphlib = require('graphlib');
const groupBy = require('lodash.groupby');
const merge = require('lodash.merge');
let { parser, consts } = require('@hkube/parsers');
const { pipelineKind, stateType, nodeKind } = require('@hkube/consts');
const { GraphNode, ExecNode, ExecBatch, Batch, NodeResult } = require('./index');
const States = require('../const/NodeStates');

const RESERVED_NODE_NAMES = [consts.inputs.FLOW_INPUT, consts.inputs.DATASOURCE];

const defaults = {
    checkFlowInput: false,
    validateNodesRelations: true,
    validateStateType: true
};

/**
 * This class responsible for handling the
 * entire pipeline nodes data structure
 *
 * @class NodesMap
 * @extends {EventEmitter}
 */
class DAG extends EventEmitter {
    constructor(pipeline, options = {}) {
        super();
        if (options.parser) {
            ({ parser, consts } = options.parser);
        }
        this._graph = new graphlib.Graph({ directed: true });
        const config = merge({}, defaults, options);
        this._buildGraph(pipeline, config);
    }

    _buildGraph(pipeline, options) {
        const nodes = pipeline.nodes || [];
        const edges = pipeline.edges || [];

        nodes.forEach((n) => {
            const kind = n.kind || nodeKind.Algorithm;
            if (n.stateType === stateType.Stateful && pipeline.kind === pipelineKind.Batch) {
                throw new Error(`${stateType.Stateful} node "${n.nodeName}" is not allowed on ${pipeline.kind} pipeline`);
            }
            if (kind === nodeKind.Algorithm && !n.algorithmName) {
                throw new Error('please provide algorithm name');
            }
            if (kind === nodeKind.Pipeline && !n.spec?.name) {
                throw new Error('please provide pipeline name');
            }
            if (this.getNode(n.nodeName)) {
                throw new Error(`found duplicate node "${n.nodeName}"`);
            }
            if (RESERVED_NODE_NAMES.includes(n.nodeName)) {
                throw new Error(`pipeline "${pipeline.name}" has invalid reserved name "${n.nodeName}"`);
            }
            if (pipeline.kind === pipelineKind.Stream) {
                if (kind === nodeKind.Algorithm && !n.stateType) {
                    n.stateType = stateType.Stateless; // eslint-disable-line
                }
                else if (kind === nodeKind.Gateway) {
                    n.stateType = stateType.Stateful; // eslint-disable-line
                }
            }
            n.input.forEach((i) => {
                if (options.checkFlowInput) {
                    parser.checkFlowInput({ flowInput: pipeline.flowInput, nodeInput: i });
                }
                const results = parser.extractNodesFromInput(i);
                results.forEach((r) => {
                    const source = r.nodeName;
                    const target = n.nodeName;
                    const nd = nodes.find(f => f.nodeName === source || f.origName === source);
                    if (!nd && options.validateNodesRelations) {
                        throw new Error(`node "${target}" is depend on node "${source}" which is not exists`);
                    }
                    const realNode = nodes.find(f => f.nodeName === source);
                    if (realNode) {
                        if (pipeline.kind === pipelineKind.Stream && realNode.kind !== nodeKind.DataSource) {
                            throw new Error(`the "@" sign is not allowed in "${pipeline.kind}" pipeline, please use the "streaming.flows" property instead`);
                        }
                        const edge = this.getEdge(source, target);
                        if (!edge) {
                            this.setEdge(source, target, { types: [r.type, consts.relations.INPUT] });
                        }
                        else {
                            edge.types.push(r.type);
                        }
                    }
                });
            });
            this._graph.setNode(n.nodeName, GraphNode.create(n));
        });
        edges.forEach((e) => {
            const edge = this.getEdge(e.source, e.target);
            const source = this.getNode(e.source);
            const target = this.getNode(e.target);
            if (!edge && source && target) {
                const types = [consts.relations.WAIT_NODE, ...e.types || []];
                this.setEdge(e.source, e.target, { types });
            }
        });
        const outputs = this.getAllNodes().filter(n => n.kind === nodeKind.Output);
        if (outputs.length > 0 && pipeline.kind === pipelineKind.Stream) {
            throw new Error('Node of type output can not be used in a streaming pipeline');
        }
        const withChilds = outputs.filter(n => this._childs(n.nodeName).length > 0);
        const noParents = outputs.filter(n => this._parents(n.nodeName).length === 0);
        if (withChilds.length) {
            throw new Error(`node "${withChilds[0].nodeName}" should not depend on an output node`);
        }
        if (noParents.length) {
            throw new Error(`output node "${noParents[0].nodeName}" should have input nodes`);
        }
        const sources = this.getSources().map(s => this.getNode(s));
        const statelessNodes = sources.filter(s => s.stateType === stateType.Stateless);
        if (pipeline.kind === pipelineKind.Stream && statelessNodes.length > 0 && options.validateStateType) {
            throw new Error(`entry node "${statelessNodes[0].nodeName}" cannot be ${stateType.Stateless} on ${pipeline.kind} pipeline`);
        }
        if (!graphlib.alg.isAcyclic(this._graph) && pipeline.kind !== pipelineKind.Stream) {
            throw new Error(`cyclic nodes are not allowed on ${pipeline.kind} pipeline`);
        }
        this._addLevels();
    }

    _checkChildNode(source, target, ind) {
        let nodeResults = [];
        let completed = false;
        let index = ind;
        const edges = this.getEdgeTypes(source, target);

        if ((this._isAlgorithmExecution(edges))) {
            return nodeResults;
        }
        if ((this._isWaitAny(edges)) && (this._isWaitNode(edges) || this._isWaitBatch(edges))) {
            index = null;
            completed = this.isAllParentsFinished(target);
        }
        else if (this._isWaitAny(edges) && index) {
            completed = this.isAllParentsFinishedIndex(source, target, index);
            if (!completed) {
                this._markNodeAsShouldRun(source, index);
            }
        }
        else if (this._isWaitNode(edges) || this._isWaitBatch(edges)) {
            index = null;
            completed = this.isAllParentsFinished(target);
        }
        if (completed) {
            nodeResults = this._analyzeResults(target, index);
            nodeResults.forEach((n) => {
                this.emit('node-ready', n);
            });
        }
        return nodeResults;
    }

    _markNodeAsShouldRun(nodeName, index) {
        const node = this.getNode(nodeName);
        const batch = node.batch.find(b => b.batchIndex === index);
        if (batch) {
            batch.shouldRun = true;
        }
    }

    _analyzeResults(target, index) {
        const nodeResults = [];
        const parentOutput = [];
        const parents = this._parents(target);
        parents.forEach((p) => {
            const node = this.getNode(p);
            const edges = this.getEdgeTypes(p, target);
            if (this._isWaitNode(edges)) {
                parentOutput.push({
                    type: consts.relations.WAIT_NODE,
                    node: p,
                    result: this._getNodeResults(node.nodeName)
                });
            }
            if (this._isWaitBatch(edges)) {
                parentOutput.push({
                    type: consts.relations.WAIT_BATCH,
                    node: p,
                    result: this._getNodeResults(node.nodeName)
                });
            }
            if (this._isWaitAny(edges)) {
                if (node.batch.length > 0) {
                    node.batch.forEach((b) => {
                        let shouldAdd = false;
                        if (index && index === b.batchIndex) {
                            b.shouldRun = false; // eslint-disable-line
                            shouldAdd = true;
                        }
                        else if (!index || b.shouldRun) {
                            b.shouldRun = false; // eslint-disable-line
                            shouldAdd = true;
                        }
                        if (shouldAdd) {
                            parentOutput.push({
                                type: consts.relations.WAIT_ANY,
                                node: b.nodeName,
                                result: b.result,
                                index: b.batchIndex
                            });
                        }
                    });
                }
                else {
                    parentOutput.push({
                        type: consts.relations.WAIT_ANY,
                        node: node.nodeName,
                        result: node.result
                    });
                }
            }
        });
        if (parentOutput.length > 0) {
            const group = groupBy(parentOutput, 'index');
            const waitNodes = group.undefined;
            const keys = Object.keys(group);
            delete group.undefined;
            if (waitNodes && keys.length === 1) {
                nodeResults.push({ nodeName: target, parentOutput: waitNodes });
            }
            else {
                Object.entries(group).forEach(([k, v]) => {
                    const ind = parseInt(k, 10);
                    if (waitNodes) {
                        const parentResults = [...waitNodes, ...v];
                        nodeResults.push({ nodeName: target, parentOutput: parentResults, index: ind });
                    }
                    else {
                        nodeResults.push({ nodeName: target, parentOutput: v, index: ind });
                    }
                });
            }
        }
        return nodeResults;
    }

    _isWaitAny(edges) {
        return edges.includes(consts.relations.WAIT_ANY);
    }

    _isAlgorithmExecution(edges) {
        return edges.includes(consts.relations.ALGORITHM_EXECUTION);
    }

    _isWaitNode(edges) {
        return edges.includes(consts.relations.WAIT_NODE);
    }

    _isWaitBatch(edges) {
        return edges.includes(consts.relations.WAIT_BATCH);
    }

    _getNodesAsFlat() {
        const nodes = [];
        const nodesList = this.getAllNodes();
        nodesList.forEach((n) => {
            if (n.batch.length > 0) {
                n.batch.forEach(b => nodes.push(b));
            }
            else {
                nodes.push(n);
            }
        });
        return nodes;
    }

    _isCompleted(status) {
        return [States.SUCCEED, States.FAILED, States.SKIPPED].includes(status);
    }

    _isCompletedOrStoring(status) {
        return [States.SUCCEED, States.FAILED, States.SKIPPED, States.STORING].includes(status);
    }

    _parents(node) {
        return this._graph.predecessors(node);
    }

    _childs(node) {
        return this._graph.successors(node);
    }

    _bfs(start, level) {
        const visited = new Set();
        const queue = [{ nodeName: start, nodeLevel: level }];
        while (queue.length > 0) {
            const { nodeName, nodeLevel } = queue.shift();
            const node = this.getNode(nodeName);
            const targets = this._childs(nodeName);
            node.level = Math.max(node.level, nodeLevel);

            for (const t of targets) { // eslint-disable-line
                if (!visited.has(t)) {
                    visited.add(t);
                    queue.push({ nodeName: t, nodeLevel: nodeLevel + 1 });
                }
            }
        }
    }

    _addLevels() {
        this.getAllNodes().forEach((n) => {
            n.level = -1; // eslint-disable-line
        });
        this._graph.sources().forEach(s => this._bfs(s, 0));
    }

    extractPaths(nodeName) {
        const paths = [];
        const childs = this._childs(nodeName);
        childs.forEach((c) => {
            const child = this.getNode(c);
            child.input.forEach((i) => {
                const nodes = parser.extractNodesFromInput(i)
                    .filter(n => n.nodeName === nodeName)
                    .map(n => n.path);
                paths.push(...nodes);
            });
        });
        return paths;
    }

    updateCompletedTask(task) {
        const childs = this._childs(task.nodeName);
        if (childs) {
            return childs.map(child => this._checkChildNode(task.nodeName, child, task.batchIndex));
        }
        return null;
    }

    getNode(name) {
        return this._graph.node(name);
    }

    _getNodeResults(nodeName) {
        let results = null;
        const node = this.getNode(nodeName);
        if (!node) {
            throw new Error(`unable to find node ${nodeName}`);
        }
        if (node.status === States.SKIPPED) {
            results = [];
        }
        else if (node.batch.length > 0) {
            results = node.batch.map(n => n.result);
        }
        else {
            results = node.result;
        }
        return results;
    }

    addBatch(batch) {
        const node = this.getNode(batch.nodeName);
        if (node) {
            node.batch.push(batch);
        }
    }

    addBatchList(nodeName, batch) {
        const node = this.getNode(nodeName);
        if (node) {
            node.batch.push(...batch);
        }
    }

    setNode(node) {
        const n = this.getNode(node.nodeName);
        if (n) {
            merge(n, node);
        }
    }

    updateTaskState(taskId, state) {
        const task = this.getNodeByTaskID(taskId);
        if (!task) {
            throw new Error(`unable to find task ${taskId}`);
        }
        if (state.warning) {
            task.warnings = task.warnings || [];
            task.warnings.push(state.warning);
        }
        merge(task, state);
        return task;
    }

    addTaskToBatch(options) {
        const { taskId, nodeName } = options;
        const node = this.getNode(nodeName);
        if (!node) {
            throw new Error(`unable to find node ${nodeName}`);
        }
        const batch = node.batch.find(e => e.taskId === taskId);
        if (!batch) {
            node.batch.push(new Batch(options));
        }
        return node;
    }

    removeTaskFromBatch(options) {
        const { taskId, nodeName } = options;
        const node = this.getNode(nodeName);
        if (!node) {
            throw new Error(`unable to find node ${nodeName}`);
        }
        const index = node.batch.findIndex(e => e.taskId === taskId);
        if (index !== -1) {
            node.batch.splice(index, 1);
        }
        return node;
    }

    updateAlgorithmExecution(options) {
        const { taskId, nodeName, parentNodeName, status, error, result } = options;
        const node = this.getNode(parentNodeName);
        if (!node) {
            throw new Error(`unable to find node ${parentNodeName}`);
        }
        const execNodeParams = { ...options, nodeName, level: node.level + 1 };
        let execNode = this.getNode(nodeName);
        if (!execNode) {
            execNode = new ExecNode(execNodeParams);
            this._graph.setNode(nodeName, execNode);
            this.setEdge(parentNodeName, nodeName, { types: [consts.relations.ALGORITHM_EXECUTION] });
        }

        let execBatch = execNode.batch.find(e => e.taskId === taskId);
        if (!execBatch) {
            execBatch = new ExecBatch({ ...execNodeParams, batchIndex: execNode.batch.length + 1 });
            execNode.batch.push(execBatch);
        }
        else {
            merge(execBatch, { status, error, result });
        }
        return execBatch;
    }

    getNodeStates(nodeName) {
        const states = [];
        const node = this.getNode(nodeName);
        if (!node) {
            throw new Error(`unable to find node ${nodeName}`);
        }
        if (node.batch.length > 0) {
            states.push(...node.batch.map(n => n.status));
        }
        else {
            states.push(node.status);
        }
        return states;
    }

    getEdge(source, target) {
        return this._graph.edge(source, target);
    }

    updateEdge(source, target, value) {
        const oldValue = this.getEdge(source, target);
        const newValue = { ...oldValue, ...value };
        this.setEdge(source, target, newValue);
    }

    setEdge(source, target, value) {
        this._graph.setEdge(source, target, value);
    }

    getEdgeTypes(source, target) {
        const edge = this._graph.edge(source, target);
        return (edge && edge.types) || [];
    }

    getEdges() {
        return this._graph.edges().map(e => ({ source: e.v, target: e.w, value: this.getEdge(e.v, e.w) }));
    }

    isAllNodesCompleted() {
        const nodes = this._getNodesAsFlat();
        const states = nodes.map(n => n.status);
        return states.every(this._isCompleted);
    }

    isNodeCompleted(nodeName) {
        const states = this.getNodeStates(nodeName);
        return states.every(this._isCompleted);
    }

    getJSONGraph() {
        return graphlib.json.write(this._graph);
    }

    setJSONGraph(graph) {
        this._graph = graphlib.json.read(graph);
    }

    getAllNodes() {
        const nodes = this._graph.nodes();
        return nodes.map(n => this.getNode(n));
    }

    getSources() {
        return this._graph.sources();
    }

    getSinks() {
        return this._graph.sinks();
    }

    isAllParentsFinished(node) {
        const parents = this._parents(node);
        let states = [];
        parents.forEach((p) => {
            states = states.concat(this.getNodeStates(p));
        });
        return states.every(this._isCompletedOrStoring);
    }

    _parentNodes(node) {
        const parents = this._parents(node);
        return parents.map(p => this.getNode(p));
    }

    isAllParentsFinishedIndex(source, target, index) {
        const parents = this._parents(target);
        const states = [];
        parents.forEach((p) => {
            const node = this.getNode(p);
            const edges = this.getEdgeTypes(p, target);
            if (this._isWaitAny(edges) && p !== source) {
                const batch = node.batch.find(b => b.batchIndex === index);
                batch && states.push(batch.status);
            }
            if (this._isWaitNode(edges) || this._isWaitBatch(edges)) {
                states.push(...this.getNodeStates(p));
            }
        });
        return states.every(this._isCompletedOrStoring);
    }

    getParentsResultsIndex(nodeName, index) {
        const parents = this._parents(nodeName);
        return parents.map((p) => {
            const node = this.getNode(p);
            const batch = node.batch.find(b => b.batchIndex === index);
            return { parent: p, result: batch.result };
        });
    }

    pipelineResults() {
        const results = [];
        const nodes = this.getAllNodes().filter(n => !n.algorithmExecution);
        nodes.forEach((n) => {
            const childs = this._childs(n.nodeName).map(c => this.getNode(c)).filter(e => !e.algorithmExecution);
            if (childs.length === 0 || n.includeInResults) {
                if (n.batch.length > 0) {
                    n.batch.forEach(b => results.push(new NodeResult(b)));
                }
                else {
                    results.push(new NodeResult(n));
                }
            }
        });
        return results;
    }

    getNodeByTaskID(taskId) {
        const nodes = this._getNodesAsFlat();
        return nodes.find(n => n.taskId === taskId);
    }
}

module.exports = DAG;
