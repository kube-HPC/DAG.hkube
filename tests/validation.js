const { expect } = require('chai');
const NodesMap = require('../lib/dag/dag');
const pipelines = require('./pipelines.json');

describe('Validation', () => {
    it('should throw stateful node is not allowed on batch pipeline', () => {
        const pipeline = {
            name: "pipeline",
            kind: "batch",
            nodes: [{
                nodeName: "A",
                algorithmName: "green-alg",
                input: ["data"],
                stateType: "stateful"
            }]
        }
        expect(() => new NodesMap(pipeline)).to.throw('stateful node "A" is not allowed on batch pipeline');
    });
    it('should throw missing algorithmName', () => {
        const pipeline = {
            name: "pipeline",
            nodes: [{
                nodeName: "A",
                kind: "algorithm",
                input: ["data"],
            }]
        }
        expect(() => new NodesMap(pipeline)).to.throw('please provide algorithm name');
    });
    it('should throw missing pipelineName', () => {
        const pipeline = {
            name: "pipeline",
            nodes: [{
                nodeName: "A",
                kind: "pipeline",
                input: ["data"],
            }]
        }
        expect(() => new NodesMap(pipeline)).to.throw('please provide pipeline name');
    });
    it('should throw found duplicate node', () => {
        const pipeline = {
            name: "pipeline",
            nodes: [{
                nodeName: "A",
                algorithmName: "green-alg",
                input: ["data"],
            },
            {
                nodeName: "A",
                algorithmName: "green-alg",
                input: ["data"],
            }]
        }
        expect(() => new NodesMap(pipeline)).to.throw('found duplicate node "A"');
    });
    it('should throw reserved name flowInput', () => {
        const pipeline = {
            name: "pipeline",
            nodes: [{
                nodeName: "flowInput",
                algorithmName: "green-alg",
                input: ["data"],
            }]
        }
        expect(() => new NodesMap(pipeline)).to.throw('pipeline "pipeline" has invalid reserved name "flowInput"');
    });
    it('should throw reserved name dataSource', () => {
        const pipeline = {
            name: "pipeline",
            nodes: [{
                nodeName: "dataSource",
                algorithmName: "green-alg",
                input: ["data"],
            }]
        }
        expect(() => new NodesMap(pipeline)).to.throw('pipeline "pipeline" has invalid reserved name "dataSource"');
    });
    it('should throw node depend on non-exists node', () => {
        const pipeline = {
            name: "pipeline",
            nodes: [{
                nodeName: "A",
                algorithmName: "green-alg",
                input: ["@NOOP"],
            }]
        }
        expect(() => new NodesMap(pipeline)).to.throw('node "A" is depend on node "NOOP" which is not exists');
    });
    it('should throw unable to find flowInput', () => {
        const pipeline = {
            name: "pipeline",
            nodes: [{
                nodeName: "A",
                algorithmName: "green-alg",
                input: ["@flowInput.noop"]
            }]
        }
        expect(() => new NodesMap(pipeline, { checkFlowInput: true })).to.throw('unable to find flowInput.noop');
    });
    it('should throw entry node stateless on stream pipeline', () => {
        const pipeline = {
            name: "pipeline",
            kind: "stream",
            nodes: [{
                nodeName: "A",
                kind: "algorithm",
                algorithmName: "green-alg",
                input: ["data"]
            }]
        }
        expect(() => new NodesMap(pipeline, { checkFlowInput: true })).to.throw('entry node "A" cannot be stateless on stream pipeline');
    });
    it('should throw pipeline has cyclic nodes', () => {
        const pipeline = {
            name: "pipeline",
            kind: "batch",
            nodes: [{
                nodeName: "A",
                algorithmName: "green-alg",
                input: ["@B"]
            },
            {
                nodeName: "B",
                algorithmName: "green-alg",
                input: ["@A"]
            }]
        }
        expect(() => new NodesMap(pipeline, { checkFlowInput: true })).to.throw('cyclic nodes are not allowed on batch pipeline');
    });
    it('should build graph', () => {
        const pipeline = pipelines.find(p => p.name === 'dataSource-stream');
        const nodesMap = new NodesMap(pipeline);
        expect(nodesMap).to.exist;
    });
    it('should throw @ sign is not allowed', () => {
        const pipeline = pipelines.find(p => p.name === 'relations-stream');
        expect(() => new NodesMap(pipeline)).to.throw('the "@" sign is not allowed in "stream" pipeline, please use the "streaming.flows" property instead');
    });
});