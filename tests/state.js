const { expect } = require('chai');
const clone = require('clone');
const NodesMap = require('../lib/dag/dag');
const Node = require('../lib/dag/node');
const Batch = require('../lib/dag/node-batch');
const pipelines = require('./pipelines.json');

describe('State', () => {
    it('getNodeResults: should not able to get node results', () => {
        const nodesMap = new NodesMap(pipelines[0]);
        expect(() => nodesMap._getNodeResults('not_exists')).to.throw(`unable to find node not_exists`);
    });
    it('getNodeStates: should not able to get node states', () => {
        const nodesMap = new NodesMap(pipelines[0]);
        expect(() => nodesMap.getNodeStates('not_exists')).to.throw(`unable to find node not_exists`);
    });
    it('updateNodeState: should not able to update node status', () => {
        const nodesMap = new NodesMap(pipelines[0]);
        expect(() => nodesMap.updateTaskState('not_exists')).to.throw(`unable to find task not_exists`);
    });
    it('getNodeResults: should get batch results', () => {
        const pipeline = clone(pipelines[0]);
        const nodesMap = new NodesMap(pipeline);
        const node = pipeline.nodes[0];
        const result = { my: 'OK' };
        nodesMap.addBatch(
            new Batch({
                nodeName: node.nodeName,
                batchIndex: 1,
                algorithmName: node.algorithmName,
                result: result
            })
        );
        const results = nodesMap._getNodeResults(node.nodeName);
        expect(results[0]).to.deep.equal(result);
    });
    it('getNodeResults: should get node results', () => {
        const pipeline = clone(pipelines[0]);
        const nodesMap = new NodesMap(pipeline);
        const node = pipeline.nodes[0];
        const result = { my: 'OK' };
        nodesMap.setNode(
            new Node({
                nodeName: node.nodeName,
                algorithmName: node.algorithmName,
                result: result
            })
        );
        const results = nodesMap._getNodeResults(node.nodeName);
        expect(results).to.deep.equal(result);
    });
    it('updateNodeState: should update node status', () => {
        const pipeline = clone(pipelines[0]);
        const nodeName = pipeline.nodes[0].nodeName;
        const nodesMap = new NodesMap(pipeline);
        const node = nodesMap.getNode(nodeName);
        node.taskId = 'should update node status';
        const options = {
            status: 'complete',
            result: { my: 'OK' }
        };
        nodesMap.updateTaskState(node.taskId, options);
        const states = nodesMap.getNodeStates(node.nodeName);
        expect(states[0]).to.equal(options.status);
    });
    it('updateNodeState: should update batch status', () => {
        const pipeline = clone(pipelines[0]);
        const node = pipeline.nodes[0];
        const nodesMap = new NodesMap(pipeline);
        const options = {
            status: 'complete',
            result: { my: 'OK' }
        };
        const batch = new Batch({
            taskId: 'should update batch status',
            nodeName: node.nodeName,
            batchIndex: 1
        });
        nodesMap.addBatch(batch);
        nodesMap.updateTaskState(batch.taskId, options);
        const states = nodesMap.getNodeStates(node.nodeName);
        expect(states[0]).to.equal(options.status);
    });
    it('isAllNodesCompleted: should return false', () => {
        const pipeline = clone(pipelines[0]);
        const node = pipeline.nodes[0];
        const nodesMap = new NodesMap(pipeline);
        nodesMap.addBatch(
            new Batch({
                nodeName: node.nodeName,
                batchIndex: 1,
                status: 'complete'
            })
        );
        const result = nodesMap.isAllNodesCompleted();
        expect(result).to.equal(false);
    });
    it('getAllNodes: should return all nodes', () => {
        const pipeline = clone(pipelines[0]);
        const node = pipeline.nodes[0];
        const nodesMap = new NodesMap(pipeline);
        nodesMap.addBatch(
            new Batch({
                nodeName: node.nodeName,
                batchIndex: 1,
                status: 'complete'
            })
        );
        const result = nodesMap.getAllNodes();
        const resultNodes = result.map(r => r.nodeName);
        const pipelineNodes = pipeline.nodes.map(r => r.nodeName);
        expect(resultNodes).to.have.lengthOf(4);
        expect(resultNodes).to.deep.equal(pipelineNodes);
    });
    it('isAllParentsFinished: should return false', () => {
        const pipeline = clone(pipelines[0]);
        const yellow = pipeline.nodes[1];
        const nodesMap = new NodesMap(pipeline);
        const result = nodesMap.isAllParentsFinished(yellow.nodeName);
        expect(result).to.equal(false);
    });
    it('pipelineResults: should return array', () => {
        const pipeline = clone(pipelines[0]);
        const nodesMap = new NodesMap(pipeline);
        const result = nodesMap.pipelineResults();
        expect(result).to.have.lengthOf(2);
    });
});